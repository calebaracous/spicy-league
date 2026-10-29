# Match day: RPS side select, per-game results, our own draft room

Design + build plan. Phases 1–6 are built (on `staging`; phase 6 against the Riot stub); see
[../MATCH-DAY.md](../MATCH-DAY.md) for what shipped. When a phase ships, its facts move to
`docs/MATCH-DAY.md` (and MATCHES / DATA-MODEL / FILE-MAP); this file stays as
the spec it was built from, like `docs/design/SUBSTITUTIONS.md`.

**LoL seasons only** (`seasons.game = 'lol'`). CS2 match pages are unchanged.

## The flow

```
captains ready up ─▶ RPS (rounds until someone wins) ─▶ winner picks side (60s)
      │
      ▼
game N draft room: both captains ready ─▶ 3s countdown ─▶ 20-step pick/ban,
      │                                     60s per ban, 2 min per pick (fearless: earlier picks greyed)
      ▼
game N played in the LoL client (tournament code) ─▶ Riot callback records the winner
      │                                              (manual report as fallback)
      ├─ series not over ─▶ loser picks side for game N+1 (60s) ─▶ draft room N+1
      └─ series over ─▶ match is reported **and confirmed** automatically
```

Games per match: group = `seasons.groupBestOf` (Bo2 always plays both);
tiebreaker = 1; semis = new `seasons.playoffBestOf` (default 3); final = new
`seasons.finalBestOf` (default 5). Bo3/Bo5 end early once a team has a
majority. `bestOfFor(season, stage)` + `seriesScore(bestOf, games, teams)` in
`src/lib/series.ts`.

## Decisions (agreed 2026-10-28)

| # | Question | Decision |
|---|---|---|
| 1 | Two captains of one team ready up for RPS | First to ready claims the team's seat; the other watches ("{name} is playing for your team"). Unready before both teams are in frees the seat. |
| 2 | RPS throw window | 10s. Throw locks on click. Reveal when both are in or at the deadline. |
| 3 | No throw by the deadline | The round is **replayed**, and the reveal roasts whoever didn't throw as a griefer (random line from a small list, e.g. "{name} griefed RPS. Unbelievable."). If neither threw, both get roasted. |
| 4 | Ties | Show the reveal ~3s, then a new round. Single winning round, no Bo3. |
| 5 | Side picker timer | **60s**, then a random side, marked "auto". |
| 6 | Draft step timeout | Hovered champion locks. No hover: a **ban is skipped** (pro rule), a **pick pauses the draft** until that side or an admin locks it (changed 2026-10-29; was a random pick). Steps: **60s per ban, 2 minutes per pick** (was 30s). |
| 7 | Draft start | Both sides press Ready in the room, then a **3s countdown** for everyone, then step 1's clock. No clock while someone is missing. |
| 8 | Who acts in the draft | Either captain of the side's team (duo-aware, like the season draft). Admins can act for either side ("Admin — picking for X" pill, as in the 10-man). Admins cannot throw RPS. |
| 9 | Fearless | Hard fearless: any champion **picked** by either team earlier in the match is unavailable to both, including the last game of a Bo5. Bans reset each game. Off when `fearlessApplies(season, stage)` is false. |
| 10 | Who sees the draft room | Public read-only (spectators welcome); only captains/admins act. Link posted to the match's Discord thread. |
| 11 | Disabled champions | Per-season admin list — `seasons.disabledChampions text[]` of Data Dragon keys. Expected to be rarely used; keep the UI minimal. |
| 12 | Series length | Semis Bo3 (`playoffBestOf`), **final Bo5** (`finalBestOf`). |
| 13 | drafter.lol | Not integrated, no fallback link. |
| 14 | Manual game result (fallback when the callback doesn't arrive, remakes) | Any captain of either team, or an admin. The other team can flag it → admin. Correcting a winner after the next game's draft has started is admin-only. |
| 15 | Lobby champion lock-in | Tournament codes use **blind pick**; players lock what was drafted. After the game, compare Match-v5 champions with the draft and flag mismatches to admins (events inbox). |
| 16 | Lobby restriction | No `allowedParticipants`. Unknown PUUIDs in the result are flagged to admins. |
| 17 | Who sees the tournament code | Lineup players of that match (subs included) + admins on the match page; posted in each team's private Discord channel, not the public match thread. |
| 18 | Spectators in the lobby | `spectatorType: ALL`. |
| 19 | Series result | When the last game's result lands, the match is **reported and confirmed** automatically (through `confirmMatch`'s effects: final creation, champion). New admin **Edit result** tool: change the series score and individual game winners at any time, re-running the confirm effects, logged as an event. |
| 20 | Riot-data privacy | Our own data (drafts, winners, sides) and game/team-level Riot numbers are public. **Per-player Riot stats only for opted-in players.** Opt-in is **required to sign up for a LoL season** from now on (`users.statsOptInAt`); a `/profile` toggle lets anyone opt in (existing players) or out (stats hidden, signups unaffected). Admins see everything. |
| 21 | Tournament API timing | Phase 6, built against tournament-stub-v5 first; `match_games` gets `tournamentCode` / `riotMatchId` columns in phase 1 so nothing is reworked. |

