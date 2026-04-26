import "server-only";

import { and, eq, inArray, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { teams, teamMembers } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { users } from "@/db/schema/auth";

/**
 * Round-robin schedule using the circle method.
 * Returns pairings as (homeIndex, awayIndex) for a list of N teams.
 * If N is odd a phantom "bye" is added and those pairings are dropped.
 */
export function buildRoundRobin(
  count: number,
): Array<{ round: number; home: number; away: number }> {
  const ids = Array.from({ length: count }, (_, i) => i);
  if (ids.length % 2 !== 0) ids.push(-1); // phantom bye

  const n = ids.length;
  const rounds = n - 1;
  const pairings: Array<{ round: number; home: number; away: number }> = [];

  const list = [...ids];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const h = list[i];
      const a = list[n - 1 - i];
      if (h !== -1 && a !== -1) {
        pairings.push({ round: r + 1, home: h, away: a });
      }
    }
    // Rotate: keep list[0] fixed, rotate list[1..n-1]
    list.splice(1, 0, list.pop()!);
  }

  return pairings;
}

export async function generateSchedule(seasonId: string): Promise<number> {
  // Guard: only generate once
  const existing = await db.query.matches.findFirst({
    where: eq(matches.seasonId, seasonId),
  });
  if (existing) return 0;

  const seasonTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));

  if (seasonTeams.length < 2) return 0;

  const teamIds = seasonTeams.map((t) => t.id);
  const pairings = buildRoundRobin(teamIds.length);

  const rows = pairings.map((p) => ({
    seasonId,
    round: p.round,
    homeTeamId: teamIds[p.home],
    awayTeamId: teamIds[p.away],
  }));

  await db.insert(matches).values(rows);
  return rows.length;
}

export type StandingRow = {
  teamId: string;
  teamName: string;
  captainDisplayName: string;
  wins: number;
  losses: number;
  gameDiff: number;
  matchesPlayed: number;
};

export async function computeStandings(seasonId: string): Promise<StandingRow[]> {
  const seasonTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      captainUserId: teams.captainUserId,
    })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));

  const captainIds = seasonTeams.map((t) => t.captainUserId);
  const captainNames: Map<string, string> = new Map();
  if (captainIds.length > 0) {
    const captainRows = await db
      .select({ id: users.id, name: users.name, username: users.username })
      .from(users)
      .where(inArray(users.id, captainIds));
    for (const c of captainRows) captainNames.set(c.id, c.name ?? c.username ?? "?");
  }

  const confirmedMatches = await db
    .select()
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.state, "confirmed")));

  const stats = new Map<
    string,
    { wins: number; losses: number; gamesWon: number; gamesLost: number }
  >();
  for (const t of seasonTeams) {
    stats.set(t.id, { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 });
  }

  for (const m of confirmedMatches) {
    if (!m.winnerTeamId) continue;
    const loserId = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;

    const winner = stats.get(m.winnerTeamId);
    const loser = stats.get(loserId);
    if (winner) winner.wins++;
    if (loser) loser.losses++;

    // Game differential
    const hs = m.homeScore ?? 0;
    const as = m.awayScore ?? 0;
    const homeStats = stats.get(m.homeTeamId);
    const awayStats = stats.get(m.awayTeamId);
    if (homeStats) {
      homeStats.gamesWon += hs;
      homeStats.gamesLost += as;
    }
    if (awayStats) {
      awayStats.gamesWon += as;
      awayStats.gamesLost += hs;
    }
  }

  const rows: StandingRow[] = seasonTeams.map((t) => {
    const s = stats.get(t.id) ?? { wins: 0, losses: 0, gamesWon: 0, gamesLost: 0 };
    return {
      teamId: t.id,
      teamName: t.name,
      captainDisplayName: captainNames.get(t.captainUserId) ?? "?",
      wins: s.wins,
      losses: s.losses,
      gameDiff: s.gamesWon - s.gamesLost,
      matchesPlayed: s.wins + s.losses,
    };
  });

  // Sort: wins desc → game diff desc → team name asc
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}

export async function seedPlayoffs(seasonId: string): Promise<number> {
  // Guard: bail if playoff matches already exist
  const existing = await db.query.matches.findFirst({
    where: and(eq(matches.seasonId, seasonId), ne(matches.stage, "group")),
  });
  if (existing) return 0;

  const standings = await computeStandings(seasonId);
  if (standings.length < 4) return 0;

  const top4 = standings.slice(0, 4);
  // Semi 1: #1 vs #4, Semi 2: #2 vs #3 (higher seed is home)
  const rows = [
    {
      seasonId,
      round: 101,
      stage: "semis" as const,
      homeTeamId: top4[0].teamId,
      awayTeamId: top4[3].teamId,
    },
    {
      seasonId,
      round: 102,
      stage: "semis" as const,
      homeTeamId: top4[1].teamId,
      awayTeamId: top4[2].teamId,
    },
  ];

  await db.insert(matches).values(rows);
  return rows.length;
}

export async function getTeamForCaptain(
  seasonId: string,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  // captain is stored as captainUserId on the team
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.seasonId, seasonId), eq(teams.captainUserId, userId)),
  });
  if (team) return { id: team.id, name: team.name };

  // also check if they're a team member (non-captain)
  const member = await db
    .select({ teamId: teamMembers.teamId, teamName: teams.name })
    .from(teamMembers)
    .innerJoin(teams, and(eq(teamMembers.teamId, teams.id), eq(teams.seasonId, seasonId)))
    .where(eq(teamMembers.userId, userId))
    .limit(1);

  if (member[0]) return { id: member[0].teamId, name: member[0].teamName };
  return null;
}
