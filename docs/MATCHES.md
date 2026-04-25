# Matches, standings, playoffs

Everything about group stage → playoffs → champion. Scheduling logic lives
in `src/lib/schedule.ts`; match-lifecycle server actions in
`src/app/seasons/[slug]/matches/actions.ts` and
`src/app/admin/seasons/[slug]/matches/actions.ts`.

## Match shape

One `matches` table covers group, semis, final. Key fields:

- `stage`: `group | semis | final`
- `state`: `scheduled | reported | confirmed | disputed`
- `round`: int — **magic-numbered** to distinguish stages:
  - Group stage: `1..(teams-1)` (from circle method)
  - Semis: `101`, `102`
  - Final: `201`
- `winnerTeamId`, `homeScore`, `awayScore` — populated by `reportMatch`

## Group stage scheduling

`generateSchedule(seasonId)` in `src/lib/schedule.ts`:

1. Bail if any match already exists for this season (idempotent guard).
2. Fetch teams, build round-robin pairings via **circle method**.
3. If team count is odd, inject a phantom "bye" and drop those pairings.
4. Bulk-insert a `matches` row per pairing.

The circle method (`buildRoundRobin`): pin index 0, rotate indices 1..n-1.
With 4 teams: 3 rounds, 2 matches per round, 6 total (each pair plays
once).

Admin triggers via `generateMatchSchedule(slug)` in
`src/app/admin/seasons/[slug]/matches/actions.ts` → `/admin/seasons/[slug]/matches`
page. Must be run once, after teams are created (i.e. after the draft
finalizes).

## Match lifecycle

```
scheduled → reported → confirmed
              ↓
          disputed → scheduled (admin reset)
```

All transitions are server actions in
`src/app/seasons/[slug]/matches/actions.ts`:

### `reportMatch(slug, matchId, formData)`
- `requireOnboarded()`.
- Match must exist, not be `confirmed`.
- If not admin: caller must be captain of the home or away team
  (`getTeamForCaptain` in `src/lib/schedule.ts`).
- `winnerTeamId` must match home or away ID.
- Scores parsed as ints (defaulted to null if 0/missing).
- Sets `state = 'reported'`, stamps `reportedBy` + `reportedAt`.

### `confirmMatch(slug, matchId)` — admin only
- Sets `state = 'confirmed'`, stamps `confirmedAt`.
- **Branches on stage**:
  - If the match is a **semi**: check both semis are now confirmed with
    winners. If so, create the final as `round=201, stage='final',
    home=semi1.winner, away=semi2.winner`. Idempotent (bails if final
    already exists).
  - If the match is the **final**: set the enclosing `seasons.state` to
    `complete`. The season is now over.

### `disputeMatch(slug, matchId)` — admin only
Resets `winnerTeamId`, `homeScore`, `awayScore` to null and sets
`state = 'disputed'`. Does not delete; waits for admin arbitration.

### `resetMatch(slug, matchId)` — admin only
Full reset: wipes all reporting fields and returns the match to
`scheduled`. Escape hatch.

## Standings + tiebreakers

`computeStandings(seasonId)` in `src/lib/schedule.ts` returns
`StandingRow[]`, sorted.

A row contributes only from **confirmed** matches. `reported` doesn't
count until confirmed.

Tiebreaker order:
1. Wins, descending
2. Game differential (sum of gamesWon − gamesLost), descending
3. Team name, ascending (stable fallback)

**Head-to-head is NOT implemented**, despite PLANNING.md specifying it.
Currently game diff is used as the second tiebreaker. See `rows.sort(...)`
near the bottom of `computeStandings` to change this.

## Playoff seeding

`seedPlayoffs(seasonId)` in `src/lib/schedule.ts`:

1. Bail if any non-group match already exists (idempotent).
2. Compute standings. Need ≥ 4 teams.
3. Take top 4. Create two semis:
   - `round=101`: #1 vs #4 (home = #1)
   - `round=102`: #2 vs #3 (home = #2)
4. No final created yet — that happens inside `confirmMatch` when both
   semis are confirmed.

Admin action: `seedPlayoffsAction(slug)` in
`src/app/admin/seasons/[slug]/matches/actions.ts`. Does **not** change
`seasons.state` — admin still needs to separately transition
`group_stage → playoffs` via the edit page. (The state transition is
independent of the seeding action.)

## Champion detection

`src/app/seasons/[slug]/page.tsx` reads the champion when
`season.state === 'complete'`:

```ts
const finalMatch = await db.query.matches.findFirst({
  where: and(matches.seasonId, stage='final', state='confirmed')
});
const champ = await db.query.teams.findFirst({ where: teams.id=finalMatch.winnerTeamId });
```

`seasons.championTeamId` **is not populated** — derivation is always via
the final match. This was a scope decision: avoid two sources of truth.

## Round ordering

Group matches are ordered by `round` (1..N-1). Playoffs hijack the `round`
column with 101/102/201. Any UI that sorts by round will naturally put
playoffs after group stage, and final after semis. When filtering
"group only" use `matches.stage = 'group'` or `round < 100`.

## Where to look when…

- …schedule is too short / missing matches → team count. With N teams
  round-robin produces `N × (N-1) / 2` matches over `N - 1` rounds.
- …a confirm didn't auto-create the final → check `allSemis.length === 2
  && every confirmed && winnerTeamId`. One semi unconfirmed → final
  doesn't exist yet.
- …standings look stale → only `state='confirmed'` matches count.
- …a season sits in `playoffs` forever → no one confirmed the final.
  Grep the matches table for `stage='final' AND state != 'confirmed'`.
- …you want to re-seed playoffs → delete the semis + final rows, reset
  `seasons.state` to `group_stage`, call `seedPlayoffsAction` again. No
  UI escape hatch.
