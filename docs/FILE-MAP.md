# File map

One line per non-trivial source file. Grep-target for "where does X live?".
Trivial shadcn primitives get a single entry at the bottom.

## Bootstrap / config

- `CLAUDE.md` — top-level agent instructions (trunk-based, no PRs, doc index).
- `AGENTS.md` — "this is not the Next.js you know" warning.
- `PLANNING.md` — aspirational roadmap (not current state). See [ARCHITECTURE.md](ARCHITECTURE.md) for what's actually shipped.
- `README.md` — human-facing overview + local setup.
- `.env.example` — every env var with comments. See [ENV.md](ENV.md).
- `drizzle.config.ts` — migration config. `schema: ./src/db/schema/index.ts`, snake_case. Loads `.env.local` for `DATABASE_URL`.
- `vercel.json` — cron: `0 6 * * *` → `/api/cron/refresh-stats`.
- `next.config.ts` — Next config (stock, empty).
- `eslint.config.mjs` — ESLint flat config.
- `postcss.config.mjs` — Tailwind v4 postcss wiring.
- `components.json` — shadcn generator config.
- `.prettierrc.json` / `.prettierignore` — Prettier (+ tailwind class sorting plugin).
- `.husky/pre-commit` + `.lintstagedrc.json` — pre-commit runs `eslint --fix` + `prettier --write` on staged files.
- `.github/workflows/ci.yml` — CI on push/PR to main: `format:check`, `lint`, `typecheck`, `build` (Node 22, `SKIP_ENV_VALIDATION=1`).
- `.claude/settings.json` — shared Claude Code settings. `.claude/launch.json` (untracked) — dev-server preview config.
- `.agents/design-system/` — design-system skill for agents: token CSS, logo assets, HTML previews, marketing-site UI kit.
- `.agents/skills/neon-postgres/SKILL.md` — Neon reference skill. `skills-lock.json` pins it.

## Tests — see [TESTING.md](TESTING.md)

- `vitest.config.mts` — unit test config; aliases `@` and stubs `server-only`.
- `tests/unit/draft-order.test.ts`, `tests/unit/round-robin.test.ts` — snake order and round-robin logic.
- `playwright.config.ts` — e2e config: serial, builds + starts the app on :3100 with auth URLs overridden to localhost.
- `tests/e2e/global-setup.ts` / `global-teardown.ts` — seed run-scoped admin + players; delete all e2e-tagged data afterwards.
- `tests/e2e/support/` — `env.ts` (DB URL, markers), `db.ts` (assert helpers, `cleanupE2EData`), `seed.ts` (users, signups, `seedDraftSeason`), `pages.ts` (sign-in, live-board + admin-draft helpers, `freezeLiveUpdates`).
- `tests/e2e/draft.spec.ts` — full season draft through the UI. `tests/e2e/draft-edge-cases.spec.ts` — captain limits, short pool, SSE undo race, simultaneous picks.

## Scripts

- `scripts/e2e-cleanup.mjs` — `npm run test:e2e:cleanup`: deletes e2e-tagged seasons/users; `--legacy` also removes the old seed-test-season data.
- `scripts/seed-test-season.ts` — refuses to run without `ALLOW_TEST_SEED=1` (it writes to the live DB from `.env.local`). Seeds `test-s1` LoL season with 4 captain + 16 bot accounts (re-runnable; cleans first). Run with `ALLOW_TEST_SEED=1 npx tsx --env-file=.env.local scripts/seed-test-season.ts`. Credentials are in the file header.

## App root

- `src/app/layout.tsx` — `<html>`, Geist + Geist Mono fonts, skip link, SiteHeader, `<main id="main">` (the only `<main>`), SiteFooter. Declares `metadata.icons`/`manifest`/`openGraph` and a dark `viewport.themeColor`.
- `src/app/error.tsx` — root error boundary (client). "Try again" calls `unstable_retry()`.
- `src/app/not-found.tsx` — 404 for `notFound()` and unmatched URLs.
- `src/app/template.tsx` — per-route `animate-page` fade wrapper.
- `src/app/page.tsx` — home; calls `getHomepageData()` and renders Hero + exactly one state section + `PastSeasonsStrip`. Hero label: `LIVE_STATE_COPY` for live states, `HERO_LABELS` (upcoming / off-season) otherwise.
- `src/app/globals.css` — design tokens (freelance hex + shadcn OKLCH), typography, animations, `.tint-subtle-warm`, `.legal-prose`. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Home-page sections (`src/app/_sections/`)

