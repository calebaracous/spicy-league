# File map

One line per non-trivial source file. Grep-target for "where does X live?".
Trivial shadcn primitives get a single entry at the bottom.

## Bootstrap / config

- `CLAUDE.md` — top-level agent instructions (trunk-based, no PRs).
- `AGENTS.md` — "this is not the Next.js you know" warning.
- `PLANNING.md` — aspirational roadmap (not current state). See [ARCHITECTURE.md](ARCHITECTURE.md) for what's actually shipped.
- `drizzle.config.ts` — migration config. `schema: ./src/db/schema/index.ts`, snake_case.
- `vercel.json` — cron: `0 6 * * *` → `/api/cron/refresh-stats`.
- `next.config.ts` — Next config (stock).
- `eslint.config.mjs` — ESLint flat config.
- `postcss.config.mjs` — Tailwind v4 postcss wiring.
- `components.json` — shadcn generator config.

## App root

- `src/app/layout.tsx` — `<html>`, Geist fonts, SiteHeader, main, SiteFooter.
- `src/app/template.tsx` — per-route `animate-page` fade wrapper.
- `src/app/page.tsx` — home; pulls a live season + composes `_sections/*`.
- `src/app/globals.css` — design tokens (freelance hex + shadcn OKLCH), typography, animations. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).
- `src/app/favicon.ico` — asset.

## Home-page sections

- `src/app/_sections/hero.tsx` — hero headline, CTA, stats row. Accepts `liveLabel` + `liveHref` overrides.
- `src/app/_sections/about.tsx` — two-column about with tag pills.
- `src/app/_sections/how-it-works.tsx` — 01/02/03 cards (Sign up → Draft → Play).
- `src/app/_sections/latest-seasons.tsx` — 3 most recent non-draft seasons, card grid.
- `src/app/_sections/call-to-action.tsx` — bottom CTA with red top border.

## Public season pages

- `src/app/seasons/page.tsx` — list of non-draft seasons (active + past split).
- `src/app/seasons/[slug]/page.tsx` — season detail. `StatusPanel` renders per-state CTA. Looks up champion from `matches` when complete.
- `src/app/seasons/[slug]/signup/page.tsx` — signup form (LoL: roles, CS2: maps).
- `src/app/seasons/[slug]/signup/actions.ts` — `submitSignup`. Validates state + window + one-per-user.
- `src/app/seasons/[slug]/captains/page.tsx` — announced captain list.
- `src/app/seasons/[slug]/draft/page.tsx` — live draft viewer. Fetches initial snapshot, renders `<LiveBoard>`.
- `src/app/seasons/[slug]/draft/live-board.tsx` — client component; SSE-subscribes to `/api/draft/[slug]/stream`.
- `src/app/seasons/[slug]/draft/actions.ts` — `submitPick`, `startDraft`, `pauseDraft`, `resumeDraft`, `undoLastPick`. Full validation chain in `submitPick` — see [DRAFT.md](DRAFT.md).
- `src/app/seasons/[slug]/matches/page.tsx` — schedule + standings table.
- `src/app/seasons/[slug]/matches/actions.ts` — `reportMatch`, `confirmMatch`, `disputeMatch`, `resetMatch`. See [MATCHES.md](MATCHES.md).
- `src/app/seasons/[slug]/matches/[matchId]/page.tsx` — match detail + report form.

## Admin pages

- `src/app/admin/layout.tsx` — wraps admin section with `requireAdmin()`.
- `src/app/admin/page.tsx` — all seasons (including drafts).
- `src/app/admin/seasons/new/page.tsx` — create season form.
- `src/app/admin/seasons/actions.ts` — `createSeason`, `updateSeason`, `transitionSeasonState`. zod-validated.
- `src/app/admin/seasons/[slug]/page.tsx` — edit metadata + state transition buttons.
- `src/app/admin/seasons/[slug]/signups/page.tsx` — signup roster, captain promotion UI.
- `src/app/admin/seasons/[slug]/signups/actions.ts` — `promoteCaptain`, `demoteCaptain`, `moveCaptain` (three-step swap), `getSignupStats`.
- `src/app/admin/seasons/[slug]/signups/export/route.ts` — CSV download of signup roster.
- `src/app/admin/seasons/[slug]/draft/page.tsx` — admin draft board with pause/resume/undo controls.
- `src/app/admin/seasons/[slug]/matches/page.tsx` — schedule generation + playoff seeding + confirm buttons.
- `src/app/admin/seasons/[slug]/matches/actions.ts` — `generateMatchSchedule`, `seedPlayoffsAction`.

## Auth pages

- `src/app/signin/page.tsx` + `_components/sign-in-form.tsx` — email+password signin with rememberMe.
- `src/app/signup/page.tsx` + `_components/sign-up-form.tsx` — signup form. Redirects to `/signin/check-email` after submit.
- `src/app/signin/check-email/page.tsx` — "verify your email" confirmation page.
- `src/app/forgot-password/page.tsx` + `_components/forgot-password-form.tsx` — trigger reset email.
- `src/app/reset-password/page.tsx` + `_components/reset-password-form.tsx` — consume reset token.
- `src/app/onboarding/page.tsx` — pick display name (one-time, required by `requireOnboarded`).
- `src/app/profile/page.tsx` — private profile + account-link UI. Contains inline `saveProfile` and `doSignOut` server actions.
- `src/app/profile/account-actions.ts` — `linkRiotAccount`, `unlinkRiotAccount`, `linkCs2Account`, `unlinkCs2Account`, `manualRefreshStats` (rate-limited).

