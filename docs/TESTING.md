# Testing

Two layers. Unit tests are fast and run in CI; the end-to-end suite drives
the real UI against a real database and is run on demand.

| Command | What | Needs |
|---|---|---|
| `npm run test:unit` | Vitest — pure draft/schedule logic | nothing |
| `npm run test:e2e` | Playwright — full season draft through the UI | `DATABASE_URL`, Chromium |
| `npm run test:e2e:cleanup` | Delete leftover e2e data (add `-- --legacy` for the old seed data) | `DATABASE_URL` |

## Unit tests (`tests/unit/`, `vitest.config.mts`)

- `draft-order.test.ts` — `captainOrderForPick` snake order for 2–8
  captains, `PICKS_PER_TEAM` per captain, back-to-back picks at the turn,
  `totalPicks`.
- `round-robin.test.ts` — `buildRoundRobin`: every pair once, `n-1` rounds
- `signup-kind.test.ts` — `openSignupKind`: player window, sub states, closed states
- `season-schedule.test.ts` — `seasonSchedule`: order, unset dates skipped, group stage range
- `substitution-rules.test.ts` — `evaluateSubRequest`: eligibility, lineup
  lock, cross-team flag, per-team sub limit
  for even `n`, one bye per team for odd `n`.

`src/lib/draft.ts` and `schedule.ts` import `server-only`, which throws
outside a Next server bundle; `vitest.config.mts` aliases it to an empty stub
(`tests/unit/server-only-stub.ts`). Importing those modules does not open a DB
connection — the Neon `Pool` connects lazily.

CI runs `npm run test:unit` after typecheck.

## End-to-end (`tests/e2e/`, `playwright.config.ts`)

### What it does

`webServer` runs `npm run build && next start -p 3100` with `BETTER_AUTH_URL`
and `NEXT_PUBLIC_APP_URL` overridden to `http://localhost:3100` (`.env.local`
points Better Auth at production). `E2E_SKIP_BUILD=1` reuses the last build.

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
`.env.local` — which is the **live** database. Running against it is
deliberate (decided 2026-10-13, site had no users) and safe because of the
tagging, but while the main spec runs the e2e season is the newest live
season, so the public homepage and header pill show it. Point
`E2E_DATABASE_URL` at a Neon branch to avoid that.

Workers = 1: specs share one admin and one database.

### `draft.spec.ts` — the season draft, end to end

Through the real UI, with DB assertions after each step:

1. Admin creates a LoL season, opens signups.
2. Player 20 signs up via the form; players 1–19 are seeded as signups.
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