Rendered by `src/app/page.tsx`:
- `hero.tsx` — headline, CTA, stats row. Accepts `liveLabel` + `liveHref` overrides.
- `signup-section.tsx` — `signup_lol` / `signup_cs2` state: signup count + top-ranked (LoL) or random (CS2) players.
- `draft-section.tsx` — `draft` state: captain badges + top non-captains; CTA to draft or season page.
- `live-section.tsx` — `live` state: next scheduled match + top players.
- `upcoming-section.tsx` — `upcoming` state (signups_open with future `signupOpensAt`).
- `off-season-section.tsx` — `off_season` state: last season podium.
- `past-seasons-strip.tsx` — last 3 complete seasons, always rendered.

## Public season pages

- `src/app/seasons/page.tsx` — list of non-draft seasons (active + past split).
- `src/app/seasons/[slug]/page.tsx` — season detail. `StatusPanel` renders per-state CTA. Looks up champion from `matches` when complete.
- `src/app/seasons/[slug]/signup/page.tsx` — signup form (LoL: roles, CS2: maps).
- `src/app/seasons/[slug]/signup/actions.ts` — `submitSignup`. Validates state + window + one-per-user.
- `src/app/seasons/[slug]/captains/page.tsx` — announced captain list.
- `src/app/seasons/[slug]/draft/page.tsx` — live draft viewer. Fetches initial snapshot, renders `<LiveBoard>`.
- `src/app/seasons/[slug]/draft/live-board.tsx` — client component; SSE-subscribes to `/api/draft/[slug]/stream`; shows solo-queue rank per pool player (LoL).
- `src/app/seasons/[slug]/draft/actions.ts` — `submitPick`, `startDraft`, `pauseDraft`, `resumeDraft`, `undoLastPick`. Full validation chain in `submitPick` — see [DRAFT.md](DRAFT.md).
- `src/app/seasons/[slug]/teams/page.tsx` — team rosters with roles, record, "Your team" highlight.
- `src/app/seasons/[slug]/matches/page.tsx` — standings (playoff cut line), bracket (`BracketCard`), schedule with times.
- `src/app/seasons/[slug]/matches/actions.ts` — `reportMatch`, `confirmMatch` (writes `championTeamId` on the final), `disputeMatch`, `resetMatch`. See [MATCHES.md](MATCHES.md).
- `src/app/seasons/[slug]/matches/[matchId]/page.tsx` — match detail + report form.

## 10-man (`src/app/10-man/`) — see [TEN-MAN.md](TEN-MAN.md)

- `page.tsx` — redirects to the active 10-man, else renders `_landing.tsx`.
- `_landing.tsx` — client; explainer, admin "Start a 10-man", recent results.
- `actions.ts` — `start10Man`, `cancel10Man`, `joinSignup`, `leaveSignup`, `castVote`, `submitPick`, `reportResult`. Transactional, throw on error.
- `[id]/page.tsx` — server-fetches snapshot, renders live board.
- `[id]/live-board.tsx` — client; SSE-subscribes to `/api/ten-man/[id]/stream`, switches on state.
- `[id]/_phases/signup-board.tsx`, `voting-board.tsx`, `draft-board.tsx`, `ready-board.tsx` (exports `TeamRoster`), `complete-board.tsx` — one per phase.
- `[id]/_phases/cancelled-board.tsx` — terminal banner for `cancelled`.
- `[id]/_phases/shared.tsx` — `Avatar`, `PhaseBanner`, `useTenManAction` (runs an action, keeps its `{ error }`), `ActionError`. `[id]/_phases/types.ts` — `TenManSnapshotClient`.

## Admin pages

- `src/app/admin/layout.tsx` — wraps admin section with `requireAdmin()`.
- `src/app/admin/page.tsx` — all seasons (including drafts).
- `src/app/admin/seasons/new/page.tsx` — create season form.
- `src/app/admin/seasons/actions.ts` — `createSeason`, `updateSeason`, `transitionSeasonState`. zod-validated.
- `src/app/admin/seasons/[slug]/page.tsx` — edit metadata + state transition buttons.
- `src/app/admin/seasons/[slug]/signups/page.tsx` — signup roster, captain promotion UI.
- `src/app/admin/seasons/[slug]/signups/actions.ts` — `promoteCaptain`, `demoteCaptain`, `moveCaptain` (swap via a `-1` placeholder), `getSignupStats`.
- `src/app/admin/seasons/[slug]/signups/export/route.ts` — CSV download of signup roster.
- `src/app/admin/seasons/[slug]/draft/page.tsx` — admin draft board with start/pause/resume/undo controls.
- `src/app/admin/seasons/[slug]/matches/page.tsx` — schedule generation + playoff seeding + confirm/dispute/reset buttons.
- `src/app/admin/seasons/[slug]/matches/actions.ts` — `generateMatchSchedule`, `seedPlayoffsAction`.

