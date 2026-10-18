import "server-only";

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { matches, matchSubstitutions, type Match, type MatchStage } from "@/db/schema/matches";
import { seasons, seasonSignups } from "@/db/schema/seasons";
import { riotStatSnapshots } from "@/db/schema/stats";
import { getActiveBan } from "@/lib/bans";
import { bestRankPerUser, formatTier } from "@/lib/rank";
import { resultFor, roundLabel, type MatchResult } from "@/lib/match-format";
import { evaluateSubRequest, type ActiveSub, type SubRuleResult } from "@/lib/substitution-rules";

/**
 * Substitutions: DB side. Rules live in substitution-rules.ts (pure, tested).
 * A match's lineup is derived — team roster minus approved replacedUserIds
 * plus approved subUserIds. Design: docs/design/SUBSTITUTIONS.md.
 */

type RosterRow = {
  teamId: string;
  userId: string;
  username: string | null;
  name: string | null;
  pickNumber: number | null;
};

async function loadRosters(teamIds: string[]): Promise<RosterRow[]> {
  if (teamIds.length === 0) return [];
  return db
    .select({
      teamId: teamMembers.teamId,
      userId: teamMembers.userId,
      username: users.username,
      name: users.name,
      pickNumber: teamMembers.pickNumber,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(inArray(teamMembers.teamId, teamIds));
}

async function activeSubsFor(matchId: string, excludeSubId?: string): Promise<ActiveSub[]> {
  const rows = await db
    .select({
      id: matchSubstitutions.id,
      teamId: matchSubstitutions.teamId,
      subUserId: matchSubstitutions.subUserId,
      replacedUserId: matchSubstitutions.replacedUserId,
      status: matchSubstitutions.status,
    })
    .from(matchSubstitutions)
    .where(
      and(
        eq(matchSubstitutions.matchId, matchId),
        inArray(matchSubstitutions.status, ["pending", "approved"]),
      ),
    );
  // Approving a pending request re-checks it without counting itself.
  return rows.filter((r) => r.id !== excludeSubId) as ActiveSub[];
}

/** Gather everything the pure rules need and evaluate a sub request. */
export async function checkSubEligibility(args: {
  match: Match;
  requestingTeamId: string;
  candidateId: string;
  replacedUserId: string | null;
  excludeSubId?: string;
}): Promise<SubRuleResult> {
  const { match } = args;
  const [rosters, activeSubs, signup, candidateTeam, ban] = await Promise.all([
    loadRosters([match.homeTeamId, match.awayTeamId]),
    activeSubsFor(match.id, args.excludeSubId),
    db.query.seasonSignups.findFirst({
      where: and(
        eq(seasonSignups.seasonId, match.seasonId),
        eq(seasonSignups.userId, args.candidateId),
      ),
      columns: { id: true },
    }),
    db
      .select({ teamId: teams.id })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(and(eq(teams.seasonId, match.seasonId), eq(teamMembers.userId, args.candidateId)))
      .limit(1),
    getActiveBan(args.candidateId),
  ]);

  return evaluateSubRequest({
    matchState: match.state,
    requestingTeamId: args.requestingTeamId,
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    homeRoster: new Set(rosters.filter((r) => r.teamId === match.homeTeamId).map((r) => r.userId)),
    awayRoster: new Set(rosters.filter((r) => r.teamId === match.awayTeamId).map((r) => r.userId)),
    candidateId: args.candidateId,
    replacedUserId: args.replacedUserId,
    candidateSignedUp: !!signup,
    candidateTeamId: candidateTeam[0]?.teamId ?? null,
    candidateBanned: !!ban,
    activeSubs,
  });
}

export type LineupPlayer = {
  userId: string;
  username: string | null;
  name: string | null;
  pickNumber: number | null;
  /** Roster player replaced by an approved sub. */
  satOut: boolean;
  /** Approved sub (not on this team's roster). */
  sub: null | { id: string; replacing: string | null; fromTeam: string | null };
};

export type SubRequestView = {
  id: string;
  teamId: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  subName: string;
  replacingName: string | null;
  fromTeam: string | null;
  reason: string | null;
};

/**
 * Lineups for both teams (roster + approved subs, sat-out players flagged)
 * and every sub request on the match, for the match page.
 */
export async function getMatchLineups(match: Match): Promise<{
  home: LineupPlayer[];
  away: LineupPlayer[];
  requests: SubRequestView[];
}> {
  const subRows = await db
    .select({
      id: matchSubstitutions.id,
      teamId: matchSubstitutions.teamId,
      subUserId: matchSubstitutions.subUserId,
      replacedUserId: matchSubstitutions.replacedUserId,
      status: matchSubstitutions.status,
      reason: matchSubstitutions.reason,
      createdAt: matchSubstitutions.createdAt,
    })
    .from(matchSubstitutions)
    .where(eq(matchSubstitutions.matchId, match.id))
    .orderBy(desc(matchSubstitutions.createdAt));

  const userIds = [
    ...new Set(subRows.flatMap((s) => [s.subUserId, s.replacedUserId].filter(Boolean) as string[])),
  ];
  const [rosters, subUsers, subTeams] = await Promise.all([
    loadRosters([match.homeTeamId, match.awayTeamId]),
    userIds.length
      ? db
          .select({ id: users.id, username: users.username, name: users.name })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
    // Which team (if any) each sub is drafted to — for "from Team X".
    userIds.length
      ? db
          .select({ userId: teamMembers.userId, teamName: teams.name })
          .from(teamMembers)
          .innerJoin(teams, eq(teamMembers.teamId, teams.id))
          .where(and(eq(teams.seasonId, match.seasonId), inArray(teamMembers.userId, userIds)))
      : Promise.resolve([]),
  ]);
  const userById = new Map(subUsers.map((u) => [u.id, u]));
  const teamOf = new Map(subTeams.map((t) => [t.userId, t.teamName]));
  const label = (id: string | null) =>
    id ? (userById.get(id)?.name ?? userById.get(id)?.username ?? "?") : null;

  const approved = subRows.filter((s) => s.status === "approved");
  const satOut = new Set(approved.map((s) => s.replacedUserId).filter(Boolean));

  const build = (teamId: string): LineupPlayer[] => {
    const roster = rosters
      .filter((r) => r.teamId === teamId)
      .sort((a, b) => (a.pickNumber ?? 0) - (b.pickNumber ?? 0))
      .map((r) => ({ ...r, satOut: satOut.has(r.userId), sub: null }));
    const subs = approved
      .filter((s) => s.teamId === teamId)
      .map((s) => ({
        userId: s.subUserId,
        username: userById.get(s.subUserId)?.username ?? null,
        name: userById.get(s.subUserId)?.name ?? null,
        pickNumber: null,
        satOut: false,
        sub: {
          id: s.id,
          replacing: label(s.replacedUserId),
          fromTeam: teamOf.get(s.subUserId) ?? null,
        },
      }));
    return [...roster, ...subs];
  };

  return {
    home: build(match.homeTeamId),
    away: build(match.awayTeamId),
    requests: subRows.map((s) => ({
      id: s.id,
      teamId: s.teamId,
      status: s.status,
      subName: label(s.subUserId) ?? "?",
      replacingName: label(s.replacedUserId),
      fromTeam: teamOf.get(s.subUserId) ?? null,
      reason: s.reason,
    })),
  };
}

export type SubCandidate = {
  userId: string;
  label: string;
  teamName: string | null;
  rank: string | null;
  /** "sub" = sub-only or late signup (never drafted); "player" = undrafted or drafted signup. */
  kind: "player" | "sub";
};

/**
 * Season signups who could plausibly sub into this match (not on either
 * team in it). Final eligibility is re-checked by the action.
 */
export async function getSubCandidates(match: Match): Promise<SubCandidate[]> {
  const rows = await db
    .select({
      userId: seasonSignups.userId,
      username: users.username,
      name: users.name,
      kind: seasonSignups.kind,
    })
    .from(seasonSignups)
    .innerJoin(users, eq(seasonSignups.userId, users.id))
    .where(eq(seasonSignups.seasonId, match.seasonId));

  const [rosters, drafted, ranks] = await Promise.all([
    loadRosters([match.homeTeamId, match.awayTeamId]),
    db
      .select({ userId: teamMembers.userId, teamName: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.seasonId, match.seasonId)),
    rows.length
      ? db
          .select({
            userId: riotStatSnapshots.userId,
            tier: riotStatSnapshots.tier,
            rankDivision: riotStatSnapshots.rankDivision,
            lp: riotStatSnapshots.lp,
          })
          .from(riotStatSnapshots)
          .where(
            and(
              eq(riotStatSnapshots.queue, "solo"),
              inArray(
                riotStatSnapshots.userId,
                rows.map((r) => r.userId),
              ),
            ),
          )
      : Promise.resolve([]),
  ]);
  const inMatch = new Set(rosters.map((r) => r.userId));
  const teamOf = new Map(drafted.map((d) => [d.userId, d.teamName]));
  // Best rank across the player's linked accounts.
  const rankOf = new Map(
    [...bestRankPerUser(ranks).values()].map((r) => [r.userId, formatTier(r.tier, r.rankDivision)]),
  );

  return (
    rows
      .filter((r) => !inMatch.has(r.userId))
      .map((r) => ({
        userId: r.userId,
        label: r.name ?? r.username ?? "?",
        teamName: teamOf.get(r.userId) ?? null,
        kind: r.kind,
        rank: rankOf.get(r.userId) ?? null,
      }))
      // Sub-list signups first, then undrafted players, then other teams.
      .sort(
        (a, b) =>
          Number(a.kind !== "sub") - Number(b.kind !== "sub") ||
          Number(!!a.teamName) - Number(!!b.teamName) ||
          a.label.localeCompare(b.label),
      )
  );
}

export type AvailableSub = {
  userId: string;
  username: string | null;
  label: string;
  kind: "player" | "sub";
  rolePrefs: unknown;
  notes: string | null;
  quandary: string | null;
  rank: string | null;
  joinedAt: Date;
};

/**
 * Season signups who aren't on any team: the sub list (kind "sub") plus
 * undrafted regular signups. Shown to captains on the Teams page.
 */
export async function getAvailableSubs(seasonId: string): Promise<AvailableSub[]> {
  const [rows, drafted] = await Promise.all([
    db
      .select({
        userId: seasonSignups.userId,
        username: users.username,
        name: users.name,
        kind: seasonSignups.kind,
        rolePrefs: seasonSignups.rolePrefs,
        notes: seasonSignups.notes,
        quandary: seasonSignups.quandary,
        joinedAt: seasonSignups.createdAt,
        bannedAt: users.bannedAt,
        banExpiresAt: users.banExpiresAt,
      })
      .from(seasonSignups)
      .innerJoin(users, eq(seasonSignups.userId, users.id))
      .where(eq(seasonSignups.seasonId, seasonId)),
    db
      .select({ userId: teamMembers.userId })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.seasonId, seasonId)),
  ]);
  const onTeam = new Set(drafted.map((d) => d.userId));
  const now = new Date();
  const free = rows.filter(
    (r) => !onTeam.has(r.userId) && !(r.bannedAt && (!r.banExpiresAt || r.banExpiresAt > now)),
  );
  if (free.length === 0) return [];

  const ranks = await db
    .select({
      userId: riotStatSnapshots.userId,
      tier: riotStatSnapshots.tier,
      rankDivision: riotStatSnapshots.rankDivision,
      lp: riotStatSnapshots.lp,
    })
    .from(riotStatSnapshots)
    .where(
      and(
        eq(riotStatSnapshots.queue, "solo"),
        inArray(
          riotStatSnapshots.userId,
          free.map((r) => r.userId),
        ),
      ),
    );
  // Best rank across the player's linked accounts.
  const rankOf = new Map(
    [...bestRankPerUser(ranks).values()].map((r) => [r.userId, formatTier(r.tier, r.rankDivision)]),
  );

  return free
    .map((r) => ({
      userId: r.userId,
      username: r.username,
      label: r.name ?? r.username ?? "?",
      kind: r.kind,
      rolePrefs: r.rolePrefs,
      notes: r.notes,
      quandary: r.quandary,
      rank: rankOf.get(r.userId) ?? null,
      joinedAt: r.joinedAt,
    }))
    .sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
}