## Data model

Migration per phase (see Phases). All tables cascade from `matches`.

**`match_games`** — one row per game, created when its side is decided.
- `id`, `matchId`, `gameNumber` (1..n), unique `(matchId, gameNumber)`.
- `sideChooserTeamId`, `sideChosenVia` enum `rps | loser | auto | admin`.
- `blueTeamId`, `redTeamId` (null until chosen), `sideDeadline`.
- `winnerTeamId`, `resultReportedBy`, `resultReportedAt`, `resultFlaggedAt`
  (phase 2).
- `tournamentCode`, `riotMatchId` (phase 1 columns, filled in phase 6).
- Draft clock state (phase 3): `draftState` enum `waiting | countdown |
  drafting | complete`, `blueReadyAt`, `redReadyAt`, `stepDeadline`,
  `blueHover`, `redHover` (champion keys), `draftStartedAt`,
  `draftCompletedAt`.

**`match_rps`** — one row per match (game 1 only).
- `matchId` unique, `state` enum `waiting | throwing | revealed | done`.
- `homeUserId` / `awayUserId` (seat holders), `homeReadyAt` / `awayReadyAt`.
- `round`, `throwDeadline`, `revealUntil`, `homeThrow` / `awayThrow`
  (enum `rock | paper | scissors`).
