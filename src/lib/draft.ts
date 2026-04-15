import "server-only";

import { asc, eq } from "drizzle-orm";

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

export const PICKS_PER_TEAM = 4;

/**
 * Snake order: captains pick in their captainOrder, reverse, repeat.
 * Returns the 1-indexed captainOrder for a 1-indexed global pick number.
 */
export function captainOrderForPick(pickNumber: number, captainCount: number): number {
  const round = Math.ceil(pickNumber / captainCount);
  const within = ((pickNumber - 1) % captainCount) + 1;
  return round % 2 === 1 ? within : captainCount - within + 1;
}

export function totalPicks(captainCount: number): number {
  return PICKS_PER_TEAM * captainCount;
}

export type DraftSnapshot = {
  draft: { id: string; state: Draft["state"]; startedAt: Date | null; completedAt: Date | null };
  season: { id: string; slug: string; name: string };
  captains: Array<{ userId: string; displayName: string; captainOrder: number }>;
  pool: Array<{ userId: string; displayName: string; signupId: string }>;
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
    captainDisplayName: string;
    captainOrder: number;
  } | null;
};

export async function getDraftSnapshot(seasonSlug: string): Promise<DraftSnapshot | null> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, seasonSlug) });
  if (!season) return null;

  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (!draft) return null;

  const [captains, signupsRows, picksRows] = await Promise.all([
    db
      .select({
        userId: seasonCaptains.userId,
        displayName: users.displayName,
        captainOrder: seasonCaptains.captainOrder,
      })
      .from(seasonCaptains)
      .innerJoin(users, eq(seasonCaptains.userId, users.id))
      .where(eq(seasonCaptains.seasonId, season.id))
      .orderBy(asc(seasonCaptains.captainOrder)),
    db
      .select({
        signupId: seasonSignups.id,
        userId: seasonSignups.userId,
        displayName: users.displayName,
      })
      .from(seasonSignups)
      .innerJoin(users, eq(seasonSignups.userId, users.id))
      .where(eq(seasonSignups.seasonId, season.id))
      .orderBy(asc(users.displayName)),
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

  const captainIds = new Set(captains.map((c) => c.userId));
  const pickedIds = new Set(picksRows.map((p) => p.pickedUserId));
  const captainName = new Map(captains.map((c) => [c.userId, c.displayName ?? "?"]));
  const signupName = new Map(signupsRows.map((s) => [s.userId, s.displayName ?? "?"]));

  const pool = signupsRows
    .filter((s) => !captainIds.has(s.userId) && !pickedIds.has(s.userId))
    .map((s) => ({ userId: s.userId, displayName: s.displayName ?? "?", signupId: s.signupId }));

  const total = totalPicks(captains.length);
  const picks = picksRows.map((p) => ({
    pickNumber: p.pickNumber,
    captainUserId: p.captainUserId,
    captainDisplayName: captainName.get(p.captainUserId) ?? "?",
    pickedUserId: p.pickedUserId,
    pickedDisplayName: signupName.get(p.pickedUserId) ?? "?",
    pickedAt: p.pickedAt,
  }));

  let onTheClock: DraftSnapshot["onTheClock"] = null;
  if (draft.state === "in_progress" && picks.length < total && captains.length > 0) {
    const nextPickNumber = picks.length + 1;
    const order = captainOrderForPick(nextPickNumber, captains.length);
    const cap = captains.find((c) => c.captainOrder === order);
    if (cap) {
      onTheClock = {
        pickNumber: nextPickNumber,
        captainUserId: cap.userId,
        captainDisplayName: cap.displayName ?? "?",
        captainOrder: cap.captainOrder,
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
    season: { id: season.id, slug: season.slug, name: season.name },
    captains: captains.map((c) => ({
      userId: c.userId,
      displayName: c.displayName ?? "?",
      captainOrder: c.captainOrder,
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

  const captains = await db
    .select({ userId: seasonCaptains.userId, displayName: users.displayName })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, draft.seasonId))
    .orderBy(asc(seasonCaptains.captainOrder));

  const picks = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draft.id))
    .orderBy(asc(draftPicks.pickNumber));

  if (picks.length !== totalPicks(captains.length)) return;

  const existing = await db.query.teams.findFirst({ where: eq(teams.seasonId, draft.seasonId) });
  if (existing) return;

  for (const cap of captains) {
    const [team] = await db
      .insert(teams)
      .values({
        seasonId: draft.seasonId,
        name: `Team ${cap.displayName ?? "Captain"}`,
        captainUserId: cap.userId,
      })
      .returning();
    await db.insert(teamMembers).values({ teamId: team.id, userId: cap.userId, pickNumber: null });
    const teamPicks = picks.filter((p) => p.captainUserId === cap.userId);
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
