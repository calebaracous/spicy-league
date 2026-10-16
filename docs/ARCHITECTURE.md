# Architecture

High-level map of what's actually shipped. For the aspirational roadmap see
[PLANNING.md](../PLANNING.md) — it is *not* the current state (e.g. PLANNING
says Auth.js + magic links, we ship Better Auth with username/password and
email verification; PLANNING says Pusher/Ably, we ship SSE polling).

## Stack as shipped

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) + React 19 |
| Language | TypeScript strict |
| Styling | Tailwind CSS v4 + shadcn/ui primitives + custom design tokens |
| Auth | [`better-auth`](https://better-auth.com) w/ Drizzle adapter + `nextCookies` plugin. Username + password sign-in, email verification via Resend |
| Database | Neon Postgres via `@neondatabase/serverless` **Pool** (WebSocket) driver — needed for `db.transaction()` / `FOR UPDATE` |
| ORM | Drizzle ORM (`drizzle-kit` for migrations) |
| Realtime (season draft + 10-man) | Server-Sent Events polling the DB every 2s — no Pusher/Ably |
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
    _sections/          # Home-page sections. page.tsx renders one per HomepageData state.
    10-man/             # Standalone 10-man pickup flow (landing, live board, actions). See TEN-MAN.md.
    admin/              # Admin-only pages. Every server action is wrapped in requireAdmin().
    api/                # Route handlers — better-auth, season-draft SSE, 10-man SSE, cron.
    seasons/            # Public season pages + server actions (signup, draft, matches).
    users/[username]/   # Public profile with LoL/CS2 stats tabs.
    terms/, privacy/    # Static legal pages (LegalPage chrome).
    globals.css         # Design tokens + shadcn tokens + animation utilities + .legal-prose.
    layout.tsx          # Root layout: SiteHeader + main + SiteFooter, metadata/icons/manifest.
    template.tsx        # Per-route fade-in animation wrapper.
    page.tsx            # Home — state-aware; data from getHomepageData().
  auth.ts               # Thin wrapper that returns an AppSession-shaped object.
  components/
    ui/                 # shadcn primitives + freelance-style primitives (Reveal, PlayerCard, etc).
    legal-page.tsx      # Shared chrome for /terms and /privacy.
    site-header.tsx     # Server component. Session + live-season / active-10-man pill.
    site-header-client.tsx  # Sticky nav, live pill, scroll blur, mobile menu.
    site-footer.tsx     # Footer: nav + legal links.
  db/
    client.ts           # drizzle(Pool) instance (neon-serverless). Exports `db` and `schema`.
    schema/             # One file per domain — auth, seasons, drafts, matches, stats, ten-mans.
  lib/
    auth.ts             # Better Auth config. Drizzle adapter, Resend email, session cookies.
    auth-client.ts      # Client-side better-auth/react — signIn, signUp, useSession.
    auth-helpers.ts     # requireAuth / requireAdmin / requireOnboarded for server code.
    draft.ts            # Season draft: snake math, snapshot query, finalizeDraft.
    schedule.ts         # Round-robin circle method + standings + playoff seeding.
    seasons.ts          # State machine (transitions, labels) + slug helpers.
    homepage.ts         # getHomepageData() — picks the home-page state + its data.
    live-season.ts      # getLiveSeason / LIVE_STATE_COPY / liveSeasonHref (header pill).
    ten-man.ts          # 10-man snapshot, active lookup, history, captain election.
    riot-api.ts         # Riot API client — accounts, ranked, mastery, Data Dragon.
    stat-refresh.ts     # Refresh Riot stat snapshots per linked account.
    rate-limit.ts       # Upstash sliding-window limiter (optional).
    env.ts              # Zod-validated env via @t3-oss/env-nextjs.
    utils.ts            # cn() — clsx + tailwind-merge.
drizzle/                # Squashed migrations: 0000_baseline + 0001_reconcile_live_schema. See DATA-MODEL.md.
scripts/                # Dev scripts (test-season seeder, e2e cleanup).
tests/                  # unit/ (Vitest) and e2e/ (Playwright). See TESTING.md.
docs/                   # You are here. docs/design/ holds design handoffs (not source of truth).
.agents/                # Agent skills: Spicy League design-system reference, Neon skill.
```

## Request lifecycle

Everything is server-rendered on demand. **Every route is dynamic** —
the root layout renders `SiteHeader`, which calls `auth()` (reads
`headers()`), so even `/history`, `/terms` and `/privacy` render per
request. Most DB-backed pages also export
`export const dynamic = "force-dynamic"` explicitly. There is no ISR, no route-level cache, no
`fetch` caching for app data (`riotFetch` uses `next: { revalidate: 0 }`;
only Data Dragon is cached for 24h).

A typical authenticated server component:

```
page.tsx (server) → requireOnboarded() or auth() → DB queries via db.query.* →
returns JSX → <main> wrapper from layout.tsx.
```

A typical **season/admin/profile** server action (form-bound):

```
"use server"
→ requireAuth / requireAdmin / requireOnboarded (throws redirect on failure)
→ zod parse on FormData (redirect on failure with ?error=…)
→ db mutations
→ revalidatePath("/affected/routes")
→ redirect to result page, usually with ?saved=1
```

See `src/app/admin/seasons/actions.ts`, `src/app/seasons/[slug]/signup/actions.ts`,
`src/app/seasons/[slug]/draft/actions.ts`, `src/app/seasons/[slug]/matches/actions.ts`.

Two families **don't** follow the redirect pattern — they're called from
client components and return/throw instead:
- `signInWithUsername` (`src/app/signin/actions.ts`) and `registerUser`
  (`src/app/signup/actions.ts`) return `{ error }` for the form to render
  (`registerUser` redirects only on success).
- 10-man actions (`src/app/10-man/actions.ts`) return `{ error }` for
  expected failures (via `TenManError` + `run()`) and run in DB
  transactions. See [TEN-MAN.md](TEN-MAN.md).

Unexpected errors land in `src/app/error.tsx` (root error boundary, "Try
again" via `unstable_retry`); `notFound()` and unmatched URLs render
`src/app/not-found.tsx`. There is no `loading.tsx`.

## Conventions

- **`import "server-only"`** at the top of files that must not leak to the
  client: `src/auth.ts`, `src/lib/auth-helpers.ts`, `src/db/client.ts`, and
  every `src/lib/*.ts` that queries the DB or holds secrets.
- **Errors are redirects** (form actions). Server actions redirect to
  `?error=<code>` and the page reads that and renders an alert. Error codes
  are short kebab-case strings. Message maps live on the page that receives
  them (e.g. `ERROR_MESSAGES` in `src/app/profile/page.tsx`). Exception: forms
  where losing the typed value hurts (profile Riot / CS2 link forms,
  `src/app/profile/_components/link-forms.tsx`) use `useActionState` — the
  action returns `{ error }` and the inputs are controlled so they survive.
- **Success is a toast.** Pages render `<FlashToast message=…>`
  (`src/components/flash-toast.tsx`) when `?saved=` (or `?signed-up=`) is
  set; it fires a sonner toast and strips the flag from the URL. The
  `<Toaster>` is mounted once in the root layout.
- **Guards**: never check `session?.user?.role === "admin"` inline for
  authorization — use `requireAdmin()` from `src/lib/auth-helpers.ts`. Same
  for `requireAuth` (signed in) and `requireOnboarded` (also has a
  username). Inline role reads are fine for *rendering* decisions and for
  admin overrides inside an already-guarded action (e.g. `submitPick`).
- **Revalidation**: mutations call `revalidatePath` on *every* route that
  could display the changed data. Be explicit — App Router does not
  invalidate adjacent routes automatically.
- **Slug**: every season URL is keyed by `slug`, validated by
  `isValidSlug()` in `src/lib/seasons.ts` (3–48 chars, lowercase alnum +
  single hyphens).
- **Usernames** are captured at signup and are the sign-in identifier.
  `requireOnboarded()` redirects to `/signin` if missing (safety net —
  shouldn't fire for real accounts). Lowercased on write, unique at DB level.
- **Dates/times**: never format with `toLocaleString()` in a server
  component — Vercel's server runs in UTC. Render `<LocalTime date=…>`
  (`src/components/ui/local-time.tsx`), which formats in the viewer's
  timezone after hydration. Admin date fields use `<LocalDateTimeInput>`,
  which submits a UTC ISO string (a bare `datetime-local` value would be
  parsed in the server's timezone).
- **Destructive admin buttons** (undo pick, reset/dispute match, lifecycle
  moves, seed playoffs) use `ConfirmSubmitButton`
  (`src/components/ui/confirm-submit-button.tsx`) inside the `<form>`.
- **Page titles**: every route sets one (`metadata` or `generateMetadata`).
  Season sub-pages use `seasonPageMetadata("Page")` from
  `src/lib/season-meta.ts` → "Page · Season name".
- **One `<main>`**: the root layout owns `<main id="main">` (skip-link
  target). Pages render a `<div>` wrapper, never their own `<main>`.
- **`auth()` is request-cached** (`React.cache` in `src/auth.ts`), so
  header, footer and page can each call it without extra session lookups.

## Routing map

Public:
- `/` — home. State-aware: signup (LoL/CS2), draft, live, upcoming, or
  off-season layout, chosen by `getHomepageData()` in `src/lib/homepage.ts`.
- `/seasons` — list of public (non-draft) seasons
- `/seasons/[slug]` — season detail, UI adapts to state via `StatusPanel`
- `/seasons/[slug]/signup` — signup form (gated by state + window)
- `/seasons/[slug]/captains` — announced captain list
- `/seasons/[slug]/draft` — live draft viewer (SSE-fed)
- `/seasons/[slug]/teams` — rosters per team (captain + picks, primary role, W–L), viewer's team highlighted
- `/seasons/[slug]/matches` — standings (playoff cut line) + bracket + schedule with times

Every `/seasons/[slug]/*` page renders `<SeasonNav>` (`src/components/season-nav.tsx`):
Overview / Captains / Draft / Teams / Matches tabs, each shown once the season
reaches the state where it has content. The overview also shows a "Your team"
card (team + next scheduled match) for signed-in players once teams exist.
- `/seasons/[slug]/matches/[matchId]` — match detail + report form
- `/10-man` — 10-man landing (redirects to the active session if any)
- `/10-man/[id]` — live 10-man board (SSE-fed). See [TEN-MAN.md](TEN-MAN.md).
- `/history` — static season archive (hard-coded in the page)
- `/users/[username]` — public profile
- `/terms`, `/privacy` — static legal docs. Required by the Discord
  Developer Portal for app creation. Shared chrome in
  `src/components/legal-page.tsx`; prose styling is the `.legal-prose`
  block in `globals.css`. Linked from `SiteFooter`.

Auth flow:
- `/signin` (username + password), `/signup`, `/signin/check-email`,
  `/forgot-password`, `/reset-password`
- `/profile` — private profile + account linking (up to 3 Riot accounts, Steam + Leetify)

Admin (requires `role === "admin"`):
- `/admin` — all seasons
- `/admin/seasons/new` — create season
- `/admin/seasons/[slug]` — edit + state transition
- `/admin/seasons/[slug]/signups` — promote/demote captains, reorder, CSV export (`/signups/export`)
- `/admin/seasons/[slug]/draft` — start/pause/resume/undo controls
- `/admin/seasons/[slug]/matches` — generate schedule, seed playoffs, confirm results
- 10-man admin controls (start, cancel, report result) are inline on the
  `/10-man` pages, not under `/admin`.

API:
- `/api/auth/[...all]` — Better Auth handler
- `/api/draft/[slug]/stream` — season draft SSE stream (2s poll)
- `/api/ten-man/[id]/stream` — 10-man SSE stream (2s poll)
- `/api/cron/refresh-stats` — daily Vercel Cron (06:00 UTC)

## Where to look when…

- …a DB query looks wrong → `src/db/schema/` for column definitions.
- …an auth guard decision looks wrong → `src/lib/auth-helpers.ts`.
- …a state transition is blocked → `TRANSITIONS` in `src/lib/seasons.ts`.
- …the home page shows the wrong layout → `getHomepageData()` in
  `src/lib/homepage.ts`.
- …the header pill is wrong → `src/components/site-header.tsx` +
  `LIVE_STATE_COPY` in `src/lib/live-season.ts`.
- …the draft pick order is surprising → `captainOrderForPick` in
  `src/lib/draft.ts` (snake algorithm). 10-man uses the fixed
  `PICK_ORDER_C1_C2` in `src/lib/ten-man.ts`.
- …match standings look off → `computeStandings` in `src/lib/schedule.ts`
  (tiebreakers: wins → game diff → team name).
- …an error message appears → grep for the kebab-case code; it'll be in a
  page's `ERROR_MESSAGES` map or an action's `redirect(...?error=...)`.
- …styling looks off → [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) for the two
  token systems (freelance-style `--bg/--accent/...` + shadcn OKLCH).

## What NOT to expect

- No `middleware.ts` / `proxy.ts`. Auth is enforced in RSCs and actions, not at the edge.
- No `fetch` cache for app data. Every DB read is per-request.
- No Pusher / Ably / Socket.io / LISTEN-NOTIFY. Realtime is SSE polling the DB.
- No pick clock / auto-pick in either draft.
- Only the draft has automated tests: unit tests in CI, a Playwright e2e
  suite on demand. See [TESTING.md](TESTING.md).
- No Sentry / PostHog / analytics wired yet.
- No Vercel Blob usage yet (user avatars referenced in `users.image` but no
  upload flow).
- No Discord integration yet.
- No Leetify or Steam API calls — only ID/URL storage in `account_links`.