## Auth pages

- `src/app/signin/page.tsx` + `_components/sign-in-form.tsx` — **username** + password sign-in with "remember me" checkbox. Client form calls `signInWithUsername`.
- `src/app/signin/actions.ts` — `signInWithUsername`: looks up email by username, calls `auth.api.signInEmail`. Returns `{ error }` / `{ ok }`; maps `EMAIL_NOT_VERIFIED`.
- `src/app/signup/page.tsx` + `_components/sign-up-form.tsx` — signup form. Captures email, username, password, confirm.
- `src/app/signup/actions.ts` — `registerUser` server action. Validates username regex + uniqueness, calls `auth.api.signUpEmail`, writes `username` to DB, redirects to `/signin/check-email?type=verify`.
- `src/app/signin/check-email/page.tsx` — "verify your email" confirmation page.
- `src/app/forgot-password/page.tsx` + `_components/forgot-password-form.tsx` — trigger reset email.
- `src/app/reset-password/page.tsx` + `_components/reset-password-form.tsx` — consume reset token.
- `src/app/profile/page.tsx` — private profile + account-link UI. Contains inline `saveProfile` and `doSignOut` server actions and the `ERROR_MESSAGES` map.
- `src/app/profile/account-actions.ts` — `linkRiotAccount`, `unlinkRiotAccount` (by `linkId`), `linkCs2Account`, `unlinkCs2Account`, `manualRefreshStats` (rate-limited).
- `src/app/profile/_components/link-forms.tsx` — client `RiotLinkForm` / `Cs2LinkForm` (`useActionState`, inline errors, input kept).
- `src/app/profile/constants.ts` — `MAX_RIOT_ACCOUNTS = 3`.

## Other pages

- `src/app/history/page.tsx` — hardcoded season archive (13 entries: Seasons 1–11 incl. separate S11 LoL/CS2, plus Zero Space special; images from `public/history/`).
- `src/app/users/[username]/page.tsx` — public profile; per-Riot-account rank + top champs, Steam/Leetify links.
- `src/app/users/[username]/_components/stats-tabs.tsx` — client tab switcher (LoL / CS2).
- `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` — static legal pages using `LegalPage`.

## API routes

- `src/app/api/auth/[...all]/route.ts` — Better Auth handler via `toNextJsHandler`.
- `src/app/api/draft/[slug]/stream/route.ts` — season draft SSE. 2-second DB poll, emits `update` on hash change, keep-alive ping otherwise. `maxDuration = 300`. See [DRAFT.md](DRAFT.md).
- `src/app/api/ten-man/[id]/stream/route.ts` — 10-man SSE, same pattern. See [TEN-MAN.md](TEN-MAN.md).
- `src/app/api/cron/refresh-stats/route.ts` — daily cron. `CRON_SECRET` bearer auth. Calls `refreshAllRiotStats()`.


## Auth / session

- `src/auth.ts` — app-level `auth()` wrapper (request-cached via `React.cache`) returning `AppSession | null`. Also exports `signOut()` server helper.
- `src/lib/auth.ts` — Better Auth config. Drizzle adapter, Resend email templates, session cookie settings, user additional fields, `nextCookies()` plugin.
- `src/lib/auth-client.ts` — Better Auth React client. Exports `authClient`, `signIn`, `signUp`, `signOut`, `useSession`.
- `src/lib/auth-helpers.ts` — `getSession`, `requireAuth`, `requireAdmin`, `requireOnboarded`. Redirect-on-failure.

## DB