## Other pages

- `src/app/history/page.tsx` — hardcoded season archive (9 seasons, images from `public/history/`).
- `src/app/u/[displayName]/page.tsx` — public profile page.

## API routes

- `src/app/api/auth/[...all]/route.ts` — Better Auth handler via `toNextJsHandler`.
- `src/app/api/auth/[...nextauth]/` — empty, leftover from the scrapped NextAuth plan.
- `src/app/api/draft/[slug]/stream/route.ts` — SSE stream. 2-second DB poll, emits `update` event on hash change, keep-alive ping otherwise. `maxDuration = 300`. See [DRAFT.md](DRAFT.md).
- `src/app/api/cron/refresh-stats/route.ts` — daily cron. `CRON_SECRET` bearer auth. Calls `refreshAllRiotStats()`.

## Auth / session

- `src/auth.ts` — app-level `auth()` wrapper returning `AppSession | null`. Also exports `signOut()` server helper.
- `src/lib/auth.ts` — Better Auth config. Drizzle adapter, Resend email templates, session cookie settings, user additional fields.
- `src/lib/auth-client.ts` — Better Auth React client. Exports `signIn`, `signUp`, `signOut`, `useSession`.
- `src/lib/auth-helpers.ts` — `requireAuth`, `requireAdmin`, `requireOnboarded`. Redirect-on-failure.

## DB

- `src/db/client.ts` — Drizzle + Neon HTTP client. `casing: "snake_case"`.
- `src/db/schema/index.ts` — re-exports all schemas.
- `src/db/schema/auth.ts` — `users`, `sessions`, `accounts`, `verifications`. Better Auth–shaped.
- `src/db/schema/seasons.ts` — `seasons`, `seasonSignups`, `seasonCaptains`. `season_state` + `game` enums.
- `src/db/schema/drafts.ts` — `drafts`, `draftPicks`, `teams`, `teamMembers`. `draft_state` enum.
- `src/db/schema/matches.ts` — `matches` table + `match_stage` / `match_state` enums.
- `src/db/schema/stats.ts` — `accountLinks`, `riotStatSnapshots`, `leetifyStatSnapshots`.

Migrations under `drizzle/0000…0006_*.sql`.

## Business logic (`src/lib`)

- `src/lib/utils.ts` — `cn()` from clsx + tailwind-merge.
- `src/lib/env.ts` — t3-env + zod schema. See [ENV.md](ENV.md).
- `src/lib/seasons.ts` — `TRANSITIONS` state machine, `nextStates`, `canTransition`, `SEASON_STATE_LABELS`, `GAME_LABELS`, `isValidSlug`, `slugify`.
- `src/lib/draft.ts` — `captainOrderForPick` (snake), `totalPicks`, `getDraftSnapshot`, `finalizeDraft`. See [DRAFT.md](DRAFT.md).
- `src/lib/schedule.ts` — `buildRoundRobin` (circle method), `generateSchedule`, `computeStandings`, `seedPlayoffs`, `getTeamForCaptain`. See [MATCHES.md](MATCHES.md).
- `src/lib/riot-api.ts` — Riot API client. `getAccountByRiotId`, `getRankEntries`, `getTopChampions`, `getChampionName` (Data Dragon).
- `src/lib/stat-refresh.ts` — `refreshRiotStats` (delete-then-insert), `refreshAllRiotStats` (batched with 1200ms sleep).
- `src/lib/rate-limit.ts` — Upstash sliding-window. Specs: `magicLink` (unused), `statRefresh`. Fails open if Upstash env missing.

## Site chrome

- `src/components/site-header.tsx` — server; calls `auth()`, forwards session to client.
- `src/components/site-header-client.tsx` — sticky nav + scroll blur + mobile hamburger overlay.
- `src/components/site-footer.tsx` — two-column footer.

## UI primitives

Freelance-style (hex tokens, new):
- `src/components/ui/reveal.tsx` — IntersectionObserver fade-up. Reduced-motion handled via CSS, not JS.
- `src/components/ui/section-label.tsx` — red uppercase eyebrow.
- `src/components/ui/divider.tsx` — 1px hr.
- `src/components/ui/tag.tsx` — small pill.
- `src/components/ui/link-button.tsx` — `<Link>`-wrapped button with primary/outline/ghost variants.

shadcn (OKLCH tokens, existing):
- `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sonner.tsx`, `textarea.tsx` — standard shadcn generators under `src/components/ui/`.

## Public assets

- `public/history/` — screenshots from seasons 1–9 (referenced by `src/app/history/page.tsx`).
- `public/*.svg` — generic Next.js bootstrap icons.

## Docs (you are here)

- `docs/ARCHITECTURE.md` — stack as shipped, directory layout, request lifecycle, routing map.
- `docs/AUTH.md` — Better Auth, session shape, guards, onboarding flow.
- `docs/DATA-MODEL.md` — schema-by-schema, invariants enforced in code.
- `docs/SEASON-LIFECYCLE.md` — state machine + per-state UI + who triggers each transition.
- `docs/DRAFT.md` — snake math, SSE realtime, submit-pick validation chain.
- `docs/MATCHES.md` — scheduling, lifecycle, standings, playoff seeding.
- `docs/INTEGRATIONS.md` — Neon, Better Auth + Resend, Riot, Upstash, Vercel Cron.
- `docs/DESIGN-SYSTEM.md` — two token systems, typography, animations, primitives.
- `docs/ENV.md` — env vars + what breaks without them.
- `docs/FILE-MAP.md` — this file.
