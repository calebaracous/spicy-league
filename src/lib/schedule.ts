import "server-only";

import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { teams, teamMembers } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { users } from "@/db/schema/auth";
import { PLAYOFF_SPOTS, rankStandings, type RankedRow } from "@/lib/standings";

/** Tiebreaker games use rounds 51+; group rounds are 1..n-1, semis 101+. */
const TIEBREAKER_ROUND_BASE = 50;

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

export type StandingRow = RankedRow & { captainDisplayName: string };
export type Standings = { rows: StandingRow[]; tiebreakersNeeded: string[][] };

/** Ranked group table; rules and tiebreakers in `rankStandings` (src/lib/standings.ts). */
export async function computeStandings(seasonId: string): Promise<Standings> {
  const seasonTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      captainUserId: teams.captainUserId,
    })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));

  // Every captain is a pickNumber-null member, so duo captains both show
  // ("A & B"), primary (teams.captainUserId) first.
  const captainNames: Map<string, string> = new Map();
  if (seasonTeams.length > 0) {
    const captainRows = await db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        name: users.name,
        username: users.username,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(
        and(
          inArray(
            teamMembers.teamId,
            seasonTeams.map((t) => t.id),
          ),
          isNull(teamMembers.pickNumber),
        ),
      );
    for (const t of seasonTeams) {
      const names = captainRows
        .filter((c) => c.teamId === t.id)
        .sort((a, b) => Number(b.userId === t.captainUserId) - Number(a.userId === t.captainUserId))
        .map((c) => c.name ?? c.username ?? "?");
      if (names.length) captainNames.set(t.id, names.join(" & "));
    }
  }

  // Group stage + tiebreaker games only: once playoffs are played, counting
  // semis/final here inflated the finalists' records and could reorder the table.
  const confirmedMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.seasonId, seasonId),
        eq(matches.state, "confirmed"),
        inArray(matches.stage, ["group", "tiebreaker"]),
      ),
    );

  const { rows, tiebreakersNeeded } = rankStandings(seasonTeams, confirmedMatches);
  return {
    rows: rows.map((r) => ({ ...r, captainDisplayName: captainNames.get(r.teamId) ?? "?" })),
    tiebreakersNeeded,
  };
}

/**
 * Seeds the top 4 into semis. Returns the number of matches created: 0 if the
 * bracket already exists or there are fewer than 4 teams. Refuses while a tie
 * touching the top 4 still needs a tiebreaker game.
 */
export async function seedPlayoffs(seasonId: string): Promise<number | "needs-tiebreaker"> {
  // Guard: bail if playoff matches already exist
  const existing = await db.query.matches.findFirst({
    where: and(eq(matches.seasonId, seasonId), inArray(matches.stage, ["semis", "final"])),
  });
  if (existing) return 0;

  const { rows: standings, tiebreakersNeeded } = await computeStandings(seasonId);
  if (standings.length < PLAYOFF_SPOTS) return 0;
  if (tiebreakersNeeded.length > 0) return "needs-tiebreaker";

  const top4 = standings.slice(0, PLAYOFF_SPOTS);
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

/**
 * Creates Bo1 tiebreaker games for every tie that still decides the top 4:
 * one game per pair of tied teams, all in one new round (51, 52, … so they
 * sort between the group stage and the semis). Returns the number created;
 * 0 when nothing needs one. Callers check the group stage is finished and
 * no earlier tiebreaker is still unconfirmed.
 */
export async function createTiebreakers(seasonId: string): Promise<number> {
  const { tiebreakersNeeded } = await computeStandings(seasonId);
  if (tiebreakersNeeded.length === 0) return 0;

  const earlier = await db
    .select({ round: matches.round })
    .from(matches)
    .where(and(eq(matches.seasonId, seasonId), eq(matches.stage, "tiebreaker")));
  const round = Math.max(TIEBREAKER_ROUND_BASE, ...earlier.map((m) => m.round)) + 1;

  const rows = tiebreakersNeeded.flatMap((group) =>
    group.flatMap((home, i) =>
      group.slice(i + 1).map((away) => ({
        seasonId,
        round,
        stage: "tiebreaker" as const,
        homeTeamId: home,
        awayTeamId: away,
      })),
    ),
  );
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

/**
 * The team this user captains in the season, or null. Covers both duo
 * captains: every captain is a team member with pickNumber null (only the
 * primary is teams.captainUserId).
 */
export async function getCaptainedTeamId(seasonId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ teamId: teams.id })
    .from(teams)
    .leftJoin(
      teamMembers,
      and(
        eq(teamMembers.teamId, teams.id),
        eq(teamMembers.userId, userId),
        isNull(teamMembers.pickNumber),
      ),
    )
    .where(
      and(
        eq(teams.seasonId, seasonId),
        or(eq(teams.captainUserId, userId), eq(teamMembers.userId, userId)),
      ),
    )
    .limit(1);
  return row?.teamId ?? null;
}