- `src/db/client.ts` — Drizzle over Neon `Pool` (`drizzle-orm/neon-serverless`, WebSocket). `casing: "snake_case"`.
- `src/db/schema/index.ts` — re-exports all schemas.
- `src/db/schema/auth.ts` — `users`, `sessions`, `accounts`, `verifications`. Better Auth–shaped.
- `src/db/schema/seasons.ts` — `seasons`, `seasonSignups`, `seasonCaptains`. `season_state` + `game` enums.
- `src/db/schema/drafts.ts` — `drafts`, `draftPicks`, `teams`, `teamMembers`. `draft_state` enum.
- `src/db/schema/matches.ts` — `matches` table + `match_stage` / `match_state` enums.
- `src/db/schema/stats.ts` — `accountLinks`, `riotStatSnapshots` (per account link), `leetifyStatSnapshots`.
- `src/db/schema/ten-mans.ts` — `tenMans`, `tenManSignups`, `tenManVotes`, `tenManCaptains`, `tenManPicks`. `ten_man_state` enum.

Migrations: `drizzle/0000_baseline.sql` (full schema + partial index) and `drizzle/0001_reconcile_live_schema.sql` (idempotent fix-up for DBs from the pre-squash history), plus `drizzle/meta/`. See [DATA-MODEL.md](DATA-MODEL.md) → Migrations.

## Business logic (`src/lib`)

