# Matches, standings, playoffs

Everything about group stage → playoffs → champion. Scheduling logic lives
in `src/lib/schedule.ts`, the standings ranking in `src/lib/standings.ts`
(pure), result/label helpers in `src/lib/match-format.ts`; match-lifecycle
server actions in
`src/app/seasons/[slug]/matches/actions.ts` and
`src/app/admin/seasons/[slug]/matches/actions.ts`.

## Match shape

One `matches` table covers group, tiebreaker, semis, final. Key fields:

- `stage`: `group | tiebreaker | semis | final`
- `state`: `scheduled | reported | confirmed | disputed`
- `round`: int — **magic-numbered** to distinguish stages:
  - Group stage: `1..(teams-1)` (from circle method)
  - Tiebreakers: `51, 52, …` (one round per batch the admin creates)
  - Semis: `101`, `102`
  - Final: `201`
- `winnerTeamId`, `homeScore`, `awayScore` — populated by `reportMatch`.
  A **draw** (Bo2 group 1–1) is `winnerTeamId = null` with equal non-null
  scores — use `isDraw` / `hasResult` / `resultFor` from
  `src/lib/match-format.ts`, never `winnerTeamId !== null`, to ask "is there
  a result?".

## Group format (`seasons.groupBestOf`)

Per season, set in the admin season form (migration `0007_group_bo2`):

- `1` (default) — each group match reports a winner plus an optional score.
- `2` — every group match is a **best-of-2 series**: both maps are always
  played and it ends 2–0, 1–1 (draw) or 0–2. Season 12 uses this.

Playoffs and tiebreakers always report a winner, whatever this is set to.
Change it before group results come in — it changes how matches are reported
and ranked. Copy that describes the format comes from `formatStructure()`
(home upcoming section, season page header).

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
finalizes). Returns `already-generated` if any match exists or there are
fewer than 2 teams. `scheduledAt` is never set — matches are unscheduled
(captains coordinate). The home page's "next match" orders by
`scheduledAt`, so with all-null values it picks an effectively arbitrary
`scheduled` match.

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
- Bo2 group match (`stage = 'group'` and `groupBestOf = 2`): the form posts
  `result` = `home-2-0 | draw-1-1 | away-0-2` (`BO2_RESULTS`); anything else
  → `invalid-result`. Scores are set from it and the winner follows (null on
  1–1). The bullets below about `winnerTeamId` / scores apply to every other
  match (`readWinnerResult`).
- Match must exist (`not-found`), not be `confirmed` (`already-confirmed`).
- If not admin: caller must be **on** the home or away team — captain or
  any rostered member. `getTeamForCaptain` in `src/lib/schedule.ts` checks
  `teams.captainUserId` first, then `team_members`. Errors: `not-on-team`,
  `not-your-match`.
- `winnerTeamId` must match home or away ID (`invalid-winner`).
- Scores are optional (`parseScore`): blank → `null`, whole numbers 0–10
  accepted, anything else → `invalid-score`. Both or neither
  (`partial-score`); when both are given the winner must have the higher
  score (`score-mismatch`). A 0 is stored as 0 (it used to become `null`, so
  a 2–0 rendered with no score).
- Can re-report a `reported` or `disputed` match — it simply overwrites.
- Sets `state = 'reported'`, stamps `reportedBy` + `reportedAt`.

### `confirmMatch(slug, matchId)` — admin only
- Rejects with `no-winner` if the match has no result (`hasResult`: a
  winner, or a draw). The admin UI only offers Confirm on `reported`
  matches, which always have one.
- Sets `state = 'confirmed'`, stamps `confirmedAt`.
- **Branches on stage**:
  - If the match is a **semi**: check both semis are now confirmed with
    winners. If so, create the final as `round=201, stage='final',
    home=semi1.winner, away=semi2.winner`. Idempotent (bails if final
    already exists).
  - If the match is the **final**: set the enclosing `seasons.state` to
    `complete` and `seasons.championTeamId` to the winner. The season is
    now over.

### `disputeMatch(slug, matchId)` — admin only
Resets `winnerTeamId`, `homeScore`, `awayScore` to null and sets
`state = 'disputed'`. Does not delete; waits for admin arbitration.
On the final, also clears `seasons.championTeamId`.

