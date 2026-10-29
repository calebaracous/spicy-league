# Match day: RPS side select

What's **shipped** of match day. The full plan (per-game results, our own
draft room, stats, Riot Tournament API) and every agreed decision live in
[design/MATCH-DAY.md](design/MATCH-DAY.md); facts move here as phases ship.

Shipped: **phase 1** — rock paper scissors decides who picks game 1's side,
plus the stats opt-in. LoL seasons only (`matchDayApplies(season)`); CS2
match pages are unchanged.

## Flow

```
captains ready up (one seat per team) ─▶ round: 10s to throw ─▶ reveal 3s
                                              ▲                    │
                                              └── tie / no throw ──┤
                                                                   ▼ winner
                                   match_games #1: winner picks blue/red (60s, else random)
```

- **Seats**: `readyRps` — the first captain of a team (either of a duo, via
  `getCaptainedTeamId`) takes the seat; a co-captain gets "{name} is already
  playing for your team". `unreadyRps` frees it while still `waiting`. Both
  seats ready → round 1 starts in the same transaction.
- **Rounds**: `throwRps(slug, matchId, round, choice)` — locked once thrown;
  the round number makes a late click fail ("Too late") instead of landing
  in the next round. Both thrown → reveal immediately; otherwise at the
  10s deadline.
- **No throw** (decision 3): the round is **void** and replayed; the reveal
  roasts the captain who didn't throw (`griefLine`, `src/lib/rps.ts`). If
  **neither** threw `RPS_MAX_DOUBLE_VOIDS` (3) rounds in a row, RPS goes back
  to `waiting` with seats cleared.
- **Side pick**: when the reveal ends with a winner, `settleMatchDay` inserts
  `match_games` game 1 with `sideChooserTeamId` = winner and a 60s
  `sideDeadline`. `pickSide` (captain of the chooser) sets `blueTeamId` /
  `redTeamId`, `sideChosenVia = 'rps'`. Lapsed → random side, `'auto'`.
- **Admin**: `adminResetMatchDay` wipes `match_rps` + `match_games` for the
  match (logs `match.side_select_reset`). Admins can't throw or pick.
- Actions refuse once the match isn't `scheduled` ("already has a result").

## State + deadlines

Tables in `src/db/schema/match-day.ts` (migration `0016_match_day`):
`match_rps` (one row per match: seats, ready stamps, `state` `waiting |
throwing | revealed | done`, `round`, `throwDeadline`, `revealUntil`,
current throws, `history` jsonb of finished rounds, `winnerTeamId`) and
`match_games` (one row per game; side columns now, `tournamentCode` /
`riotMatchId` reserved for phase 6). See [DATA-MODEL.md](DATA-MODEL.md).

**No cron.** Deadlines are timestamps; the rules are pure
(`advanceRps` / `settleRps` in `src/lib/rps.ts`, unit-tested in
`tests/unit/rps.test.ts`). `settleMatchDay(tx, match, now)`
(`src/lib/match-day.ts`) applies everything lapsed — RPS steps and expired
side picks — and is called:

- by every action, right after it locks the match row (`SELECT … FOR
  UPDATE`), so an action sees the same state the clock says;
- by `resolveExpired(match)` at the top of `getMatchDaySnapshot`, i.e. on
  every stream poll and page load. It does an unlocked read first and only
  opens a transaction when something is due, locking with **SKIP LOCKED** so
  concurrent pollers don't queue (whoever holds the lock is doing the work).

New deadlines count from `now`, not the lapsed deadline, so a late poll
never chains through phantom rounds.

## Realtime

`/api/matches/[matchId]/stream` — the draft / 10-man SSE pattern
([DRAFT.md](DRAFT.md)), but **1s** while something ticks
(`matchDayIsHot`: a live round or reveal, a readied seat, an open side
pick) and **2s** idle. The hash ignores `serverNow`. The viewer
(`getMatchDayViewer`) is resolved once per connection because the snapshot
is per viewer: **throws are hidden until the round is revealed** — the
stream sends `thrown: boolean` and only the viewer's own `myThrow`.
Clients count down from the deadlines, corrected by `serverNow`.
Every action also returns the caller's fresh snapshot (even with an
expected error), which the card applies at once — waiting for the next poll
used to eat seconds of the 10s throw window. Stream frames and action
results race, so the card keeps whichever has the later `serverNow`.

## UI

`MatchDayCard` (`src/app/seasons/[slug]/matches/[matchId]/_components/match-day.tsx`)
on the match page above Lineups: ready-up → throw buttons + countdown →
reveal (both throws, winner / tie / roast) → side pick (Blue / Red + 60s) →
"Game 1: X blue vs Y red" summary. Shown while the match is scheduled, and
afterwards only if sides were set. Admins get "Reset side selection".

## Discord

`notifyMatchSides(matchId, gameNumber)` posts "🔵 Game 1: X on blue, 🔴 Y on
red (won rock paper scissors)" in the match thread — from `pickSide`, and
from `resolveExpired` when the clock picked at random. See
[DISCORD.md](DISCORD.md).

## Stats opt-in

`users.statsOptInAt` — required to sign up for a LoL season, toggle on
`/profile`, "Public stats" column on the admin signups page. Nothing reads
it for display yet (per-player Riot stats are phase 6). See
[SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md) and decision 20 in the design doc.

## Trying it by hand (staging)

`node scripts/seed-rps-test.mjs` (staging only — refuses the production
`DATABASE_URL`) seeds season `rps-test`: Team A (`rps_cap_a`, plus
`claudius` as duo co-captain) vs Team B (`rps_cap_b`) in three scheduled
matches, and prints their URLs. Both captains use `TEST_CAPTAIN_PASSWORD`
from `.env.development.local` (generated on first run, never printed).
Re-running resets the matches and wipes their RPS / side data. Use two
browsers (or a private window) to play both captains.

## Groundwork (not wired yet)

`src/lib/draft-room.ts` (20-step draft sequence, fearless availability,
timeout resolution, icon URLs; `tests/unit/draft-room.test.ts`) and
`src/lib/champions.ts` (Data Dragon catalogue) for phase 3's draft room.
