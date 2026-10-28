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
- `vercel.json` — crons: `0 6 * * *` → `/api/cron/refresh-stats`, `0 15 * * *` → `/api/cron/discord-reminders`.
- `next.config.ts` — Next config (stock, empty).
- `eslint.config.mjs` — ESLint flat config.
- `postcss.config.mjs` — Tailwind v4 postcss wiring.
- `components.json` — shadcn generator config.
- `.prettierrc.json` / `.prettierignore` — Prettier (+ tailwind class sorting plugin).
- `.husky/pre-commit` + `.lintstagedrc.json` — pre-commit runs `eslint --fix` + `prettier --write` on staged files.
- `.github/workflows/ci.yml` — CI on push/PR to main: `format:check`, `lint`, `typecheck`, `test:unit`, `build` (Node 22, `SKIP_ENV_VALIDATION=1`).
- `.claude/settings.json` — shared Claude Code settings. `.claude/launch.json` (untracked) — dev-server preview config.
- `.agents/design-system/` — design-system skill for agents: token CSS, logo assets, HTML previews, marketing-site UI kit.
- `.agents/skills/neon-postgres/SKILL.md` — Neon reference skill. `skills-lock.json` pins it.

## Tests — see [TESTING.md](TESTING.md)

- `vitest.config.mts` — unit test config; aliases `@` and stubs `server-only`.
- `tests/unit/draft-order.test.ts`, `tests/unit/round-robin.test.ts` — snake order and round-robin logic.
- `tests/unit/substitution-rules.test.ts` — substitution eligibility rules.
- `tests/unit/signup-kind.test.ts` — when player vs sub signups are open.
- `tests/unit/opgg.test.ts` — OP.GG URL derivation from Riot IDs.
- `tests/unit/player-stats.test.ts` — directory W–D–L tallies (subs, sat-out, Bo2 draws, 10-man) and rank helpers (`bestRankPerUser`).
- `tests/unit/season-schedule.test.ts` — `seasonSchedule` ordering, skipping unset dates, group stage range.
- `tests/unit/standings.test.ts` — `rankStandings`: Bo2 points, head-to-head, series wins, tiebreaker games, shared ranks.
- `tests/unit/discord.test.ts` — `normalizeDiscordUsername`, `normalizeDiscordUserId`.
- `tests/unit/riot-id.test.ts` — `parseRiotId` (`GameName#TAG`).
- `tests/unit/team-name.test.ts` — team-name rules and the text-channel slug.
- `tests/unit/event-format.test.ts` — event catalogue, inbox sentences and diffs.
- `tests/unit/prize-pool.test.ts` — prize split parsing, per-place payouts, USD formatting.
- `tests/unit/discord-plan.test.ts`, `discord-format.test.ts`, `discord-ticker.test.ts`, `discord-verify.test.ts` — Discord sync decisions, message formatting, announcements-ticker text, interaction signatures.
- `playwright.config.ts` — e2e config: serial, builds + starts the app on :3100 with auth URLs overridden to localhost.
- `tests/e2e/global-setup.ts` / `global-teardown.ts` — seed run-scoped admin + players; delete all e2e-tagged data afterwards.
- `tests/e2e/support/` — `env.ts` (DB URL, markers), `db.ts` (assert helpers incl. `getCaptainTeams` / `getTeams` keyed by primary captain, `cleanupE2EData`), `seed.ts` (users, signups, `seedDraftSeason`), `pages.ts` (sign-in, live-board + admin-draft helpers, `freezeLiveUpdates`).
- `tests/e2e/draft.spec.ts` — full season draft through the UI. `tests/e2e/draft-edge-cases.spec.ts` — captain limits, short pool, SSE undo race, simultaneous picks. `tests/e2e/draft-duo.spec.ts` — duo captains: pair/split/move/remove, captain lock, mixed solo/duo draft, sub-only signup, sub request by the non-primary captain.

## Scripts