- `src/lib/utils.ts` — `cn()` from clsx + tailwind-merge.
- `src/lib/env.ts` — t3-env + zod schema. See [ENV.md](ENV.md).
- `src/lib/seasons.ts` — `SEASON_STATES`, `TRANSITIONS` state machine, `nextStates`, `canTransition`, `SEASON_STATE_LABELS`, `GAME_LABELS`, `PUBLIC_STATES`, `isPublic`, `isValidSlug`, `slugify`.
- `src/lib/draft.ts` — `PICKS_PER_TEAM`, `captainOrderForPick` (snake), `totalPicks`, `getDraftSnapshot` (incl. solo-queue rank per pool player), `finalizeDraft`. See [DRAFT.md](DRAFT.md).
- `src/lib/schedule.ts` — `buildRoundRobin` (circle method), `generateSchedule`, `computeStandings`, `seedPlayoffs`, `getTeamForCaptain` (captain *or* rostered member). See [MATCHES.md](MATCHES.md).
- `src/lib/homepage.ts` — `getHomepageData()` (discriminated union of 6 home states), `formatRank`, rank-sorting helpers, podium builder.
- `src/lib/backdrop-clips.ts` — home-row backdrop clip registry (`backdropClip(game, index)`, `otherGame`). Clips have `sources: []` until real footage lands.
- `src/lib/live-season.ts` — `getLiveSeason`, `LIVE_STATE_COPY`, `liveSeasonHref`. Used by header pill + home hero.
- `src/lib/ten-man.ts` — `PICK_ORDER_C1_C2`, `getActiveTenMan`, `getTenManSnapshot`, `getRecentTenMans`, `electCaptains`. See [TEN-MAN.md](TEN-MAN.md).
- `src/lib/riot-api.ts` — Riot API client. `getAccountByRiotId`, `getRankEntries`, `getTopChampions`, `getChampionName` (Data Dragon).
- `src/lib/stat-refresh.ts` — `refreshRiotStats(userId)` (all of a user's Riot links), `refreshAllRiotStats` (every Riot link); per-link delete-then-insert, 1200ms sleep between links.
- `src/lib/rate-limit.ts` — Upstash sliding-window. Specs: `magicLink` (unused), `statRefresh`. Fails open if Upstash env missing.
- `src/lib/safe-redirect.ts` — `safeCallbackUrl` (same-origin paths only) + `signInHref(path)` for sign-in links that return the user.
- `src/lib/season-meta.ts` — `getSeasonName` (request-cached) + `seasonPageMetadata("Page")` for season sub-page `<title>`s.

## Site chrome

- `src/components/site-header.tsx` — server; calls `auth()`, `getLiveSeason()`, `getActiveTenMan()`; builds the live pill (season first, else 10-man).
- `src/components/site-header-client.tsx` — sticky nav (live pill inline — "Live" below xl, full label at xl — then Seasons / History / 10-man / Admin), scroll blur, mobile hamburger overlay (also shows the pill).
- `src/components/site-footer.tsx` — async server component; nav links (Seasons / History / 10-man), session-aware Account links, Terms / Privacy, Riot "Legal Jibber Jabber" / Valve footage notice.
- `src/components/legal-page.tsx` — `LegalPage` chrome for `/terms` + `/privacy`.
- `src/components/flash-toast.tsx` — client; turns a `?saved=` flag into a sonner toast and removes it from the URL.
- `src/components/season-nav.tsx` — `SeasonNav` tabs for `/seasons/[slug]/*`, gated by season state.
- `src/components/use-turn-alert.ts` — client hooks: `useSnapshotStream` (SSE + connection status), `useTurnAlert` (title flash + chime on your pick), `useTurnSoundPref`.
- `src/components/live-status.tsx` — `LiveStatusDot` ("Live" / "Reconnecting…") and `TurnSoundToggle`.

## UI primitives

Freelance-style (hex tokens):
- `src/components/ui/reveal.tsx` — IntersectionObserver fade-up. Reduced-motion handled via CSS, not JS.
- `src/components/ui/section-label.tsx` — red uppercase eyebrow (accepts `className` + `style`).
- `src/components/ui/divider.tsx` — 1px hr.
- `src/components/ui/tag.tsx` — small pill.
- `src/components/ui/link-button.tsx` — `<Link>`-wrapped button with primary/outline/ghost variants.
- `src/components/ui/logo-mark.tsx` — inline flame SVG. Themed via `var(--accent)` / `var(--text)` by default; used in header + footer wordmarks.
- `src/components/ui/tinted-section.tsx` — padded `<section>` + `.site-container`, optional `subtle-warm` tint, optional `backdrop` clip. Home sections.
- `src/components/ui/video-backdrop.tsx` — client; muted looping clip at 50% opacity behind a home row. Lazy-loads near viewport, pauses off-screen, poster-only for reduced motion / Save-Data.
- `src/components/ui/player-card.tsx` — username + optional role/rank row card. Home sections.
- `src/components/ui/captain-badge.tsx` — red-tinted name chip. Home draft section.
- `src/components/ui/snake-order-strip.tsx` — 8-cell C1/C2 pick-order strip + `SNAKE_ORDER`. 10-man draft.
- `src/components/ui/vs-divider.tsx` — "VS" separator (vertical at md+, horizontal when teams stack). 10-man ready/complete.
- `src/components/ui/local-time.tsx` — client; `LocalTime` (formats a date in the viewer's timezone), `LocalDateTimeInput` (datetime-local that submits UTC ISO), `useHydrated`.
- `src/components/ui/confirm-submit-button.tsx` — client; submit `Button` that `confirm()`s first. Destructive admin forms.

shadcn (OKLCH tokens):
- `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sonner.tsx`, `textarea.tsx` — standard shadcn generators under `src/components/ui/`.

## Public assets

- `public/videos/posters/` — placeholder SVG posters for home-row video backdrops (`lol-1/2`, `cs2-1/2`). Real clips go in `public/videos/`.
- `public/history/` — screenshots for the `/history` archive (seasons 1–11 + Zero Space).
- `public/logo.svg`, `public/icon-512.svg` — vector flame mark (240×240 / 512×512 artboards). Source-of-truth shape lives inline in `src/components/ui/logo-mark.tsx`.
- `public/icon-{16,32,64,128,192,512}.png` — favicon + PWA app-icon raster sizes. Wired via `metadata.icons` in `src/app/layout.tsx`.
- `public/apple-touch-icon.png` — 180×180 iOS home-screen icon.
- `public/site.webmanifest` — PWA manifest (name, theme/background `#0A0A0A`, icon set). Linked via `metadata.manifest`.

## Docs (you are here)

- `docs/ARCHITECTURE.md` — stack as shipped, directory layout, request lifecycle, routing map.
- `docs/AUTH.md` — Better Auth, username sign-in, session shape, guards.
- `docs/DATA-MODEL.md` — schema-by-schema, invariants enforced in code.
- `docs/SEASON-LIFECYCLE.md` — state machine + per-state UI + who triggers each transition.
- `docs/DRAFT.md` — snake math, SSE realtime, submit-pick validation chain.
- `docs/MATCHES.md` — scheduling, lifecycle, standings, playoff seeding.
- `docs/TEN-MAN.md` — 10-man pickup flow: lifecycle, actions, election, realtime.
- `docs/INTEGRATIONS.md` — Neon, Better Auth + Resend, Riot, Upstash, Vercel Cron.
- `docs/DESIGN-SYSTEM.md` — two token systems, typography, animations, primitives.
- `docs/ENV.md` — env vars + what breaks without them.
- `docs/FILE-MAP.md` — this file.
- `docs/design/10-man/` — original 10-man design handoff (README spec, IMPLEMENTATION-PLAN, HTML prototype, screenshots). Historical; [TEN-MAN.md](TEN-MAN.md) is current.
