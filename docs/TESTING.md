# Testing

Two layers. Unit tests are fast and run in CI; the end-to-end suite drives
the real UI against a real database and is run on demand.

| Command | What | Needs |
|---|---|---|
| `npm run test:unit` | Vitest — pure logic (draft, standings, schedule, subs, Discord helpers, events, prize pool) | nothing |
| `npm run test:e2e` | Playwright — full season draft through the UI | `DATABASE_URL`, Chromium |
| `npm run test:e2e:cleanup` | Delete leftover e2e data (add `-- --legacy` for the old seed data) | `DATABASE_URL` |

## Test admin account (`claudius`)

For checking signed-in and admin pages by hand (or by an agent in the
browser). It exists on both the live database and staging (staging is a
copy, so the password is the same). `node scripts/create-test-admin.mjs`
creates `claudius` (admin, verified email `claudius@spicyleague.test`,
Discord username `spicy_claudius_test`, which isn't in the server, so the
Discord signup gate blocks it) or resets its password and role — on staging
by default; prefix `node --env-file=.env.production.local` for live, and
keep the two passwords in sync. Sign in with `TEST_ADMIN_EMAIL` /
`TEST_ADMIN_PASSWORD` from `.env.development.local`; the password is
generated on first run and never printed. It's a real admin on the live
site: don't sign it up
for real seasons, and delete it (`delete from users where username =
'claudius'`) if that password ever leaks. `test:e2e:cleanup` leaves it alone.

## Unit tests (`tests/unit/`, `vitest.config.mts`)

- `draft-order.test.ts` — `snakeOrder` for 2–8 solo captains (unchanged
  order, `PICKS_PER_TEAM` each, back-to-back picks at the turn), all-duo
  and mixed solo/duo drafts (full teams sit out, every team reaches
  `TEAM_SIZE`), `groupCaptainTeams` / `teamForPick` / `totalPicks`.
- `round-robin.test.ts` — `buildRoundRobin`: every pair once, `n-1` rounds
  for even `n`, one bye per team for odd `n`.
- `signup-kind.test.ts` — `openSignupKind`: player window, sub states, closed states; `resolveSignupKind`: sub-only choice
- `player-stats.test.ts` — `tallyMatchRecords` (sub swaps, empty-slot subs, Bo2 draws, no-result skip), `tallyTenManRecords`, `rankScore` / `formatTier` / `bestRankPerUser`
- `season-schedule.test.ts` — `seasonSchedule`: order, unset dates skipped, group stage range
- `substitution-rules.test.ts` — `evaluateSubRequest`: eligibility, lineup
  lock, cross-team flag, per-team sub limit
- `standings.test.ts` — `rankStandings`: Bo2 points, head-to-head mini-tables, series wins, tiebreaker games, shared ranks, which ties need a tiebreaker
- `opgg.test.ts` — `opggUrlForRiotId`
- `discord.test.ts` — `normalizeDiscordUsername`, `normalizeDiscordUserId`
- `riot-id.test.ts` — `parseRiotId` (`GameName#TAG`)
- `event-format.test.ts` — every `EVENT_TYPES` entry has a sentence; `describeEvent`, `diffFields` / `describeDetails`
- `prize-pool.test.ts` — `parsePrizeSplit`, `prizePayouts`, `formatUsd`
- `team-name.test.ts` — `normalizeTeamName`, `teamTextChannelName`
- `discord-plan.test.ts` — `pickExactMember`, `roleHolderChanges`, `staleTeamRoles`
- `discord-format.test.ts` — Discord timestamps, thread names, result lines, the standings table
- `discord-ticker.test.ts` — `plainMessageText` (mentions, markdown, spoilers, timestamps, truncation) and `tickerItems` (which messages the home-page ticker shows)
- `discord-verify.test.ts` — Ed25519 interaction signatures (real key pair)

`src/lib/draft.ts`, `schedule.ts` and other server modules import `server-only`, which throws
outside a Next server bundle; `vitest.config.mts` aliases it to an empty stub
(`tests/unit/server-only-stub.ts`). Importing those modules does not open a DB
connection — the Neon `Pool` connects lazily.

CI runs `npm run test:unit` after typecheck.

## End-to-end (`tests/e2e/`, `playwright.config.ts`)

### What it does

`webServer` runs `npm run build && next start -p 3100` with `BETTER_AUTH_URL`
and `NEXT_PUBLIC_APP_URL` overridden to `http://localhost:3100` (`next start`
loads `.env.production.local`, which points Better Auth at production),
`DATABASE_URL` set to the suite's database, and `DISCORD_BOT_TOKEN` /
`DISCORD_GUILD_ID` blanked so no run touches the real server.
`E2E_SKIP_BUILD=1` reuses the last build.

`global-setup.ts` generates a run id and a random password (kept in
`process.env` only — never written or logged), removes leftovers from earlier
runs, and seeds an admin + 24 verified players. `global-teardown.ts` deletes
everything the run created unless `E2E_KEEP=1`.

**Every row the suite creates is tagged** — users `e2e_<run>_*` with emails
`@e2e.spicyleague.test`, seasons with slug `e2e-<run>-*` — and cleanup
deletes only those (`cleanupE2EData` in `tests/e2e/support/db.ts`). Seasons
cascade to signups, captains, draft, picks, teams, matches; users cascade to
sessions and credential accounts.

**Which database**: `E2E_DATABASE_URL`, else `DATABASE_URL` from
`.env.development.local` — the **staging** branch ([STAGING.md](STAGING.md)).
While the main spec runs, the e2e season is the newest staging season, so
the staging homepage shows it. Running against live
(`E2E_DATABASE_URL=<live url>`) is safe because of the tagging but puts the
e2e season on the public homepage while it runs.