- `scripts/backfill-events.mjs` — dry run / `--apply`: reconstructs events inbox rows from existing timestamps (retention window, before the first live event). See EVENTS.md.
- `scripts/create-test-admin.mjs` — creates (or resets) the `claudius` admin test account in `DATABASE_URL`; credentials only in `.env.local` (`TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`, generated if missing). See TESTING.md.
- `scripts/e2e-cleanup.mjs` — `npm run test:e2e:cleanup`: deletes e2e-tagged seasons/users; `--legacy` also removes the old seed-test-season data.
- `scripts/season-12-setup.mjs` — one-off: deletes every season + 10-man and obvious test users (numbered bot usernames / test email domains, never admins), then creates Spicy League Season 12 (Bo2 group stage). Dry run unless `--apply`. Needs migrations 0005 and 0007.
- `scripts/seed-test-season.ts` — refuses to run without `ALLOW_TEST_SEED=1` (it writes to the live DB from `.env.local`). Seeds `test-s1` LoL season with 4 captain + 16 bot accounts (re-runnable; cleans first). Run with `ALLOW_TEST_SEED=1 npx tsx --env-file=.env.local scripts/seed-test-season.ts`. Credentials are in the file header.

## App root

- `src/app/layout.tsx` — `<html>`, Geist + Geist Mono fonts, skip link, SiteHeader, `<main id="main">` (the only `<main>`), SiteFooter. Declares `metadata.icons`/`manifest`/`openGraph` and a dark `viewport.themeColor`.
- `src/app/error.tsx` — root error boundary (client). "Try again" calls `unstable_retry()`.
- `src/app/not-found.tsx` — 404 for `notFound()` and unmatched URLs.
- `src/app/template.tsx` — per-route `animate-page` fade wrapper.
- `src/app/page.tsx` — home; calls `getHomepageData()` + `getAnnouncements()` and renders the announcements ticker, Hero, exactly one state section and `PastSeasonsStrip`. Hero label: `LIVE_STATE_COPY` for live states, `HERO_LABELS` (upcoming / off-season) otherwise.
- `src/app/globals.css` — design tokens (freelance hex + shadcn OKLCH), typography, animations, `.tint-subtle-warm`, `.legal-prose`. See [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

## Home-page sections (`src/app/_sections/`)

Rendered by `src/app/page.tsx`:
- `hero.tsx` — headline (hard-coded "Spicy League Season 12: League of Legends"), tagline, CTAs, backdrop clip for `game`. Accepts `liveLabel` + `liveHref` overrides.
- `announcements-ticker.tsx` — full-width band between the nav and the hero scrolling the latest 6 Discord #announcements messages (CSS marquee, `.ticker-*` in `globals.css`); renders nothing when there are none.
- `signup-section.tsx` — `signup_lol` / `signup_cs2` state: signup count + top-ranked (LoL) or random (CS2) players.
- `draft-section.tsx` — `draft` state: captain badges + top non-captains; CTA to draft or season page.
- `live-section.tsx` — `live` state: next scheduled match + top players.
- `upcoming-section.tsx` — `upcoming` state (signups_open with future `signupOpensAt`).
- `off-season-section.tsx` — `off_season` state: last season podium.
- `past-seasons-strip.tsx` — last 3 complete seasons, always rendered.
- `prize-pool-line.tsx` — `PrizePoolLine` ("$250 prize pool · 1st $187.50 · 2nd $62.50") used by the signup, draft and live sections; renders nothing without a prize pool.

## Public season pages

- `src/app/seasons/page.tsx` — list of non-draft seasons (active + past split); active cards show the prize pool.
- `src/app/seasons/[slug]/page.tsx` — season detail. `StatusPanel` renders per-state CTA. Prize pool tiles (pool + each place's payout) above the schedule. Looks up champion from `matches` when complete.
- `src/app/seasons/[slug]/signup/page.tsx` — signup form (LoL: roles, CS2: maps; "interested in being a captain" checkbox, pre-filled from `users.captainInterest`, hidden for sub signups). Not in the league Discord server → a "join the Discord" notice with `DISCORD_INVITE_URL`; missing a Discord username or (LoL) a Riot link → a notice listing what to add on `/profile`; either replaces the form.
- `src/app/seasons/[slug]/signup/actions.ts` — `submitSignup`, `leaveSubList` (sub signups only; refused while booked in an unplayed match). `submitSignup` validates state + window + one-per-user + Discord username + in the Discord server + Riot link (LoL) + required quandary answer. Draft-pool signups also save the captain checkbox to `users.captainInterest`.
- `src/app/seasons/[slug]/captains/page.tsx` — announced captain list (duos grouped on one line).
- `src/app/seasons/[slug]/draft/page.tsx` — live draft viewer. Fetches initial snapshot, renders `<LiveBoard>`.
- `src/app/seasons/[slug]/draft/live-board.tsx` — client component; SSE-subscribes to `/api/draft/[slug]/stream`; shows solo-queue rank per pool player (LoL).
- `src/app/seasons/[slug]/draft/actions.ts` — `submitPick`, `startDraft`, `pauseDraft`, `resumeDraft`, `undoLastPick`. Full validation chain in `submitPick` — see [DRAFT.md](DRAFT.md).
- `src/app/seasons/[slug]/matches/sub-actions.ts` — `requestSub`, `withdrawSub`, `decideSub` (approve / reject / revoke), `pingSubListAction` (Discord Sub list ping).
- `src/app/seasons/[slug]/matches/[matchId]/_components/lineups.tsx` — `MatchLineups`: rosters with subs, sub requests, request form.
- `src/app/users/[username]/_components/match-history.tsx` — profile match history list (Sub / Sat out tags).
- `src/app/seasons/[slug]/teams/page.tsx` — team rosters with roles, record, "Your team" highlight. Captains (and admins) get a "Rename team" form on their card.
- `src/app/seasons/[slug]/teams/actions.ts` — `renameTeam`: captain of that team (until complete) or admin; name rules + per-season uniqueness; renames the Discord role/channels in the background.
- `src/app/seasons/[slug]/matches/page.tsx` — standings (W/D/L + maps for Bo2, shared ranks, playoff cut line, tiebreak footnote), bracket (`BracketCard`), tiebreaker list, schedule with times (`MatchLine`).
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
- `src/app/admin/page.tsx` — admin overview (Events button with unread count, stats, needs-attention list, active seasons, newest accounts, latest signups) + all seasons.
- `src/app/admin/events/page.tsx` — events inbox: filters, unread highlight, paging. `actions.ts` — `markAllEventsRead`.
- `src/app/admin/users/page.tsx` — player search/filters, ban + unban forms. `actions.ts` — `banUserAction`, `unbanUserAction`.
- `src/app/admin/seasons/new/page.tsx` — create season form (incl. prize pool + payout split, also on the edit form).
- `src/app/admin/seasons/actions.ts` — `createSeason`, `updateSeason`, `transitionSeasonState` (→ `captains_selected` schedules the Discord Captain role sync), and the Discord card's `syncDiscordRoles`, `setDiscordNicknames`, `deleteOldDiscordChannels`, `emailDiscordUnmatched`. zod-validated.
- `src/app/admin/seasons/[slug]/page.tsx` — edit metadata + state transition buttons + "Discord roles" card (match status per player, Sync button).
- `src/app/admin/seasons/[slug]/signups/page.tsx` — signup roster (draft pool vs sub only, Discord username + matched ID, LoL best solo rank + Riot ID or "No Riot account linked"), "Wants captain" badge + filter (`?captain=1`) and an "Interested in captaining" list in the Captains card (`users.captainInterest`), captain promotion UI, captains grouped by team with Pair with… / Split for duo captains.
- `src/app/admin/seasons/[slug]/signups/actions.ts` — `promoteCaptain`, `demoteCaptain`, `moveCaptain` (whole team; swap via a `-1` placeholder), `pairCaptain` / `splitCaptain` (duo captains), `removeSignup` (pre-draft only; drops captain spot + renumbers), `getSignupStats`. Captain changes lock once the draft starts; `renumberCaptains` keeps duos on one order.
- `src/app/admin/seasons/[slug]/draft/page.tsx` — admin draft board with start/pause/resume/undo controls.
- `src/app/admin/seasons/[slug]/matches/page.tsx` — schedule generation + playoff seeding + confirm/dispute/reset buttons.
- `src/app/admin/seasons/[slug]/matches/actions.ts` — `generateMatchSchedule`, `seedPlayoffsAction`, `createTiebreakersAction`.

## Auth pages

- `src/app/signin/page.tsx` + `_components/sign-in-form.tsx` — **username** + password sign-in with "remember me" checkbox. Client form calls `signInWithUsername`.
- `src/app/signin/actions.ts` — `signInWithUsername`: looks up email by username, calls `auth.api.signInEmail`. Returns `{ error }` / `{ ok }`; maps `EMAIL_NOT_VERIFIED`.
- `src/app/signup/page.tsx` + `_components/sign-up-form.tsx` — signup form. Captures username, Discord username, email, password, confirm.
- `src/app/signup/actions.ts` — `registerUser` server action. Validates username regex + uniqueness and the Discord username (format + uniqueness), calls `auth.api.signUpEmail`, writes `username` + `discordUsername` to DB, redirects to `/signin/check-email?type=verify`.
- `src/app/signin/check-email/page.tsx` — "verify your email" confirmation page.
- `src/app/forgot-password/page.tsx` + `_components/forgot-password-form.tsx` — trigger reset email.
- `src/app/reset-password/page.tsx` + `_components/reset-password-form.tsx` — consume reset token.
- `src/app/profile/page.tsx` — private profile + account-link UI. Contains inline `saveProfile`, `saveOpggUrl`, `saveDiscordUsername` (highlighted card while unset), `saveTenManPings`, `saveCaptainInterest` ("Captaining" card) and `doSignOut` server actions and the `ERROR_MESSAGES` map.
- `src/app/profile/account-actions.ts` — `linkRiotAccount`, `unlinkRiotAccount` (by `linkId`), `linkCs2Account`, `unlinkCs2Account`, `manualRefreshStats` (rate-limited).
- `src/app/profile/_components/link-forms.tsx` — client `RiotLinkForm` / `Cs2LinkForm` (`useActionState`, inline errors, input kept).
- `src/app/profile/constants.ts` — `MAX_RIOT_ACCOUNTS = 3`.

## Other pages

- `src/app/history/page.tsx` — hardcoded season archive (13 entries: Seasons 1–11 incl. separate S11 LoL/CS2, plus Zero Space special; images from `public/history/`). Jump-to-season chip nav (`seasonAnchor` ids).
- `src/app/history/_components/zoomable-image.tsx` — client; tap a screenshot to open it full-size in a native `<dialog>`.
- `src/app/users/page.tsx` — public player directory ("Players" in the nav).
- `src/app/users/_components/player-directory.tsx` — client; search box, A–Z jump bar, grouped player rows with stats + rank.
- `src/app/users/[username]/page.tsx` — public profile; per-Riot-account rank + top champs, Steam/Leetify links. Admins also get the "Admin tools" card (`?saved=` / `?error=` flash).
- `src/app/users/[username]/_components/admin-account-tools.tsx` — admin-only card: edit Discord username, set/clear the matched Discord user ID, link/unlink Riot accounts, refresh stats (no rate limit). `ADMIN_ERROR_MESSAGES`.
- `src/app/users/[username]/admin-actions.ts` — `requireAdmin` actions behind that card; the target is the hidden `userId` field.
- `src/app/users/[username]/_components/stats-tabs.tsx` — client tab switcher (LoL / CS2).
- `src/app/terms/page.tsx`, `src/app/privacy/page.tsx` — static legal pages using `LegalPage`.

## API routes

- `src/app/api/auth/[...all]/route.ts` — Better Auth handler via `toNextJsHandler`.
- `src/app/api/draft/[slug]/stream/route.ts` — season draft SSE. 2-second DB poll, emits `update` on hash change, keep-alive ping otherwise. `maxDuration = 300`. See [DRAFT.md](DRAFT.md).
- `src/app/api/ten-man/[id]/stream/route.ts` — 10-man SSE, same pattern. See [TEN-MAN.md](TEN-MAN.md).
- `src/app/api/cron/refresh-stats/route.ts` — daily cron. `CRON_SECRET` bearer auth. Prunes old events, calls `refreshAllRiotStats()`, logs `stats.refreshed`.


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
- `src/db/schema/events.ts` — `events` (admin events inbox).
- `src/db/schema/ten-mans.ts` — `tenMans`, `tenManSignups`, `tenManVotes`, `tenManCaptains`, `tenManPicks`. `ten_man_state` enum.

Migrations: `drizzle/0000_baseline.sql` (full schema + partial index), `drizzle/0001_reconcile_live_schema.sql` (idempotent fix-up for DBs from the pre-squash history), `drizzle/0002_user_bans.sql` (ban columns), `drizzle/0003_match_substitutions.sql` (subs table), `drizzle/0004_sub_signups.sql` (signup kind), `drizzle/0005_season_schedule.sql` (schedule dates), `drizzle/0006_signup_quandary.sql` (signup answer), `drizzle/0007_group_bo2.sql` (group series length + tiebreaker stage), `drizzle/0008_discord_username.sql` (Discord username), `drizzle/0009_discord_roles.sql` (Discord user ID + team role ID), `drizzle/0010_discord_team_channels.sql` (team channel + season category IDs), `drizzle/0011_discord_threads_pings.sql` (match thread ID + 10-man ping opt-in), `drizzle/0012_events.sql` (events inbox), `drizzle/0013_captain_interest.sql` (captain interest flag), `drizzle/0014_prize_pool.sql` (prize pool + split), plus `drizzle/meta/`. See [DATA-MODEL.md](DATA-MODEL.md) → Migrations.

## Business logic (`src/lib`)

- `src/lib/utils.ts` — `cn()` from clsx + tailwind-merge.
- `src/lib/env.ts` — t3-env + zod schema. See [ENV.md](ENV.md).
- `src/lib/seasons.ts` — `SEASON_STATES`, `SUB_SIGNUP_STATES` + `openSignupKind` (player vs sub signups) + `resolveSignupKind` (sub-only choice), `TRANSITIONS` state machine, `nextStates`, `canTransition`, `SEASON_STATE_LABELS`, `GAME_LABELS`, `PUBLIC_STATES`, `isPublic`, `isValidSlug`, `slugify`, `seasonSchedule` (ordered key-dates list).
- `src/lib/prize-pool.ts` — `prizePayouts` (dollars per place from `seasons.prizePool` / `prizeSplit`), `parsePrizeSplit` ("75/25"), `formatPrizeSplit`, `formatUsd`, `describePayouts`.
- `src/lib/draft.ts` — `TEAM_SIZE`, `PICKS_PER_TEAM`, `picksForTeam`, `snakeOrder` (skips full teams), `groupCaptainTeams` / `loadCaptainTeams` (solo + duo captains), `teamForPick`, `totalPicks`, `getDraftSnapshot` (incl. solo-queue rank per pool player), `finalizeDraft`. See [DRAFT.md](DRAFT.md).
- `src/lib/standings.ts` — pure `rankStandings`: points (2/1/0), head-to-head mini-table, series wins, game diff, tiebreaker games; shared ranks + `tiebreakersNeeded`. `PLAYOFF_SPOTS`.
- `src/lib/match-format.ts` — pure: `isDraw` / `hasResult` / `resultFor`, `BO2_RESULTS`, `GROUP_BEST_OF_OPTIONS`, `formatStructure`, `roundLabel`.
- `src/lib/schedule.ts` — `buildRoundRobin` (circle method), `generateSchedule`, `computeStandings` (DB wrapper around `rankStandings`), `seedPlayoffs` (refuses with `needs-tiebreaker`), `createTiebreakers`, `getTeamForCaptain` (captain *or* rostered member), `getCaptainedTeamId` (captains only, either of a duo). See [MATCHES.md](MATCHES.md).
- `src/lib/homepage.ts` — `getHomepageData()` (discriminated union of 6 home states), podium builder.
- `src/lib/rank.ts` — pure LoL rank helpers: `formatRank` ("Gold II · 45 LP"), `formatTier` ("Gold II"), `rankScore` (lower = better), `bestRankPerUser` (best solo rank across a user's linked accounts — use it anywhere one rank per player is shown), `capitalize`.
- `src/lib/player-stats.ts` — pure tallies for the player directory: `tallyMatchRecords` (derived lineups, sat-out excluded), `tallyTenManRecords`.
- `src/lib/players.ts` — `getPlayerDirectory()`: onboarded users A–Z with career stats, from whole-table queries tallied in memory.
- `src/lib/backdrop-clips.ts` — home-row backdrop clip registry (`backdropClip(game, index)`, `placeholderBackdrop(game)` for the still-art "Signups open" row, `otherGame`). LoL clips `lol-1..3` are live (`loopSources(id)` → WebM + MP4); CS2 clips still have `sources: []`.
- `src/lib/live-season.ts` — `getLiveSeason`, `LIVE_STATE_COPY`, `liveSeasonHref`. Used by header pill + home hero.
- `src/lib/ten-man.ts` — `PICK_ORDER_C1_C2`, `getActiveTenMan`, `getTenManSnapshot`, `getRecentTenMans`, `electCaptains`. See [TEN-MAN.md](TEN-MAN.md).
- `src/lib/riot-links.ts` — `hasRiotLink(userId)`: whether a user has a linked Riot account.
- `src/lib/riot-id.ts` — pure `parseRiotId(raw)`: `GameName#TAG` → parts or null.
- `src/lib/account-edits.ts` — `setDiscordUsername`, `setDiscordUserId`, `addRiotLink`, `removeRiotLink` for any user + actor; shared by `/profile` and the admin tools on `/users/[username]`. Admin edits log the player as `subjectUserId`.
- `src/lib/signup-gate.ts` — `missingSignupRequirements(userId, season)`: the season signup gate (Discord username + membership in the league server always, Riot link for LoL). The server check fails open.
- `src/lib/discord.ts` — pure `normalizeDiscordUsername` + `DISCORD_USERNAME_HELP`; shared by account signup and the profile form. `normalizeDiscordUserId` (17–20 digit snowflake) for the admin override.
- `src/lib/discord-api.ts` — Discord REST client for the bot (`discordConfig`, members, roles, channels, threads, messages, nicknames); sits through short 429s (5s, 15s for member role adds/removes). See [DISCORD.md](DISCORD.md).
- `src/lib/discord-plan.ts` — pure role-sync decisions: `pickExactMember`, `roleHolderChanges`, `staleTeamRoles`.
- `src/lib/discord-roles.ts` — shared bot plumbing (`grant`, `revoke`, `leagueRoleId`, `syncExclusiveRole`, `syncInBackground` via `after()`, `mergeReports`), `syncCaptainRole`, `syncTeamRoles` (team roles + private text/voice channels), `renameTeamInDiscord`.
- `src/lib/discord-ping-roles.ts` — Signed up / Sub list (`syncSignupRoles`, `updateSignupRolesForUser`), Champion (`syncChampionRole`), 10-man (`setTenManRole`, `syncTenManRole`).
- `src/lib/discord-notify.ts` — match threads (`ensureMatchThreads`), team schedules (`postTeamSchedules`), result / sub-decision notes (`notifyMatchEvent`, `notifySubDecision`), sub-list and 10-man pings (`pingSubList`, `pingTenMan`), `sendDailyReminders`.
- `src/lib/discord-sync.ts` — `syncSeasonDiscord`: every sync, for the admin button.
- `src/lib/discord-admin.ts` — admin card roster (`getDiscordRoster`), `syncNicknames`, `deleteOldTeamChannels`, `emailUnmatchedPlayers`.
- `src/lib/discord-format.ts` — pure message formatting (`discordTime`, mentions, `resultLine`, `standingsTable`) and ticker text (`plainMessageText`, `tickerItems`).
- `src/lib/discord-announcements.ts` — `getAnnouncements` for the home-page ticker: latest channel messages (optionally only `DISCORD_ANNOUNCEMENTS_AUTHOR_IDS`' posts) as plain text, `unstable_cache`d for 5 min, `[]` on any failure.
- `src/lib/discord-commands.ts` — slash command handlers (`handleCommand`); `src/lib/discord-verify.ts` — Ed25519 request check.
- `src/app/api/discord/interactions/route.ts` — Discord interactions endpoint (slash commands).
- `src/app/api/cron/discord-reminders/route.ts` — daily Discord reminders (Vercel cron, `CRON_SECRET`).
- `scripts/discord-register-commands.mjs` — registers the slash commands in the league server (dry run unless `--apply`).
- `src/lib/team-name.ts` — pure `normalizeTeamName` (3–32 chars, no `@`/`#`), `teamTextChannelName`, `TEAM_NAME_HELP`.
- `src/lib/opgg.ts` — pure `opggUrlForRiotId(handle)`: NA OP.GG URL from a stored `gameName#tagLine`.
- `src/lib/riot-api.ts` — Riot API client. `getAccountByRiotId`, `getRankEntries`, `getTopChampions`, `getChampionName` (Data Dragon).
- `src/lib/stat-refresh.ts` — `refreshRiotStats(userId)` (all of a user's Riot links), `refreshAllRiotStats` (every Riot link); per-link delete-then-insert, 1200ms sleep between links.
- `src/lib/rate-limit.ts` — Upstash sliding-window. Specs: `magicLink` (unused), `statRefresh`, `subPing`. Fails open if Upstash env missing.
- `src/lib/substitution-rules.ts` — pure sub eligibility rules (`evaluateSubRequest`, `MAX_SUBS_PER_TEAM`, error messages).
- `src/lib/substitutions.ts` — sub DB helpers: eligibility check, derived lineups, candidates, player match history, pending requests.
- `src/lib/bans.ts` — `isBanActive`, `getActiveBan` (DB read), `banUser` (also deletes sessions), `unbanUser`, `banMessage`.
- `src/lib/events.ts` — `logEvent`, `matchEventData`, `pruneOldEvents` (60-day retention), `listEvents` (filters + cursor), `unreadFor` / `countUnreadEvents` / `markEventsSeen`.
- `src/lib/event-format.ts` — pure: `EVENT_TYPES` → category, `describeEvent` / `describeDetails` (sentence segments, diffs), `diffFields`.
- `src/lib/admin-overview.ts` — `getAdminOverview()`: stats, newest accounts, latest signups, active seasons, action items.
- `src/lib/safe-redirect.ts` — `safeCallbackUrl` (same-origin paths only) + `signInHref(path)` for sign-in links that return the user.
- `src/lib/season-meta.ts` — `getSeasonName` (request-cached) + `seasonPageMetadata("Page")` for season sub-page `<title>`s.

## Site chrome

- `src/components/site-header.tsx` — server; calls `auth()`, `getLiveSeason()`, `getActiveTenMan()`; builds the live pill (season first, else 10-man).
- `src/components/site-header-client.tsx` — sticky nav (live pill inline — "Live" below xl, full label at xl — then Seasons / History / 10-man / Players / Admin), scroll blur, mobile hamburger overlay (also shows the pill).
- `src/components/site-footer.tsx` — async server component; nav links (Seasons / History / 10-man / Players), session-aware Account links, Terms / Privacy, Riot "Legal Jibber Jabber" / Valve footage notice.
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
- `src/components/ui/local-time.tsx` — client; `LocalTime` (formats a date in the viewer's timezone; presets incl. `month-day`), `LocalDateTimeInput` (datetime-local that submits UTC ISO), `useHydrated`.
- `src/components/ui/confirm-submit-button.tsx` — client; `PendingSubmitButton` that `confirm()`s first. Destructive admin forms.
- `src/components/ui/pending-submit-button.tsx` — client; submit `Button` that shows a spinner and disables itself while its form's server action runs (`useFormStatus`). Every server-component action form.

shadcn (OKLCH tokens):
- `alert.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sonner.tsx`, `textarea.tsx` — standard shadcn generators under `src/components/ui/`.

## Public assets

- `public/videos/` — home-row backdrop loops: `lol-1..3` as `.webm` (AV1) + `.mp4` (H.264), 10s each.
- `public/videos/posters/` — backdrop posters: `lol-1..3.jpg` (first frame of each clip), `lol-placeholder.svg` (still art for the "Signups open" row), `cs2-1/2.svg` placeholders.
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
- `docs/INTEGRATIONS.md` — Neon, Better Auth + Resend, Riot, Upstash, Discord, Vercel Cron.
- `docs/DISCORD.md` — the Discord bot: roles, team channels, match threads, slash commands, announcements ticker, signup gate, setup.
- `docs/EVENTS.md` — admin events inbox: `logEvent` call sites, unread, retention, backfill.
- `docs/TESTING.md` — unit tests, the e2e draft suite, the `claudius` test admin.
- `docs/DESIGN-SYSTEM.md` — two token systems, typography, animations, primitives.
- `docs/ENV.md` — env vars + what breaks without them.
- `docs/FILE-MAP.md` — this file.
- `docs/design/10-man/` — original 10-man design handoff (README spec, IMPLEMENTATION-PLAN, HTML prototype, screenshots). Historical; [TEN-MAN.md](TEN-MAN.md) is current.
- `docs/design/SUBSTITUTIONS.md` — substitutions design + rationale. [MATCHES.md](MATCHES.md) → Substitutions is current.
