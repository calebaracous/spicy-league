# Architecture

High-level map of what's actually shipped. For the aspirational roadmap see
[PLANNING.md](../PLANNING.md) — it is *not* the current state (e.g. PLANNING
says Auth.js, we ship Better Auth; PLANNING says magic links, we ship
email/password with email verification).

## Stack as shipped

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui primitives + custom design tokens |
| Auth | [`better-auth`](https://better-auth.com) w/ Drizzle adapter, email + password, email verification via Resend |
| Database | Neon Postgres via `@neondatabase/serverless` |
| ORM | Drizzle ORM (`drizzle-kit` for migrations) |
| Realtime (draft) | Server-Sent Events polling the DB every 2s — no Pusher/Ably |
| Rate limiting | Upstash Redis (optional — falls open if env vars missing) |
| Email | Resend |
| Cron | Vercel Cron — daily Riot stat refresh |
| Validation | zod |

Detail per concern: [AUTH.md](AUTH.md), [DATA-MODEL.md](DATA-MODEL.md),
[INTEGRATIONS.md](INTEGRATIONS.md), [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Directory layout

```
src/
  app/                  # Next.js App Router. Routes, server actions, SSR pages.
    _sections/          # Home-page section components (Hero, About, etc).
    admin/              # Admin-only pages. Every server action is wrapped in requireAdmin().
    api/                # Route handlers — better-auth, draft SSE, cron.
    seasons/            # Public season pages + server actions (signup, draft, matches).
    globals.css         # Design tokens + shadcn tokens + animation utilities.
    layout.tsx          # Root layout: SiteHeader + main + SiteFooter.
    template.tsx        # Per-route fade-in animation wrapper.
    page.tsx            # Home landing — sectioned, pulls live season from DB.
  auth.ts               # Thin wrapper that returns an AppSession-shaped object.
  components/
    ui/                 # shadcn primitives + freelance-style primitives (Reveal, Tag, etc).
    site-header.tsx     # Server component. Calls auth(), passes to client.
    site-header-client.tsx  # Sticky nav, scroll blur, mobile menu.
    site-footer.tsx     # Two-column footer.
  db/
    client.ts           # drizzle(neon()) instance. Exports `db` and `schema`.
    schema/             # One file per domain — auth, seasons, drafts, matches, stats.
  lib/
    auth.ts             # Better Auth config. Drizzle adapter, Resend email, session cookies.
    auth-client.ts      # Client-side better-auth/react — signIn, signUp, useSession.
    auth-helpers.ts     # requireAuth / requireAdmin / requireOnboarded for server code.
    draft.ts            # Snake-order math + draft snapshot query + finalizeDraft.
    schedule.ts         # Round-robin circle method + standings + playoff seeding.
    seasons.ts          # State machine (transitions, labels) + slug helpers.
    riot-api.ts         # Riot API client — accounts, ranked, mastery, Data Dragon.
    stat-refresh.ts     # Refresh one or all Riot stat snapshots.
    rate-limit.ts       # Upstash sliding-window limiter (optional).
    env.ts              # Zod-validated env via @t3-oss/env-nextjs.
    utils.ts            # cn() — clsx + tailwind-merge.
  types/                # Empty placeholder directory.
drizzle/                # Generated migrations (sequential 0000_… 0006_…).
docs/                   # You are here.
```

## Request lifecycle

Everything is server-rendered on demand — all pages export
`export const dynamic = "force-dynamic"`. There is no ISR, no route-level
cache, no `fetch` caching (see `riotFetch` uses `next: { revalidate: 0 }`).

A typical authenticated server component:

```
page.tsx (server) → requireOnboarded() or auth() → DB queries via db.query.* →
returns JSX → <main> wrapper from layout.tsx.
```

A typical server action:

```
"use server"
→ requireAuth / requireAdmin / requireOnboarded (throws redirect on failure)
→ zod parse on FormData (redirect on failure with ?error=…)
→ db mutations
→ revalidatePath("/affected/routes")
→ redirect to result page, usually with ?saved=1
```

This pattern is *consistent* across the codebase: see
`src/app/admin/seasons/actions.ts`, `src/app/seasons/[slug]/signup/actions.ts`,
`src/app/seasons/[slug]/draft/actions.ts`, `src/app/seasons/[slug]/matches/actions.ts`.

## Conventions

- **`import "server-only"`** at the top of files that must not leak to the
  client: `src/auth.ts`, `src/lib/auth-helpers.ts`, `src/db/client.ts`, every
  `src/lib/*.ts` that queries the DB.
- **Errors are redirects.** Server actions don't throw to the client; they
  redirect to `?error=<code>` and the page reads that and renders an alert.
  Error codes are short kebab-case strings. Message maps live on the page
  that receives them (e.g. `ERROR_MESSAGES` in `src/app/profile/page.tsx`).
- **Guards**: never check `session?.user?.role === "admin"` inline — use
  `requireAdmin()` from `src/lib/auth-helpers.ts`. Same for `requireAuth`
  (must be signed in) and `requireOnboarded` (must also have a displayName).
- **Revalidation**: mutations call `revalidatePath` on *every* route that
  could display the changed data. Be explicit — App Router does not invalidate
  adjacent routes automatically.
- **Slug**: every season URL is keyed by `slug`, validated by
  `isValidSlug()` in `src/lib/seasons.ts` (3–48 chars, lowercase alnum +
  hyphens).
- **Display names** are required to do anything useful. `requireOnboarded()`
  redirects to `/onboarding` if missing. Enforced case-insensitively at app
  level (we lowercase on write), uniquely at DB level.

## Routing map

Public:
- `/` — home, pulls latest "live" season for hero CTA
- `/seasons` — list of public (non-draft) seasons
- `/seasons/[slug]` — season detail, UI adapts to state via `StatusPanel`
- `/seasons/[slug]/signup` — signup form (gated by state + window)
- `/seasons/[slug]/captains` — announced captain list
- `/seasons/[slug]/draft` — live draft viewer (SSE-fed)
- `/seasons/[slug]/matches` — schedule + standings
- `/seasons/[slug]/matches/[matchId]` — match detail + report form
- `/history` — static season archive (hard-coded in the page)
- `/u/[displayName]` — public profile

Auth flow:
- `/signin`, `/signup`, `/signin/check-email`, `/forgot-password`, `/reset-password`
- `/onboarding` — pick display name (one-time, required)
- `/profile` — private profile + account linking (Riot / Steam / Leetify)

Admin (requires `role === "admin"`):
- `/admin` — all seasons
- `/admin/seasons/new` — create season
- `/admin/seasons/[slug]` — edit + state transition
- `/admin/seasons/[slug]/signups` — promote/demote captains, reorder, CSV export
- `/admin/seasons/[slug]/draft` — start/pause/resume/undo controls
- `/admin/seasons/[slug]/matches` — generate schedule, seed playoffs, confirm results

API:
- `/api/auth/[...all]` — Better Auth handler
- `/api/draft/[slug]/stream` — SSE event stream (draft updates, 2s poll)
- `/api/cron/refresh-stats` — daily Vercel Cron (6am UTC)

## Where to look when…

- …a DB query looks wrong → `src/db/schema/` for column definitions.
- …an auth guard decision looks wrong → `src/lib/auth-helpers.ts`.
- …a state transition is blocked → `TRANSITIONS` in `src/lib/seasons.ts`.
- …the draft pick order is surprising → `captainOrderForPick` in
  `src/lib/draft.ts` (snake algorithm).
- …match standings look off → `computeStandings` in `src/lib/schedule.ts`
  (tiebreakers: wins → game diff → team name).
- …an error message appears → grep for the kebab-case code; it'll be in a
  page's `ERROR_MESSAGES` map or an action's `redirect(...?error=...)`.
- …styling looks off → [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for the two
  token systems (freelance-style `--bg/--accent/...` + shadcn OKLCH).

## What NOT to expect

- No middleware.ts. Auth is enforced in RSCs and actions, not at the edge.
- No `fetch` cache. Every DB read is per-request.
- No Pusher / Ably / Socket.io. Draft realtime is SSE polling the DB.
- No Sentry / PostHog / analytics wired yet.
- No Vercel Blob usage yet (user avatars referenced in `users.image` but no
  upload flow).
- No Discord integration yet.
- No Leetify or Steam API calls — only free-text link storage in
  `account_links`.
