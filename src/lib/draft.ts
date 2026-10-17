import "server-only";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import {
  draftPicks,
  drafts,
  teamMembers,
  teams,
  type Draft,
  type DraftPick,
} from "@/db/schema/drafts";
import { seasonCaptains, seasonSignups, seasons } from "@/db/schema/seasons";
import { riotStatSnapshots } from "@/db/schema/stats";

export const TEAM_SIZE = 5;
/** Picks a solo-captain team makes; a duo-captain team makes one fewer. */
export const PICKS_PER_TEAM = TEAM_SIZE - 1;

/** Picks a team makes in the draft: fill to TEAM_SIZE after its captains. */
export function picksForTeam(captainCount: number): number {
  return Math.max(TEAM_SIZE - captainCount, 0);
}

/**
 * Snake order over teams: forward, reverse, repeat. `picksPerTeam[i]` is how
 * many picks team i (in captainOrder) makes; a team that's full sits out the
 * later rounds, so solo (4 picks) and duo (3 picks) teams can mix. Returns the
 * 0-indexed team for each pick, in pick order.
 */
export function snakeOrder(picksPerTeam: number[]): number[] {
  const rounds = Math.max(0, ...picksPerTeam);
  const order: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const seq = picksPerTeam.map((_, i) => i);
    if (round % 2 === 1) seq.reverse();
    for (const i of seq) if (picksPerTeam[i] > round) order.push(i);
  }
  return order;
}

/**
 * A draft team: one captain, or two "duo" captains who share a captainOrder
 * (season_captains rows with the same order). The first-promoted captain is
 * the primary — teams.captain_user_id and draft_picks.captain_user_id hold
 * their id — but either captain can pick and manage the team.
 */
export type CaptainTeam = {
  captainOrder: number;
  /** Primary captain first. */
  captains: Array<{ userId: string; displayName: string }>;
  primaryUserId: string;
  displayName: string;
  picks: number;
};

/**
 * Group captain rows (sorted by captainOrder, then promotion time) into
 * teams. Pure, so the pick math is unit-testable.
 */
export function groupCaptainTeams(
  rows: Array<{ userId: string; displayName: string; captainOrder: number }>,
): CaptainTeam[] {
  const teamsByOrder = new Map<number, CaptainTeam["captains"]>();
  for (const r of rows) {
    const list = teamsByOrder.get(r.captainOrder) ?? [];
    list.push({ userId: r.userId, displayName: r.displayName });
    teamsByOrder.set(r.captainOrder, list);
  }
  return [...teamsByOrder.entries()]
    .sort(([a], [b]) => a - b)
    .map(([captainOrder, captains]) => ({
      captainOrder,
      captains,
      primaryUserId: captains[0].userId,
      displayName: captains.map((c) => c.displayName).join(" & "),
      picks: picksForTeam(captains.length),
    }));
}

/** Season captains grouped into draft teams (solo or duo). */
export async function loadCaptainTeams(seasonId: string): Promise<CaptainTeam[]> {
  const rows = await db
    .select({
      userId: seasonCaptains.userId,
      displayName: sql<string>`COALESCE(${users.name}, ${users.username}, '?')`,
      captainOrder: seasonCaptains.captainOrder,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, seasonId))
    .orderBy(asc(seasonCaptains.captainOrder), asc(seasonCaptains.createdAt));
  return groupCaptainTeams(rows);
}

/** Total picks in a draft between these teams. */
export function totalPicks(captainTeams: Pick<CaptainTeam, "picks">[]): number {
  return captainTeams.reduce((n, t) => n + t.picks, 0);
}

/** The team on the clock for a 1-indexed pick number, or null past the end. */
export function teamForPick<T extends Pick<CaptainTeam, "picks">>(
  captainTeams: T[],
  pickNumber: number,
): T | null {
  const i = snakeOrder(captainTeams.map((t) => t.picks))[pickNumber - 1];
  return i === undefined ? null : captainTeams[i];
}

export type RiotRank = {
  tier: string | null;
  rankDivision: string | null;
  lp: number | null;
};

export type DraftSnapshot = {
  draft: { id: string; state: Draft["state"]; startedAt: Date | null; completedAt: Date | null };
  season: { id: string; slug: string; name: string; game: "lol" | "cs2" };
  /** One entry per team; `userId` is the primary captain, `userIds` all of them (1 or 2). */
  captains: Array<{
    userId: string;
    userIds: string[];
    displayName: string;
    captainOrder: number;
    picks: number;
  }>;
  pool: Array<{
    userId: string;
    displayName: string;
    signupId: string;
    rolePrefs: unknown;
    riotRank: RiotRank | null;
  }>;
  picks: Array<{
    pickNumber: number;
    captainUserId: string;
    captainDisplayName: string;
    pickedUserId: string;
    pickedDisplayName: string;
    pickedAt: Date;
  }>;
  totalPicks: number;
  onTheClock: {
    pickNumber: number;
    captainUserId: string;
    /** Every captain of the team on the clock — any of them may pick. */
    captainUserIds: string[];
    captainDisplayName: string;
    captainOrder: number;
  } | null;
};

