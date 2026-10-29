# Match day: RPS side select, draft room, game results

What's **shipped** of match day. The full plan (per-game results, our own
draft room, stats, Riot Tournament API) and every agreed decision live in
[design/MATCH-DAY.md](design/MATCH-DAY.md); facts move here as phases ship.

Shipped: **phase 1** — rock paper scissors decides who picks game 1's side,
plus the stats opt-in; **phase 2** — per-game results, the loser picks the
next side, the match confirms itself when the series is decided, and the
admin Edit result tool; **phase 3** — our own pick/ban draft room per game;
**phase 4** — draft recaps (card + Discord) and who-played-what per pick;
**phase 5** — champion / side stats and per-player champions; **phase 6** —
Riot Tournament API lobby codes and automatic results (built against
tournament-stub-v5; waiting on a tournament-enabled key). LoL seasons only (`matchDayApplies(season)`); CS2
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
              ├─ series not decided ─▶ game N+1: the loser picks blue/red (5 min) ─▶ …
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
  (`loserOf`) and a 5-minute `sideDeadline` (`LOSER_SIDE_PICK_MS`; game
  1's RPS pick stays 60s, `sidePickMs` in `src/lib/rps.ts`); `pickSide`
  then records
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
  `countdown` (3s, `draftStartsAt`) → `drafting` (`stepDeadline`: **60s per
  ban, 2 minutes per pick**, `stepMs` / `deadlineFor`) → `complete` after 20
  steps. `skipped` = an admin let the game go ahead without a draft here.
  Lapsed steps are applied lazily by `settleMatchDay` like RPS: the side's
  hover locks if it's still available (`resolveTimeout`), otherwise a **ban
  is skipped** and a **pick pauses the draft**: `stepDeadline` goes null
  (`draftPaused`), a `match.draft_paused` event tells admins, and it waits
  until that side's captain or an admin locks the pick, which restarts the
  clock. The room and the card say "paused". Without the champion list a
  timed-out step waits for the next tick.
- **Order** (`DRAFT_SEQUENCE`, `src/lib/draft-room.ts`): bans B R B R B R,
  picks B R R B B R, bans R B R B, picks R B B R. The step on the clock is
  `actions + 1`, never stored.
- **Actions** (`match-day-actions.ts`): `hoverChampion(n, step, key|null)`
  (shown to everyone, locks on timeout) and `lockChampion(n, step,
  key|null)` (null = skip a ban) for the side on the clock — its captains or
  an admin; the `step` argument makes a late click fail. Admin:
  `adminUndoDraftStep` (back one step, fresh clock for that step; also
  how an admin un-pauses without picking), `adminSetDraft(n,
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

## Draft recap + players (phase 4)

- **Card**: each drafted game in the games list shows `DraftRecap`
  (`_components/draft-recap.tsx`): both sides' picks as icons with the
  player who played each (else the champion name), bans faded. The match
  page passes champion names (`getChampionCatalog`, only once a game has a
  draft) and each team's match lineup (approved subs in, sat-out players
  out).
- **Players per pick**: after a completed draft, that team's captains (or an
  admin, either team) open **Assign players** and pick a lineup player per
  champion → `assignPicks(slug, matchId, gameNumber, side, {step: userId})`.
  Validated against `getMatchLineups` (no outsiders, one champion per
  player); works after the match is confirmed too. Optional — it only feeds
  per-player champion stats. Stored in `match_draft_actions.assignedUserId`
  (migration `0019_draft_pick_players`).
- **Players claim their own**: other lineup players get **I played…** on
  their side's recap → `claimPick(slug, matchId, gameNumber, step|null)`:
  they can take a pick nobody has or move off their own (null = none), not
  one a teammate has — captains fix that with Assign players.
- **Discord**: when a draft completes (last step by hand in `lockChampion`,
  or by the clock in `resolveExpired`), `notifyDraftRecap` posts both
  sides' picks and bans in the match thread.

## Stats (phase 5)

Our own data only (drafts, game winners, pick assignments) — not Riot match
history. Completed drafts in **confirmed** matches only, like standings
(`src/lib/season-stats.ts`: `loadSeasonDraftGames`, `loadPlayerDraftGames`).
Aggregation is pure (`src/lib/champion-stats.ts`,
`tests/unit/champion-stats.test.ts`).

- **`/seasons/[slug]/champions`** (LoL; "Champions" tab in `SeasonNav`,
  which now takes `game`): blue / red win rate, how often the RPS winner won
  game 1, and a per-champion table — presence (games picked or banned),
  picks, bans, W–L, win %, blue / red picks. `?team=` narrows the table to
  that team's picks and bans and adds "Banned against {team}" (scouting);
  the side cards stay season-wide.
- **Profiles** (`/users/[username]`): "League champions" — champions the
  player was assigned in confirmed matches, with games and W–L
  (`playerChampions`, `_components/league-champions.tsx`). Shown for
  everyone, opted in or not (our data); the Riot numbers below are the
  opt-in ones.

## Riot Tournament API (phase 6)

Off until `RIOT_TOURNAMENT_PROVIDER_ID` is set ([ENV.md](ENV.md)). Client:
`src/lib/riot-tournament.ts` — tournament-v5 with `RIOT_TOURNAMENT_API_KEY`,
otherwise the personal key against **tournament-stub-v5** (real-looking ids
and codes, never any callbacks).

- **Setup** (once per environment / key): set
  `RIOT_TOURNAMENT_CALLBACK_SECRET`, run `node
  scripts/riot-tournament-setup.mjs https://<site>` → it registers a
  provider whose callback is `<site>/api/riot/tournament-callback?token=<secret>`
  and prints `RIOT_TOURNAMENT_PROVIDER_ID`. Riot ties providers to the key.
- **Lobby codes**: `getLobbyCode(n)` — lineup players (subs included) and
  admins. Creates the season's tournament on first use
  (`seasons.riotTournamentId`), then one code per game
  (`match_games.tournamentCode`; Riot: one match per code). Blind pick,
  team size 5, spectators allowed, no participant restriction (decisions
  15, 16, 18). Shown on the card only to lineup players and admins
  (`viewer.inLineup`, the snapshot blanks it for everyone else) and posted
  in both teams' private Discord channels (`notifyLobbyCode`).
- **Callback** (`/api/riot/tournament-callback`, `applyTournamentCallback`
  in `src/lib/riot-results.ts`; parsing pure in
  `src/lib/riot-tournament-parse.ts`, unit-tested): token check (Riot
  doesn't sign callbacks) → our game by `shortCode` (unknown → 200,
  ignored) → Match-v5 `NA1_<gameId>` (not there yet → **503 so Riot
  retries**) → winner by **which lineup the winning players belong to**
  (linked Riot accounts' PUUIDs), falling back to the side we recorded if
  nobody's linked (teams sometimes join the wrong lobby side) →
  `riotMatchId`, `match_game_player_stats` rows (K/D/A, CS, gold, damage,
  vision per PUUID, `userId` when linked) → `recordGameWinner` (shared with
  the captains' buttons, `src/lib/match-day-results.ts`: next side pick or
  auto-confirm). If the result was already decided by hand it keeps the
  stats and skips the result.
- **Flags** (`match.riot_flag` in the events inbox): champions a side
  played but didn't draft (`draftMismatches`; ids compared case-insensitively
  — Match-v5 says "FiddleSticks"), and players in neither lineup.
- **Display** (decision 20; shaping pure in `src/lib/riot-player-stats.ts`,
  `tests/unit/riot-player-stats.test.ts`; loaders `loadMatchRiotStats` /
  `loadPlayerRiotLines` in `src/lib/season-stats.ts`):
  - Match page **Scoreboard** card (`_components/riot-scoreboard.tsx`) under
    the match-day card, one table per Riot game: champion + player per row,
    K/D/A, CS, gold, damage, vision. A player who hasn't opted in (or isn't
    linked) shows "Stats hidden" — champion still shown; team totals always.
  - Profiles: **League game stats** (`_components/league-riot-stats.tsx`),
    per-season per-game averages + KDA and W–L, confirmed matches only, only
    loaded for players with `statsOptInAt`.

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
pick (5 minutes) → … Countdowns show m:ss from a minute up. Once games have results, a series line ("Best of 3 · A 1–0 B")
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
`/profile`, "Public stats" column on the admin signups page. Gates the Riot
numbers above. **Opting out is locked** while the player is signed up for a
LoL season that isn't `complete` (`statsOptOutLockedBy` in
`src/app/profile/page.tsx`: checkbox disabled, the action refuses with
`?error=stats-locked`). See [SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md) and
decision 20 in the design doc.

## Trying it by hand (staging)

`node scripts/seed-rps-test.mjs` (staging only — refuses the production
`DATABASE_URL`) seeds season `rps-test`: Team A (`rps_cap_a`, plus
`claudius` as duo co-captain) vs Team B (`rps_cap_b`, plus drafted
non-captain `rps_player_b` for claiming picks) in two best-of-2
group matches and a best-of-3 semifinal, and prints their URLs. Both captains use `TEST_CAPTAIN_PASSWORD`
from `.env.development.local` (generated on first run, never printed).
Re-running resets the matches and wipes their RPS / side / game data. Use two
browsers (or a private window) to play both captains. `node
scripts/seed-riot-stats-test.mjs` then fakes a Riot game on the first
group match (rps_cap_a opted in, rps_cap_b not) to see the Scoreboard;
profile averages only count once that match is confirmed.
