# Riot stats expansion — what a non-tournament key can show us (2026-11-04)

Probe of the new `RIOT_DEVELOPMENT_API_KEY` (24h dev key) against what the
stats expansion needs once the tournament/production key is approved. Shipped
behaviour stays in [../MATCH-DAY.md](../MATCH-DAY.md) ("Riot Tournament API").

## Verdict

Useful for **data planning and fixtures**, not for the go-live flow itself.
And it adds nothing the existing `RIOT_PERSONAL_API_KEY` can't already do:
same app limits (`20:1`, `100:120`), same endpoints open, same 403s. The dev
key also expires every 24h. The useful results came from probing, not from the
key — any non-tournament key would have given them.

| Endpoint | Dev key | Notes |
|---|---|---|
| account-v1 by Riot ID / by PUUID | 200 | PUUIDs are **per key** (see below) |
| match-v5 ids by PUUID (`type=tourney`) | 200 | other leagues' tournament-code games show up |
| match-v5 ids by PUUID (`queue=0`, custom) | 200, **always empty** | plain custom games are never listed |
| match-v5 match + timeline | 200 | full data for tournament-code games |
| tournament-stub-v5 | 200 | what we already build against |
| tournament-v5 | **403** | needs the approved key |
| match-v5 by-tournament-code | **403** | needs the approved key |

Env note: the app reads `RIOT_DEVELOPER_API_KEY` (`src/lib/env.ts`), not
`RIOT_DEVELOPMENT_API_KEY`, and the personal key wins anyway. So the new key is
only reachable from scripts. That's fine for this use.

## Blocker for go-live: PUUIDs are encrypted per API key

Every stored `account_links.external_id` came from the personal key. Calling
any endpoint with one of those PUUIDs under another key fails with `400
Exception decrypting` (12/12 links tried). The same match fetched with two
keys returns different `participants[].puuid` (checked on `NA1_5528154872`).

So at go-live, `getMatch` (`src/lib/riot-tournament.ts`) fetches Match-v5
with `RIOT_TOURNAMENT_API_KEY`. `applyTournamentCallback`
(`src/lib/riot-results.ts`) then looks those PUUIDs up in `account_links` and
finds **no one**:

- the winner silently falls back to the recorded lobby side (never by lineup);
- every `match_game_player_stats.userId` is null, so the Scoreboard shows
  "Stats hidden" for everyone and profile League game stats stay empty;
- every player gets reported in the "neither lineup" `match.riot_flag`.

Unit tests can't catch this: fixtures use one consistent set of PUUIDs.

**Built 2026-11-04** (all three below; go-live step in
[MATCH-DAY-OPEN-QUESTIONS.md](MATCH-DAY-OPEN-QUESTIONS.md) item 9):
1. **One key for everything.** `riotApiKey()` in `src/lib/riot-api.ts`
   (tournament ?? personal ?? developer) is used by both `riot-api.ts` and
   `riot-tournament.ts`, so links, refreshes and Match-v5 share one PUUID
   space.
2. **Re-resolve script.** `scripts/riot-reresolve-puuids.mjs`: per riot
   link, current Riot ID via the *old* key's by-puuid (so renames don't land
   on whoever took the old name; stored handle if the old key is gone) →
   by-riot-id with the new key → rewrite `external_id` (and the same PUUID in
   `match_game_player_stats`). Dry run by default, idempotent, unresolved
   Riot IDs listed for relinking. Round-tripped on staging (25 links →
   dev key → back to personal key, identical rows).
3. **Riot ID fallback in matching.** Tournament games expose
   `riotIdGameName` + `riotIdTagline` (10/10 players, all 8 games).
   `matchPlayersToUsers` matches by PUUID first, then by Riot ID against
   `external_handle` (case-insensitive); ambiguous ones match nobody. Riot ID
   matches are counted in the `match.riot_flag` event. Checked on a real
   game: with stored PUUIDs from the other key, all 4 league players in it
   were still found by Riot ID.

## No retroactive stats

`queue=0` (custom) returned 0 for all 10 players tried, and our seasons so
far are plain custom lobbies. Past league games can't be pulled at all. Stats
start with the first tournament-code game.

## Real tournament-code game shape (8 games from another league, Mar–Apr 2026)

- `queueId 3130`, `gameType CUSTOM_GAME`, `gameMode CLASSIC`,
  `info.tournamentCode` set, `endOfGameResult GameComplete`.
- `teamPosition` filled for all 10 (TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY). Those
  were draft lobbies. Ours are blind pick (decision 15): check positions on our
  first real game before relying on them.
- `teams[].bans` filled (5/5). Blind pick → expect empty for us. Our bans live
  in `match_draft_actions` anyway.
- `teams[].objectives`: atakhan, baron, champion, dragon, horde (grubs),
  inhibitor, riftHerald, tower (`first` + `kills` each).
- 147 participant fields, 131 `challenges` fields, 12 `missions`, `perks`.
- Timeline: 1-minute frames. Per-player `totalGold`, `xp`, `level`, CS,
  `position`, `damageStats` / `championStats`. Events include `CHAMPION_KILL`
  (with position), `ELITE_MONSTER_KILL`, `BUILDING_KILL`,
  `TURRET_PLATE_DESTROYED`, `WARD_PLACED/KILL`, `ITEM_*`, `PAUSE_*`.
- **`parseMatchResult` (`src/lib/riot-tournament-parse.ts`) handled all 8
  correctly**: winner side, 10 lines, sane K/D/A/CS. First check against real
  data.

### Stats these unlock (no extra calls beyond match + timeline)

From `challenges`: `killParticipation`, `teamDamagePercentage`,
`damageTakenOnTeamPercentage`, `damagePerMinute`, `goldPerMinute`,
`visionScorePerMinute`, `kda`, `soloKills`, `turretPlatesTaken`,
`laneMinionsFirst10Minutes`, `jungleCsBefore10Minutes`,
`laningPhaseGoldExpAdvantage`, `maxCsAdvantageOnLaneOpponent`,
`visionScoreAdvantageLaneOpponent`, `controlWardsPlaced`,
`effectiveHealAndShielding`, `skillshotsHit/Dodged`, `epicMonsterSteals`,
`perfectGame`, `firstTurretKilled`.
From teams: first blood/tower/dragon/baron per side, dragon/grub/herald/
baron/atakhan counts. That gives season objective-control rates per team, and
"first X → win %".
From the timeline: gold/XP diff @10/@15 per lane opponent, team gold graph per
game, kill-location map, objective timeline.

Budget: 2 calls per game (match + timeline). A full league night is a few
dozen calls, far under `100/2min`. Store the raw JSON (`jsonb`) per game so
new stats can be derived later without refetching.

## Not testable before approval

Real callbacks, tournament-v5 code creation, by-tournament-code lookups.
Everything downstream of "we have a Match-v5 JSON" **is** testable now with
fixtures from `type=tourney` history (one is in `tests/fixtures/riot/`). Strip PUUIDs and Riot IDs before
committing any: they are other people's accounts.
