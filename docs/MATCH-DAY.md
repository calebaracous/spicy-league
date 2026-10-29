# Match day: RPS side select, draft room, game results

What's **shipped** of match day. The full plan (per-game results, our own
draft room, stats, Riot Tournament API) and every agreed decision live in
[design/MATCH-DAY.md](design/MATCH-DAY.md); facts move here as phases ship.

Shipped: **phase 1** — rock paper scissors decides who picks game 1's side,
plus the stats opt-in; **phase 2** — per-game results, the loser picks the
next side, the match confirms itself when the series is decided, and the
admin Edit result tool; **phase 3** — our own pick/ban draft room per game. LoL seasons only (`matchDayApplies(season)`); CS2
match pages are unchanged.

## Flow

```
captains ready up (one seat per team) ─▶ round: 10s to throw ─▶ reveal 3s
                                              ▲                    │
                                              └── tie / no throw ──┤
                                                                   ▼ winner
                                   match_games #1: winner picks blue/red (60s, else random)
                                                                   │
              ┌─── a captain records "X won game N" ◀─ game N is played ◀─┘
              │
              ├─ series not decided ─▶ game N+1: the loser picks blue/red (60s) ─▶ …
              └─ series decided ─────▶ match reported + confirmed (game count as score)
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
- Actions refuse once the match isn't `scheduled` ("already has a result"),
  except `flagGameResult`.

## Game results (phase 2)

- **Series length**: `bestOfFor(season, stage)` (`src/lib/series.ts`) —
  group `groupBestOf`, tiebreaker 1, semis `playoffBestOf` (default 3),
  final `finalBestOf` (default 5). `seriesScore(bestOf, games, teams)`: even
  lengths (the Bo2 group) play every game and can end level; odd lengths
  stop at a majority. Unit-tested in `tests/unit/series.test.ts`.
- **Recording**: `reportGameWinner(slug, matchId, gameNumber, winnerTeamId)`
  — any captain of either team, or an admin, once that game's sides are
  set. Not decided → inserts game N+1 with `sideChooserTeamId` = the loser
  (`loserOf`) and a 60s `sideDeadline`; `pickSide` then records
  `sideChosenVia = 'loser'`.
- **Corrections**: re-recording a game with the other team is allowed for
  captains until game N+1's sides are set (the pending side pick is deleted
  and re-created for the new loser); after that only admins. The card shows
  it as "Wrong? X won".
- **Decided** → `confirmWithResult` (`src/lib/match-results.ts`) sets the
  winner (null on a Bo2 1–1), `homeScore` / `awayScore` = games won, and
  `state = 'confirmed'` straight away — no admin confirm (decision 19) — then
  `applyConfirmEffects`, the same path as the admin Confirm button: the final
  after both semis, season complete + champion on the final, Discord,
  revalidation. Logs `match.game_result` per game and `match.confirmed`
  (`auto: true`).
- **Flag**: `flagGameResult` — a captain marks a recorded game as wrong, also
  after the confirm. The result stands; `resultFlaggedAt` shows "Flagged for
  an admin" on the card and ⚑ in Edit result, and `match.game_result_flagged`
  lands in the events inbox.
- **Admin Edit result** (`adminEditResult` in
  `src/app/seasons/[slug]/matches/actions.ts`): on the match page admins get
  this form instead of Report result, in any match state — each match-day
  game's winner plus the series result (pre-filled from the games before
  anything's reported). Saves and confirms through `confirmWithResult`, so a
  changed semi re-teams an unplayed final and a changed final re-crowns the
  champion; clears flags; logs `match.result_edited`.

## Draft room (phase 3)

Every game with sides set has a draft room at
`/seasons/[slug]/matches/[matchId]/games/[n]` (public; captains act). The
card shows the draft's status with **Open draft room** while it isn't done,
and captains can only record that game's winner once the draft is
`complete` or `skipped` (admins always can).

- **Clock** (`src/lib/draft-clock.ts`, pure, `tests/unit/draft-clock.test.ts`):
  `match_games.draftState` `waiting` → both sides `readyDraft` (captain of
  that side, or an admin for either; un-ready allowed while waiting) →
  `countdown` (3s, `draftStartsAt`) → `drafting` (30s `stepDeadline` per
  step) → `complete` after 20 steps. `skipped` = an admin let the game go
  ahead without a draft here. Lapsed steps are applied lazily by
  `settleMatchDay` like RPS: the side's hover locks if it's still available,
  otherwise a **ban is skipped** and a **pick is random** (`resolveTimeout`).
  Without the champion list a timed-out step waits for the next tick.
- **Order** (`DRAFT_SEQUENCE`, `src/lib/draft-room.ts`): bans B R B R B R,
  picks B R R B B R, bans R B R B, picks R B B R. The step on the clock is
  `actions + 1`, never stored.
- **Actions** (`match-day-actions.ts`): `hoverChampion(n, step, key|null)`
  (shown to everyone, locks on timeout) and `lockChampion(n, step,
  key|null)` (null = skip a ban) for the side on the clock — its captains or
  an admin; the `step` argument makes a late click fail. Admin:
  `adminUndoDraftStep` (back one step, fresh 30s), `adminSetDraft(n,
  "skipped" | "restart")`.
- **Availability** (`draftAvailability`, `availableChampions`): the Data
  Dragon catalogue (`getChampionCatalog`, daily revalidate) minus this
  game's bans/picks, `seasons.disabledChampions` (admin season form,
  `resolveChampionKeys`) and, when `fearlessApplies`, every champion
  **picked** in an earlier game of the match (earlier bans don't carry
  over). The grid greys and labels them Banned / Picked / Fearless /
  Disabled.
- **Storage**: `match_draft_actions` (one row per step, `championKey` null =
  skipped ban, `auto` = taken by the clock); a champion appears once per
  game (hand-written partial unique index in `0018_match_draft.sql`).
- **UI** (`_components/draft-room.tsx`): status bar (ready boxes →
  countdown → "BLUE BAN 2 · step n/20" + timer → done), blue and red
  columns (5 ban slots, 5 pick slots, the on-the-clock hover shown faded),
  champion grid with search; Lock in / Skip ban sticky above the grid on
  your turn; admin Undo / Skip / Restart. Icons are plain `<img>` from Data
  Dragon (no next/image optimisation). Same stream as the card; countdown
  ticks re-render only the status bar.

## State + deadlines

Tables in `src/db/schema/match-day.ts` (migration `0016_match_day`):
`match_rps` (one row per match: seats, ready stamps, `state` `waiting |
throwing | revealed | done`, `round`, `throwDeadline`, `revealUntil`,
current throws, `history` jsonb of finished rounds, `winnerTeamId`) and
`match_games` (one row per game: sides, and since `0017_match_games_results`
`winnerTeamId`, `resultReportedBy/At`, `resultFlaggedBy/At`; since
`0018_match_draft` the draft clock — `draftState`, ready stamps,
`draftStartsAt`, `stepDeadline`, hovers, `draftCompletedAt`) and
`match_draft_actions`;
`tournamentCode` / `riotMatchId` reserved for phase 6). See
[DATA-MODEL.md](DATA-MODEL.md).

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
pick, a draft counting down or running, a readied draft side) and **2s** idle. The hash ignores `serverNow`. The viewer
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
on the match page above Lineups, titled "Match day": ready-up → throw
buttons + countdown → reveal (both throws, winner / tie / roast) → side pick
(Blue / Red + 60s) → "Game N is on" with "X won" buttons → the loser's side
pick → … Once games have results, a series line ("Best of 3 · A 1–0 B")
and the games list (sides, winner, who recorded it, Wrong? / Flag as wrong).
Shown while the match is scheduled, and afterwards only if sides were set.
Admins get "Reset match day" (wipes RPS, sides and game results; the
series result stays).

## Discord

`notifyMatchSides(matchId, gameNumber)` posts "🔵 Game 1: X on blue, 🔴 Y on
red (won rock paper scissors). Draft room: <link>" in the match thread —
from `pickSide`, and
from `resolveExpired` when the clock picked at random.
`notifyGameResult(matchId, gameNumber)` posts "🏁 Game 1: X won. Series: …"
and who picks the next side; a decided series then gets the usual
"✅ Confirmed" note. See [DISCORD.md](DISCORD.md).

## Stats opt-in

`users.statsOptInAt` — required to sign up for a LoL season, toggle on
`/profile`, "Public stats" column on the admin signups page. Nothing reads
it for display yet (per-player Riot stats are phase 6). See
[SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md) and decision 20 in the design doc.

## Trying it by hand (staging)

`node scripts/seed-rps-test.mjs` (staging only — refuses the production
`DATABASE_URL`) seeds season `rps-test`: Team A (`rps_cap_a`, plus
`claudius` as duo co-captain) vs Team B (`rps_cap_b`) in two best-of-2
group matches and a best-of-3 semifinal, and prints their URLs. Both captains use `TEST_CAPTAIN_PASSWORD`
from `.env.development.local` (generated on first run, never printed).
Re-running resets the matches and wipes their RPS / side / game data. Use two
browsers (or a private window) to play both captains.