Workers = 1: specs share one admin and one database.

### `draft.spec.ts` — the season draft, end to end

Through the real UI, with DB assertions after each step:

1. Admin creates a LoL season, opens signups.
2. Player 20 (seeded with a Discord username, like every e2e user) sees the
   Riot-link notice instead of the form, gets a fake Riot
   link (`seedRiotLink`), then signs up via the form (quandary answered);
   players 1–19 are seeded as signups.
3. Admin closes signups, promotes players 1–4, moves #4 above #3
   (order P1, P2, P4, P3), marks captains selected, starts the draft.
4. Four captain sessions, one anonymous spectator and an admin board.
   16 picks, checking before each: everyone sees the right captain on the
   clock (hand-written snake oracle `SNAKE_4`), only that captain sees Pick
   buttons; after each: the spectator sees it within `SSE_TIMEOUT` (10s) and
   the DB row is right. Mixed in:
   - pick 3 — a captain page with live updates blocked (`freezeLiveUpdates`)
     clicks after its turn → `not-your-turn`.
   - before pick 5 — pause: spectator shows paused, Pick buttons vanish, a
     frozen page's click → `not-running`; resume.
   - after pick 6 — undo: log back to 5, clock rewinds, player returns to
     the pool; pick 6 is redone.
   - pick 9 — made by the admin, credited to the on-clock captain.
   - pick 10 — a frozen admin page picks a just-picked player → `already-picked`.
   - after pick 12 — spectator reload shows current state.
5. Draft completes: draft `completed`, season `group_stage`, 4 teams named
   `Team <captain>` of 5, pick numbers and captains match the snake, nobody
   picked twice, no captain picked.
6. Admin generates the schedule → 6 matches; public standings list all teams.

Pick-to-spectator latency is recorded as a test annotation.

`freezeLiveUpdates` aborts the page's `/api/draft/*/stream` requests so it
keeps showing Pick buttons the live board would have hidden — the only way
to exercise the server-side checks in `submitPick` from the UI.

### `draft-duo.spec.ts` — duo captains, end to end

One season seeded into `signups_open` with P1–P15 signed up, then all
through the UI with DB assertions. Teams: P1 & P2 (duo), P3 (solo),
P4 & P5 (duo) → 10 picks, hand-written oracle `ORDER = [1,2,3,3,2,1,1,2,3,2]`
(the solo team takes the last pick alone).

1. P16 signs up choosing **Sub only** → `kind = 'sub'`, sub toast and status.
2. Admin promotes P1–P5 (P16 has no Make captain), then Pair with… (twice),
   Split + re-pair, ↑/↓ a duo as one team, Remove one of a duo (partner
   stays solo) + re-promote and re-pair. `getCaptainTeams` after each.
3. Captains page groups duos with a Duo badge; admin draft page shows
   `3 teams · 0 / 10 picks` and per-team pick counts.
4. Start draft → Split is refused with `captains-locked`, order unchanged.
5. Ten picks from five captain pages + a spectator. Before each: every
   board shows `Pick n / 10` and the right team on the clock; both duo
   captains see Pick buttons and "Your pick", others none. Duo captains
   alternate clicks; each pick is credited to the team's primary.
6. Teams: names `Team A & B`, five members, both duo captains
   `pickNumber null`; P16 on no team. Teams page marks both captains and
   lists P16 under Available subs.
7. Schedule (3 matches); standings show `(A & B)`.
8. A drafted member of the duo team gets no sub form; the non-primary duo
   captain (P2) requests P16 for a named player → pending row with
   `requestedBy = P2`; admin approves.

Two waits matter. Admin actions redirect to `?saved=…` and FlashToast
strips it: `settle()` waits for the strip before the next click, otherwise
`waitForURL` matches the previous flag and the still-mounted toast swallows
the next one. And before each pick the picker's board must show
`Pick n / 10`: at a snake turn the same team stays on the clock, and a click
from a board that hasn't caught up is (correctly) rejected as `stale-pick`.

### `draft-edge-cases.spec.ts`

Seasons seeded straight into `captains_selected` / `drafting`
(`seedDraftSeason`):

- 1 captain → Start draft refused (`need-captains`).
- 2 captains → smallest draft completes, two teams of five.
- 4 captains, 15 others (one short of 16) → Start draft refused
  (`pool-too-small`). Before this guard the pool ran dry mid-draft and the
  draft could never finish.
- Undo + different pick inside one 2s poll reaches spectators. Regression
  test for the SSE change detection (it used to compare only
  `state:picks.length:onClock`). Done as one DB batch for deterministic
  timing.
- A late admin pick (admin board frozen at pick 1 after the captain has
  picked) is rejected with `stale-pick`, not credited to the next captain.
- Two picks at the same moment (captain + admin): exactly one lands as
  pick 1; the other page shows `stale-pick`. Records which side won.

### Not covered

Picking a captain or a non-signup can't be reached from the UI (never
offered), so `cant-pick-captain` / `not-in-pool` are untested. Matches,
standings and playoffs beyond schedule generation, and the 10-man flow, are
out of scope for now.

## Where to look when…

- …sign-in fails in e2e → check the `webServer.env` overrides; Better Auth
  rejects origins it doesn't trust.
- …a run died midway → `npm run test:e2e:cleanup`, or just run again
  (global setup clears leftovers first).
- …you want to inspect a run's data → `E2E_KEEP=1 npm run test:e2e`.
- …a test fails → `npx playwright show-report` (traces + screenshots kept on
  failure).