export type PlayerMatch = {
  matchId: string;
  seasonName: string;
  seasonSlug: string;
  stage: MatchStage;
  round: number;
  teamName: string;
  opponentName: string;
  result: MatchResult;
  teamScore: number | null;
  opponentScore: number | null;
  confirmedAt: Date | null;
  /** How the player took part: on the roster, as a sub, or sat out. */
  role: "played" | "sub" | "sat-out";
};

/**
 * Every confirmed match a player was part of: matches on their own team's
 * roster (flagged "sat-out" if an approved sub replaced them) plus matches
 * they played as an approved sub for another team.
 */
export async function getPlayerMatchHistory(userId: string): Promise<PlayerMatch[]> {
  const [memberships, subbedIn, satOutRows] = await Promise.all([
    db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId)),
    db
      .select({ matchId: matchSubstitutions.matchId, teamId: matchSubstitutions.teamId })
      .from(matchSubstitutions)
      .where(
        and(eq(matchSubstitutions.subUserId, userId), eq(matchSubstitutions.status, "approved")),
      ),
    db
      .select({ matchId: matchSubstitutions.matchId })
      .from(matchSubstitutions)
      .where(
        and(
          eq(matchSubstitutions.replacedUserId, userId),
          eq(matchSubstitutions.status, "approved"),
        ),
      ),
  ]);

  const ownTeams = memberships.map((m) => m.teamId);
  const subMatchIds = subbedIn.map((s) => s.matchId);
  if (ownTeams.length === 0 && subMatchIds.length === 0) return [];

  const conditions = [];
  if (ownTeams.length) {
    conditions.push(inArray(matches.homeTeamId, ownTeams), inArray(matches.awayTeamId, ownTeams));
  }
  if (subMatchIds.length) conditions.push(inArray(matches.id, subMatchIds));

  const rows = await db
    .select({
      id: matches.id,
      stage: matches.stage,
      round: matches.round,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      winnerTeamId: matches.winnerTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      confirmedAt: matches.confirmedAt,
      seasonName: seasons.name,
      seasonSlug: seasons.slug,
    })
    .from(matches)
    .innerJoin(seasons, eq(matches.seasonId, seasons.id))
    .where(and(eq(matches.state, "confirmed"), or(...conditions)))
    .orderBy(desc(matches.confirmedAt));

  const teamIds = [...new Set(rows.flatMap((r) => [r.homeTeamId, r.awayTeamId]))];
  const teamRows = teamIds.length
    ? await db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(inArray(teams.id, teamIds))
    : [];
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  const subTeamFor = new Map(subbedIn.map((s) => [s.matchId, s.teamId]));
  const satOut = new Set(satOutRows.map((s) => s.matchId));
  const own = new Set(ownTeams);

  return rows.map((r) => {
    const subTeam = subTeamFor.get(r.id);
    const myTeam = subTeam ?? (own.has(r.homeTeamId) ? r.homeTeamId : r.awayTeamId);
    const isHome = myTeam === r.homeTeamId;
    return {
      matchId: r.id,
      seasonName: r.seasonName,
      seasonSlug: r.seasonSlug,
      stage: r.stage,
      round: r.round,
      teamName: teamName.get(myTeam) ?? "?",
      opponentName: teamName.get(isHome ? r.awayTeamId : r.homeTeamId) ?? "?",
      // Confirmed matches always have a result; a Bo2 group 1–1 is a draw.
      result: resultFor(r, myTeam) ?? "loss",
      teamScore: isHome ? r.homeScore : r.awayScore,
      opponentScore: isHome ? r.awayScore : r.homeScore,
      confirmedAt: r.confirmedAt,
      role: subTeam ? "sub" : satOut.has(r.id) ? "sat-out" : "played",
    };
  });
}

