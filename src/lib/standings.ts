/**
 * Group-stage ranking. Pure — `computeStandings` in `src/lib/schedule.ts`
 * feeds it a season's teams and confirmed matches.
 *
 * Points: series win 2, draw 1, loss 0. In a Bo2 group (both maps always
 * played) that is exactly maps won. Teams level on points are separated by,
 * in order:
 *   1. head-to-head points in matches between the tied teams only
 *   2. series wins (more 2–0s)
 *   3. game difference (only ever differs in Bo1 seasons that report scores)
 *   4. tiebreaker games won between the tied teams (stage `tiebreaker`)
 * When a rung splits a tie, every smaller group that's still level restarts
 * at rung 1, so a 3-way tie that drops to 2 is decided on those two's own
 * head-to-head. Teams still level after all of that share a rank; if a shared
 * rank touches the top `PLAYOFF_SPOTS` it has to be settled by a tiebreaker
 * game before playoffs can be seeded (`tiebreakersNeeded`).
 */
import { isDraw } from "@/lib/match-format";
import type { MatchStage } from "@/db/schema/matches";

export const PLAYOFF_SPOTS = 4;

export type RankTeam = { id: string; name: string };

/** A confirmed match. Semis / final are ignored. */
export type RankMatch = {
  stage: MatchStage;
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type RankedRow = {
  teamId: string;
  teamName: string;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  gamesWon: number;
  gamesLost: number;
  matchesPlayed: number;
  /** 1-based; teams still level after every tiebreaker share it. */
  rank: number;
  tied: boolean;
};

export type Ranking = {
  rows: RankedRow[];
  /** Groups of team ids level on everything whose shared rank is inside the top 4. */
  tiebreakersNeeded: string[][];
};

type Stats = Omit<RankedRow, "teamId" | "teamName" | "rank" | "tied">;

export function rankStandings(teams: RankTeam[], confirmed: RankMatch[]): Ranking {
  const groupMatches = confirmed.filter((m) => m.stage === "group");
  const tiebreakers = confirmed.filter((m) => m.stage === "tiebreaker" && m.winnerTeamId);

  const stats = new Map<string, Stats>();
  for (const t of teams) {
    stats.set(t.id, {
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      gamesWon: 0,
      gamesLost: 0,
      matchesPlayed: 0,
    });
  }
  for (const m of groupMatches) {
    const draw = isDraw(m);
    if (!m.winnerTeamId && !draw) continue;
    for (const [id, gw, gl] of [
      [m.homeTeamId, m.homeScore ?? 0, m.awayScore ?? 0],
      [m.awayTeamId, m.awayScore ?? 0, m.homeScore ?? 0],
    ] as const) {
      const s = stats.get(id);
      if (!s) continue;
      s.matchesPlayed++;
      s.gamesWon += gw;
      s.gamesLost += gl;
      if (draw) s.draws++;
      else if (m.winnerTeamId === id) s.wins++;
      else s.losses++;
      s.points = s.wins * 2 + s.draws;
    }
  }

  /** Points `id` earned against the other teams in `group`. */
  function headToHead(id: string, group: Set<string>): number {
    let pts = 0;
    for (const m of groupMatches) {
      if (!group.has(m.homeTeamId) || !group.has(m.awayTeamId)) continue;
      if (m.homeTeamId !== id && m.awayTeamId !== id) continue;
      if (m.winnerTeamId === id) pts += 2;
      else if (isDraw(m)) pts += 1;
    }
    return pts;
  }

  function tiebreakerWins(id: string, group: Set<string>): number {
    return tiebreakers.filter(
      (m) => m.winnerTeamId === id && group.has(m.homeTeamId) && group.has(m.awayTeamId),
    ).length;
  }

  const get = (id: string) => stats.get(id)!;
  const rungs: Array<(id: string, group: Set<string>) => number> = [
    (id) => get(id).points,
    headToHead,
    (id) => get(id).wins,
    (id) => get(id).gamesWon - get(id).gamesLost,
    tiebreakerWins,
  ];

  /** Splits `group` into ordered sub-groups; a sub-group of 2+ is unresolved. */
  function order(group: string[], rung: number): string[][] {
    if (group.length === 1 || rung >= rungs.length) return [group];
    const set = new Set(group);
    const score = new Map(group.map((id) => [id, rungs[rung](id, set)]));
    const levels = [...new Set(score.values())].sort((a, b) => b - a);
    if (levels.length === 1) return order(group, rung + 1);
    return levels.flatMap((level) =>
      order(
        group.filter((id) => score.get(id) === level),
        1,
      ),
    );
  }

  const name = new Map(teams.map((t) => [t.id, t.name]));
  const groups = order(
    teams.map((t) => t.id),
    0,
  ).map((g) => g.sort((a, b) => name.get(a)!.localeCompare(name.get(b)!)));

  const rows: RankedRow[] = [];
  const tiebreakersNeeded: string[][] = [];
  for (const group of groups) {
    const rank = rows.length + 1;
    if (group.length > 1 && rank <= PLAYOFF_SPOTS) tiebreakersNeeded.push(group);
    for (const id of group) {
      rows.push({ teamId: id, teamName: name.get(id)!, ...get(id), rank, tied: group.length > 1 });
    }
  }
  return { rows, tiebreakersNeeded };
}
