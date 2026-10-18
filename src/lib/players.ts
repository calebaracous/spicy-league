import "server-only";

import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { matches, matchSubstitutions } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { riotStatSnapshots } from "@/db/schema/stats";
import { tenManCaptains, tenManPicks, tenMans } from "@/db/schema/ten-mans";
import {
  tallyMatchRecords,
  tallyTenManRecords,
  type MatchTally,
  type RecordTally,
} from "@/lib/player-stats";
import { formatTier, rankScore } from "@/lib/rank";

/** One row of the public player directory (`/users`). Client-serialisable. */
export type DirectoryPlayer = {
  username: string;
  name: string | null;
  /** Best LoL solo rank across linked Riot accounts, e.g. "Gold II". */
  rank: string | null;
  /** Seasons drafted onto a team. */
  seasons: number;
  titles: number;
  /** Drafted seasons as captain (solo or duo). */
  captaincies: number;
  record: MatchTally;
  tenMan: RecordTally;
};

const EMPTY: RecordTally = { wins: 0, losses: 0 };
const EMPTY_MATCHES: MatchTally = { wins: 0, draws: 0, losses: 0 };

/**
 * Every onboarded user (username set), A–Z, with career stats. A fixed
 * number of whole-table queries tallied in memory — no per-user queries.
 * Banned users are listed like anyone else; ban state is admin-only.
 */
export async function getPlayerDirectory(): Promise<DirectoryPlayer[]> {
  const [
    userRows,
    memberships,
    championRows,
    matchRows,
    subRows,
    tenManRows,
    tenManCaptainRows,
    tenManPickRows,
    rankRows,
  ] = await Promise.all([
    db
      .select({ id: users.id, username: users.username, name: users.name })
      .from(users)
      .where(isNotNull(users.username)),
    db
      .select({
        userId: teamMembers.userId,
        teamId: teamMembers.teamId,
        seasonId: teams.seasonId,
        pickNumber: teamMembers.pickNumber,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id)),
    db
      .select({ teamId: seasons.championTeamId })
      .from(seasons)
      .where(isNotNull(seasons.championTeamId)),
    db
      .select({
        id: matches.id,
        homeTeamId: matches.homeTeamId,
        awayTeamId: matches.awayTeamId,
        winnerTeamId: matches.winnerTeamId,
        homeScore: matches.homeScore,
        awayScore: matches.awayScore,
      })
      .from(matches)
      .where(eq(matches.state, "confirmed")),
    db
      .select({
        matchId: matchSubstitutions.matchId,
        teamId: matchSubstitutions.teamId,
        subUserId: matchSubstitutions.subUserId,
        replacedUserId: matchSubstitutions.replacedUserId,
      })
      .from(matchSubstitutions)
      .where(eq(matchSubstitutions.status, "approved")),
    db
      .select({ id: tenMans.id, winnerCaptainUserId: tenMans.winnerCaptainUserId })
      .from(tenMans)
      .where(eq(tenMans.state, "complete")),
    db
      .select({ tenManId: tenManCaptains.tenManId, userId: tenManCaptains.userId })
      .from(tenManCaptains)
      .innerJoin(tenMans, eq(tenManCaptains.tenManId, tenMans.id))
      .where(eq(tenMans.state, "complete")),
    db
      .select({
        tenManId: tenManPicks.tenManId,
        captainUserId: tenManPicks.captainUserId,
        pickedUserId: tenManPicks.pickedUserId,
      })
      .from(tenManPicks)
      .innerJoin(tenMans, eq(tenManPicks.tenManId, tenMans.id))
      .where(eq(tenMans.state, "complete")),
    db
      .select({
        userId: riotStatSnapshots.userId,
        tier: riotStatSnapshots.tier,
        division: riotStatSnapshots.rankDivision,
        lp: riotStatSnapshots.lp,
      })
      .from(riotStatSnapshots)
      .where(and(eq(riotStatSnapshots.queue, "solo"), isNotNull(riotStatSnapshots.tier))),
  ]);

  const championTeams = new Set(championRows.map((r) => r.teamId));
  const seasonsByUser = new Map<string, Set<string>>();
  const titlesByUser = new Map<string, number>();
  const captainCount = new Map<string, number>();
  for (const m of memberships) {
    const set = seasonsByUser.get(m.userId) ?? new Set<string>();
    set.add(m.seasonId);
    seasonsByUser.set(m.userId, set);
    if (championTeams.has(m.teamId)) {
      titlesByUser.set(m.userId, (titlesByUser.get(m.userId) ?? 0) + 1);
    }
    // Captains (both of a duo) join their team with pickNumber null.
    if (m.pickNumber === null) {
      captainCount.set(m.userId, (captainCount.get(m.userId) ?? 0) + 1);
    }
  }

  // Best solo rank per user across all their linked Riot accounts.
  const bestRank = new Map<string, (typeof rankRows)[number]>();
  for (const r of rankRows) {
    const cur = bestRank.get(r.userId);
    if (!cur || rankScore(r.tier, r.division, r.lp) < rankScore(cur.tier, cur.division, cur.lp)) {
      bestRank.set(r.userId, r);
    }
  }

  const records = tallyMatchRecords(matchRows, memberships, subRows);
  const tenManRecords = tallyTenManRecords(tenManRows, tenManCaptainRows, tenManPickRows);

  return userRows
    .flatMap((u) => {
      if (!u.username) return [];
      const rank = bestRank.get(u.id);
      return [
        {
          username: u.username,
          name: u.name && u.name !== u.username ? u.name : null,
          rank: rank ? formatTier(rank.tier, rank.division) : null,
          seasons: seasonsByUser.get(u.id)?.size ?? 0,
          titles: titlesByUser.get(u.id) ?? 0,
          captaincies: captainCount.get(u.id) ?? 0,
          record: records.get(u.id) ?? EMPTY_MATCHES,
          tenMan: tenManRecords.get(u.id) ?? EMPTY,
        },
      ];
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}