/** Pending requests for one season, with names, for the admin matches page. */
export async function getPendingSubsForSeason(seasonId: string) {
  const rows = await db
    .select({
      id: matchSubstitutions.id,
      matchId: matchSubstitutions.matchId,
      teamId: matchSubstitutions.teamId,
      subUserId: matchSubstitutions.subUserId,
      replacedUserId: matchSubstitutions.replacedUserId,
      reason: matchSubstitutions.reason,
      stage: matches.stage,
      round: matches.round,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
    })
    .from(matchSubstitutions)
    .innerJoin(matches, eq(matchSubstitutions.matchId, matches.id))
    .where(and(eq(matches.seasonId, seasonId), eq(matchSubstitutions.status, "pending")));
  if (rows.length === 0) return [];

  const userIds = [
    ...new Set(rows.flatMap((r) => [r.subUserId, r.replacedUserId].filter(Boolean) as string[])),
  ];
  const [people, seasonTeams] = await Promise.all([
    db
      .select({ id: users.id, name: users.name, username: users.username })
      .from(users)
      .where(inArray(users.id, userIds)),
    db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.seasonId, seasonId)),
  ]);
  const person = new Map(people.map((p) => [p.id, p.name ?? p.username ?? "?"]));
  const team = new Map(seasonTeams.map((t) => [t.id, t.name]));

  return rows.map((r) => ({
    id: r.id,
    matchId: r.matchId,
    subName: person.get(r.subUserId) ?? "?",
    replacingName: r.replacedUserId ? (person.get(r.replacedUserId) ?? "?") : null,
    teamName: team.get(r.teamId) ?? "?",
    matchLabel: `${team.get(r.homeTeamId) ?? "?"} vs ${team.get(r.awayTeamId) ?? "?"} · ${roundLabel(
      r.stage,
      r.round,
    )}`,
    reason: r.reason,
  }));
}

/** Pending requests across all seasons, for the admin dashboard. */
export async function getPendingSubsBySeason() {
  return db
    .select({
      id: matchSubstitutions.id,
      matchId: matchSubstitutions.matchId,
      seasonName: seasons.name,
      seasonSlug: seasons.slug,
    })
    .from(matchSubstitutions)
    .innerJoin(matches, eq(matchSubstitutions.matchId, matches.id))
    .innerJoin(seasons, eq(matches.seasonId, seasons.id))
    .where(eq(matchSubstitutions.status, "pending"));
}