### `resetMatch(slug, matchId)` — admin only
Full reset: wipes all reporting fields and returns the match to
`scheduled`. Escape hatch.
On the final, also clears `seasons.championTeamId`.

## Standings + tiebreakers

`computeStandings(seasonId)` in `src/lib/schedule.ts` loads teams, captain
names and **confirmed** `group` + `tiebreaker` matches, and hands them to
`rankStandings` in `src/lib/standings.ts` (pure, tested in
`tests/unit/standings.test.ts`). It returns `{ rows, tiebreakersNeeded }`.
`reported` doesn't count until confirmed, and semis/final never count (they
used to, which inflated the finalists' records).

**Points**: series win 2, draw 1, loss 0. In a Bo2 group that is exactly
maps won, which is how the UI explains it (the table shows W / D / L and
"Maps" won–lost). In a Bo1 group it orders the same as wins.

**Tiebreakers**, for teams level on points, in order:
1. Head-to-head points in matches between the tied teams only (a mini-table
   when 3+ are tied).
2. Series wins (more 2–0s).
3. Game difference (only ever differs in Bo1 seasons that report scores; in
   a Bo2 group equal points + equal matches means equal map difference).
4. Tiebreaker games won between the tied teams (`stage = 'tiebreaker'`).

When a rung splits a tie, every smaller group still level restarts at rung 1
(its own head-to-head). Teams level after all four **share a rank** (shown as
`3=`); there is no name-order fallback. A shared rank inside the top
`PLAYOFF_SPOTS` (4) — whether it straddles the cut or only affects seeding —
is listed in `tiebreakersNeeded` and blocks seeding. Shared ranks entirely
below 4th are left alone.

### Tiebreaker games

Once every group match is confirmed, the admin matches page lists the
unresolved groups. **Create tiebreaker games** (`createTiebreakersAction` →
`createTiebreakers` in `schedule.ts`) inserts a Bo1 between every pair in
each group, all in the next tiebreaker round (51, 52, …). They're reported
and confirmed like playoff matches (winner required). If they don't settle it
(e.g. a 3-way rock-paper-scissors), the card offers another round once the
current one is all confirmed (`tiebreaker-pending` otherwise). Tiebreaker
results only ever reorder the teams that were tied; they don't change W/D/L.

## UI (`/seasons/[slug]/matches`)

Standings mark the top `PLAYOFF_SPOTS` (4) in red with a red rule under 4th
place when more than 4 teams exist; a footnote spells out the scoring and
tiebreakers, and a red "Tiebreaker needed" line shows while seeding waits on
one. Tiebreaker games get their own list above the group rounds. Playoffs render as a bracket
(`BracketCard`: two semis → final, winner bold, loser muted; a dashed
placeholder until the final exists). Scheduled matches show their
`scheduledAt` in the viewer's timezone (`LocalTime`).

Admin match actions redirect to `/admin/seasons/[slug]/matches?saved=<code>`
with `confirmed` / `disputed` / `reset` / `seeded` / `generated-N`;
`flashMessage()` on that page maps each to its toast.

## Playoff seeding

`seedPlayoffs(seasonId)` in `src/lib/schedule.ts`:

1. Bail if a semi or final already exists (idempotent; tiebreakers don't count).
2. Compute standings. Need ≥ 4 teams. Return `"needs-tiebreaker"` while
   `tiebreakersNeeded` is non-empty (action error `needs-tiebreaker`).
3. Take top 4. Create two semis:
   - `round=101`: #1 vs #4 (home = #1)
   - `round=102`: #2 vs #3 (home = #2)
4. No final created yet — that happens inside `confirmMatch` when both
   semis are confirmed.

Admin action: `seedPlayoffsAction(slug)` in
`src/app/admin/seasons/[slug]/matches/actions.ts`. Offered (and allowed)
only once every group match is confirmed (`group-unfinished` otherwise).
Seeding from `group_stage` also moves the season to `playoffs`; seeding
after a manual transition to `playoffs` still works.

## Champion detection

`src/app/seasons/[slug]/page.tsx` reads the champion when
`season.state === 'complete'`:

```ts
const finalMatch = await db.query.matches.findFirst({
  where: and(matches.seasonId, stage='final', state='confirmed')
});
const champ = await db.query.teams.findFirst({ where: teams.id=finalMatch.winnerTeamId });
```

`seasons.championTeamId` is written by `confirmMatch` on the final and
cleared by `disputeMatch` / `resetMatch` on the final (via
`clearChampionIfFinal`; season `state` is left as-is). The home page
(`src/lib/homepage.ts`: past-seasons strip, off-season podium) reads it;
the season page above still derives from the final match.

## Round ordering

Group matches are ordered by `round` (1..N-1). Tiebreakers use 51+,
playoffs 101/102/201. Any UI that sorts by round will naturally put
tiebreakers after the group stage, playoffs after those, and final after
semis. When filtering "group only" use `matches.stage = 'group'` (not
`round < 100`, which now includes tiebreakers). `roundLabel(stage, round)`
in `match-format.ts` is the shared "Round 3" / "Tiebreaker" / "Semifinal" /
"Final" label.

## Substitutions

A player not on a team's roster can play one match for it. Design and
rationale: [design/SUBSTITUTIONS.md](design/SUBSTITUTIONS.md).

- **Rules** — `evaluateSubRequest` in `src/lib/substitution-rules.ts`
  (pure, unit-tested in `tests/unit/substitution-rules.test.ts`): match must
  be `scheduled` (lineup locks on report); candidate must be a season signup
  (free agent) or on a team **not** in this match (cross-team); not banned;
  not already subbing in this match; the sitting-out player must be on the
  requesting roster and not already replaced; max `MAX_SUBS_PER_TEAM` (2)
  pending + approved per team.
- **DB side** — `src/lib/substitutions.ts`: `checkSubEligibility` (gathers
  inputs, `excludeSubId` when re-checking on approval), `getMatchLineups`,
  `getSubCandidates`, `getPlayerMatchHistory`, `getPendingSubsForSeason`,
  `getPendingSubsBySeason`.
- **Actions** — `src/app/seasons/[slug]/matches/sub-actions.ts`:
  `requestSub` (team captain — either of a duo, via `getCaptainedTeamId` —
  or admin for either team), `withdrawSub`
  (pending only), `decideSub` (admin: approve → re-checks eligibility,
  reject, revoke an approved sub while the match is still scheduled),
  `pingSubListAction` (captain or admin: @-mentions the Discord Sub list in
  the match thread, once per 30 minutes per match + team). Every sub needs
  admin approval.
- **UI** — match page `_components/lineups.tsx`: rosters with `Sub` badges /
  struck-through "sat out" players, the requests list and the request form.
  Admin matches page: "Sub requests" card with Approve / Reject. `/admin`
  dashboard: "N sub requests" item. Player profiles: match history.
- **Sub list** — players who pick "Sub only" at signup, and late joiners,
  are subs (`season_signups.kind = 'sub'`, see [SEASON-LIFECYCLE.md](SEASON-LIFECYCLE.md)). They're eligible
  like any undrafted signup, listed first in the picker ("sub list"), and
  shown with undrafted players under **Available subs** on the Teams page
  (`getAvailableSubs`). Admins can remove a sub signup at any time.
- Standings are unaffected — results stay team-level. Player career records
  (`tallyMatchRecords` in `src/lib/player-stats.ts`) are W–D–L; draws show
  as `D` in match history.

## Discord

Match threads, result notes in them (reported / confirmed / disputed /
reset), team schedules, sub-decision notes, the captains' "Ping the Sub
list" button and daily reminders all hang off these actions in the
background — see [DISCORD.md](DISCORD.md). A confirmed, disputed or reset
final also moves the Discord Champion role.

## Where to look when…

- …schedule is too short / missing matches → team count. With N teams
  round-robin produces `N × (N-1) / 2` matches over `N - 1` rounds.
- …a confirm didn't auto-create the final → check `allSemis.length === 2
  && every confirmed && winnerTeamId`. One semi unconfirmed → final
  doesn't exist yet.
- …standings look stale → only `state='confirmed'` matches count.
- …"Seed playoffs" is replaced by a tiebreaker list → a tie inside the top 4
  survived head-to-head, series wins and game diff. Create and confirm the
  tiebreaker games.
- …a season sits in `playoffs` forever → no one confirmed the final.
  Grep the matches table for `stage='final' AND state != 'confirmed'`.
- …you want to re-seed playoffs → delete the semis + final rows, reset
  `seasons.state` to `group_stage`, call `seedPlayoffsAction` again. No
  UI escape hatch.