- `history jsonb` — `[{round, home, away, outcome}]`, outcome `home | away |
  tie | void` (void = someone didn't throw → replay + roast). Three void
  rounds in a row where **neither** threw → back to `waiting`, ready cleared.
- `winnerTeamId`.

**`users.statsOptInAt`** (phase 1) — when the player agreed to public
per-player Riot stats; null = not opted in.

**`match_draft_actions`** — append-only, one row per step taken.
- `gameId`, `step` (1..20), unique `(gameId, step)`.
- `side` `blue | red`, `kind` `ban | pick`.
- `championKey` (null = skipped ban); partial unique `(gameId, championKey)
  WHERE championKey IS NOT NULL` — hand-written in SQL like
  `ten_mans_active_uniq` (Drizzle can't express it).
- `actedBy` (null = auto), `auto` bool, `createdAt`.
- `assignedUserId` (picks only, phase 5) — which player played it.

Current step = `count(actions) + 1`, never stored (same as `onTheClock`).

**`seasons`**: `playoffBestOf int not null default 3`,
`disabledChampions text[] not null default '{}'`.

## Pure logic (unit-tested, no DB)

- `src/lib/rps.ts` — `rpsOutcome(a, b)`, `nextRpsState(row, now)`
  (deadline → auto throws → reveal → tie restarts / winner → side pick).
- `src/lib/draft-room.ts`:
  - `DRAFT_SEQUENCE` — the 20 steps:
    ```
    bans 1:  B R B R B R
    picks 1: B R R B B R
    bans 2:  R B R B
    picks 2: R B B R
    ```
  - `stepAt(n)`, `availableChampions(catalog, actions, priorGamePicks,
    disabled, fearless)`, `resolveTimeout(step, hover, available, rng)`.
- `src/lib/match-day-rules.ts` — `seriesOver`, `nextSideChooser(games)`
  (loser of the previous game), who may act (`canActForSide`).
- Tests: `tests/unit/rps.test.ts`, `draft-room.test.ts`,
  `match-day-rules.test.ts`.

## Champion catalogue

`src/lib/champions.ts` — `getChampionCatalog()`: latest version from
`ddragon …/api/versions.json`, then `…/cdn/{v}/data/en_US/champion.json` →
`[{ key: "MonkeyKing", name: "Wukong", numericId: 62 }]` sorted by name.
`fetch` with `revalidate: 86400`, so new champions appear within a day. Fold
`getChampionName` in `riot-api.ts` onto it. Icons:
`https://ddragon.leagueoflegends.com/cdn/{v}/img/champion/{key}.png` via
`next/image` with `unoptimized` + a `remotePatterns` entry (skip Vercel image
optimisation — ~170 icons × patches). Riot's "not endorsed" line is already
on `/terms`; add it to the draft room footer too.

## Server actions

`src/app/seasons/[slug]/matches/match-day-actions.ts`. Like the 10-man:
return `{ error }` via a `run()` wrapper + `MatchDayError`; every mutation is
`db.transaction()` + `.for("update")` on the `matches` row first; client calls
go through a `useMatchDayAction()` hook. Actions that act on a step take the
expected step/round so a late click is rejected, not credited to the next one.

| Action | Who |
|---|---|
| `readyRps` / `unreadyRps` | captain of home/away |
| `throwRps(round, choice)` | seat holder |
| `pickSide(gameNumber, side)` | captain of the side chooser (RPS winner / previous loser) |
| `readyDraft(gameId)` | captain of that side, or admin |
| `hoverChampion(gameId, step, key)` | side on the clock (cheap, no lock needed beyond the row) |
| `lockChampion(gameId, step, key)` | side on the clock, or admin |
| `reportGameWinner(gameId, teamId)` / `flagGameResult` | captain of either team, or admin |
| `adminSetSide`, `adminUndoDraftStep`, `adminResetGame`, `adminResetMatchDay` | admin |

Every mutation `revalidatePath`s the match page + room, logs an event
(`logEvent`, see EVENTS.md) for the admin-relevant ones, and posts to the
Discord match thread in `after()` where noted below.

## Deadlines without a cron

Deadlines are timestamps. `resolveExpired(matchId, now)` (in
`src/lib/match-day.ts`) applies whatever has lapsed — auto throws, auto side,
draft timeouts, possibly several steps in a row — inside one transaction with
`.for("update", { skipLocked: true })` so concurrent pollers don't pile up.
It runs at the top of the snapshot loader, so the SSE poll is the clock. The
snapshot carries `serverNow`; clients compute a clock offset and count down
from the deadlines, so their timers agree with the server's.

## Realtime

One stream for the whole match day:
`src/app/api/matches/[matchId]/stream/route.ts`, the ten-man pattern
(full-snapshot hash, `update` / `: ping`, `maxDuration = 300`) at **1s**
instead of 2s (hover and countdowns). It reads the viewer's session so it can
include `myThrow`; **opponents' throws are never sent before the reveal**
(snapshot carries `homeThrown: boolean`). The match page only opens the
stream while something is live (RPS / side pick / draft / waiting on a
result); a finished match renders statically.

## UI

- **Match page** (`/seasons/[slug]/matches/[matchId]`): a "Match day" card
  above Lineups. States: ready-up → RPS (three big buttons + countdown ring)
  → reveal (both throws, winner, tie banner) → side pick (Blue / Red + 30s) →
  per-game rows: "Game 1 · TEAM A blue vs TEAM B red · Open draft room ·
  Report winner". Fearless graveyard (all picked champs so far) under it.
- **Draft room**: `/seasons/[slug]/matches/[matchId]/games/[n]` — its own page
  for screen space. Blue column (5 ban slots + 5 picks) | champion grid with
  search | red column. Step banner ("RED BAN 2 · 0:23"), Lock in button,
  opponent's hover shown faintly. Greyed: taken, fearless, disabled. Phones:
  slots compress to two rows at the top, grid below, sticky Lock in.
  Spectators see the same board read-only.
- After the last step: recap view (both comps), "Report winner" buttons.

## Discord (background, `discord-notify.ts`)

- Side decided: "Game 1 — TEAM A blue, TEAM B red. Draft room: <link>".
- Draft complete: compact recap (bans + picks per side).
- Game result recorded; next side chooser named.

## Stats (phase 5)

From `match_draft_actions` + `match_games.winnerTeamId` (confirmed matches
only, like standings):
- Season champion page: picks, bans, presence %, win rate, blue/red split.
- Side win rate, RPS-winner game-1 win rate.
- Team page: most picked / banned by and against the team (scouting).
- Per-player champions once picks have `assignedUserId` — captains drag
  players onto their 5 picks on the recap view (optional step, admin can fill).

## Phases

Each phase with a migration goes through `staging` first (CLAUDE.md).

1. **RPS + game-1 side + stats opt-in.** `match_rps`, `match_games` (side +
   tournament columns), `users.statsOptInAt` (required on LoL season signup,
   `/profile` toggle), `rps.ts` + tests, actions, stream, match-day card.
   Migration `0016_match_day`.
2. **Per-game results + loser picks side.** Result columns, `playoffBestOf`,
   `finalBestOf`, `seriesOver` / `nextSideChooser` + tests, game rows UI,
   automatic report + confirm when the series ends, admin **Edit result**
   tool, Discord notes. Migration `0017_match_games_results`.
3. **Draft room core.** `match_draft_actions`, draft columns,
   `disabledChampions`, `champions.ts`, `draft-room.ts` + tests, room page,
   ready / hover / lock / timeouts, fearless, admin undo/reset. Migration
   `0018_match_draft`.
4. **Draft room polish.** Mobile layout, spectator view, recap, Discord
   posts, admin disabled-champions field, Playwright spec (two captains + a
   spectator, timeout path, fearless game 2) alongside `tests/e2e/draft*.spec.ts`.
5. **Stats.** Champion/side/team pages, player assignment on the recap.
6. **Riot Tournament API** (after approval; build against tournament-stub
   first): a tournament code per `match_games` row, callback route
   `/api/riot/tournament-callback` sets `winnerTeamId` automatically, Match-v5
   pull for per-player stats (opt-in display — Riot policy on custom games).
   Checked 2026-10-28: our `RIOT_PERSONAL_API_KEY` (same key in both env
   files) is a **personal** key (app limit 20/1s, 100/2min) — `tournament-v5`
   returns 403, `tournament-stub-v5` works. A tournament-enabled key needs a
   new application at developer.riotgames.com/app-type.

Docs per phase: `docs/MATCH-DAY.md` (new, source of truth), MATCHES.md
(link + games-per-match), DATA-MODEL.md, FILE-MAP.md, DISCORD.md, ENV.md
(phase 6), ARCHITECTURE.md routing map.

## Risks / watch-outs

- **Clock drift / double-acting**: server deadlines + expected-step params;
  `skipLocked` resolution. Covered by unit tests on `resolveTimeout` and the
  e2e timeout path.
- **DB load**: 1s polling × viewers. Fine for a dozen viewers per match; the
  stream only runs while something is live. Revisit if spectators pile in.
- **Admin `resetMatch`** only touches the series result; it does not wipe
  match-day data (separate `adminResetMatchDay`).
- **Champion keys vs names**: store keys (`MonkeyKing`), display names.
- **Patch day**: a new champion missing for up to a day is acceptable; admin
  can't add one manually (it'd have no icon).