export async function getDraftSnapshot(seasonSlug: string): Promise<DraftSnapshot | null> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, seasonSlug) });
  if (!season) return null;

  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (!draft) return null;

  const [captainTeams, signupsRows, picksRows] = await Promise.all([
    loadCaptainTeams(season.id),
    db
      .select({
        signupId: seasonSignups.id,
        userId: seasonSignups.userId,
        displayName: sql<string>`COALESCE(${users.name}, ${users.username}, '?')`,
        rolePrefs: seasonSignups.rolePrefs,
      })
      .from(seasonSignups)
      .innerJoin(users, eq(seasonSignups.userId, users.id))
      .where(and(eq(seasonSignups.seasonId, season.id), eq(seasonSignups.kind, "player")))
      .orderBy(asc(sql`COALESCE(${users.name}, ${users.username})`)),
    db
      .select({
        pickNumber: draftPicks.pickNumber,
        captainUserId: draftPicks.captainUserId,
        pickedUserId: draftPicks.pickedUserId,
        pickedAt: draftPicks.pickedAt,
      })
      .from(draftPicks)
      .where(eq(draftPicks.draftId, draft.id))
      .orderBy(asc(draftPicks.pickNumber)),
  ]);

  const riotRankMap = new Map<string, RiotRank>();
  if (season.game === "lol" && signupsRows.length > 0) {
    const userIds = signupsRows.map((s) => s.userId);
    const statsRows = await db
      .select({
        userId: riotStatSnapshots.userId,
        tier: riotStatSnapshots.tier,
        rankDivision: riotStatSnapshots.rankDivision,
        lp: riotStatSnapshots.lp,
      })
      .from(riotStatSnapshots)
      .where(and(eq(riotStatSnapshots.queue, "solo"), inArray(riotStatSnapshots.userId, userIds)));
    for (const s of statsRows) riotRankMap.set(s.userId, s);
  }

  const captainIds = new Set(captainTeams.flatMap((t) => t.captains.map((c) => c.userId)));
  const pickedIds = new Set(picksRows.map((p) => p.pickedUserId));
  const captainName = new Map(captainTeams.map((t) => [t.primaryUserId, t.displayName]));
  const signupName = new Map(signupsRows.map((s) => [s.userId, s.displayName ?? "?"]));

  const pool = signupsRows
    .filter((s) => !captainIds.has(s.userId) && !pickedIds.has(s.userId))
    .map((s) => ({
      userId: s.userId,
      displayName: s.displayName ?? "?",
      signupId: s.signupId,
      rolePrefs: s.rolePrefs,
      riotRank: riotRankMap.get(s.userId) ?? null,
    }));

  const total = totalPicks(captainTeams);
  const picks = picksRows.map((p) => ({
    pickNumber: p.pickNumber,
    captainUserId: p.captainUserId,
    captainDisplayName: captainName.get(p.captainUserId) ?? "?",
    pickedUserId: p.pickedUserId,
    pickedDisplayName: signupName.get(p.pickedUserId) ?? "?",
    pickedAt: p.pickedAt,
  }));

  let onTheClock: DraftSnapshot["onTheClock"] = null;
  if (draft.state === "in_progress" && picks.length < total) {
    const nextPickNumber = picks.length + 1;
    const team = teamForPick(captainTeams, nextPickNumber);
    if (team) {
      onTheClock = {
        pickNumber: nextPickNumber,
        captainUserId: team.primaryUserId,
        captainUserIds: team.captains.map((c) => c.userId),
        captainDisplayName: team.displayName,
        captainOrder: team.captainOrder,
      };
    }
  }

  return {
    draft: {
      id: draft.id,
      state: draft.state,
      startedAt: draft.startedAt,
      completedAt: draft.completedAt,
    },
    season: { id: season.id, slug: season.slug, name: season.name, game: season.game },
    captains: captainTeams.map((t) => ({
      userId: t.primaryUserId,
      userIds: t.captains.map((c) => c.userId),
      displayName: t.displayName,
      captainOrder: t.captainOrder,
      picks: t.picks,
    })),
    pool,
    picks,
    totalPicks: total,
    onTheClock,
  };
}

/**
 * Finalize a completed draft: create teams + team_members, mark draft complete,
 * advance season to group_stage. Idempotent — bails if teams already exist.
 */
export async function finalizeDraft(draftId: string): Promise<void> {
  const draft = await db.query.drafts.findFirst({ where: eq(drafts.id, draftId) });
  if (!draft) return;

  const captainTeams = await loadCaptainTeams(draft.seasonId);

  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draft.id))
    .orderBy(asc(draftPicks.pickNumber));

  if (picks.length !== totalPicks(captainTeams)) return;

  const existing = await db.query.teams.findFirst({ where: eq(teams.seasonId, draft.seasonId) });
  if (existing) return;

  for (const cap of captainTeams) {
    const [team] = await db
      .insert(teams)
      .values({
        seasonId: draft.seasonId,
        name: `Team ${cap.displayName}`,
        captainUserId: cap.primaryUserId,
      })
      .returning();
    // Every captain (both of a duo) joins as pickNumber null — that's what
    // marks a team captain from here on (see isTeamCaptain).
    for (const c of cap.captains) {
      await db.insert(teamMembers).values({ teamId: team.id, userId: c.userId, pickNumber: null });
    }
    const teamPicks = picks.filter((p) => p.captainUserId === cap.primaryUserId);
    for (const pick of teamPicks) {
      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: pick.pickedUserId,
        pickNumber: pick.pickNumber,
      });
    }
  }

  await db
    .update(drafts)
    .set({ state: "completed", completedAt: new Date() })
    .where(eq(drafts.id, draft.id));

  await db
    .update(seasons)
    .set({ state: "group_stage", updatedAt: new Date() })
    .where(eq(seasons.id, draft.seasonId));
}

export type { Draft, DraftPick };
