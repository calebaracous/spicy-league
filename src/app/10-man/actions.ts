"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import {
  tenManCaptains,
  tenManPicks,
  tenManSignups,
  tenManVotes,
  tenMans,
} from "@/db/schema/ten-mans";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";
import { electCaptains, PICK_ORDER_C1_C2 } from "@/lib/ten-man";

// ── helpers ──────────────────────────────────────────────────────────────────

function revalidate(tenManId: string) {
  revalidatePath("/10-man");
  revalidatePath(`/10-man/${tenManId}`);
}

async function getTenManOrFail(id: string) {
  const row = await db.query.tenMans.findFirst({ where: eq(tenMans.id, id) });
  if (!row) throw new Error("10-man not found");
  return row;
}

// ── actions ───────────────────────────────────────────────────────────────────

/**
 * Admin: create a new 10-man session.
 * Throws if one is already active (partial unique index on DB).
 */
export async function start10Man(): Promise<{ id: string }> {
  const session = await requireAdmin();

  // Generate a fun lobby code like SPCY-xxxx
  const code = `SPCY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const [row] = await db
    .insert(tenMans)
    .values({ createdBy: session.user.id, state: "signups", lobbyCode: code })
    .returning({ id: tenMans.id });

  revalidatePath("/10-man");
  return { id: row.id };
}

/**
 * Admin: cancel any active 10-man before it completes.
 */
export async function cancel10Man(id: string): Promise<void> {
  await requireAdmin();
  const tm = await getTenManOrFail(id);
  if (tm.state === "complete") throw new Error("Cannot cancel a completed 10-man");

  await db.update(tenMans).set({ state: "cancelled" }).where(eq(tenMans.id, id));
  revalidate(id);
}

/**
 * Any signed-in user: join signups (max 10, deduplicated).
 */
export async function joinSignup(id: string): Promise<void> {
  const session = await requireAuth();
  const userId = session.user.id;

  await db.transaction(async (tx) => {
    // Lock the row
    const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
    if (!tm) throw new Error("Not found");
    if (tm.state !== "signups") throw new Error("Signups are not open");

    // Count current signups
    const [{ n }] = await tx
      .select({ n: count() })
      .from(tenManSignups)
      .where(eq(tenManSignups.tenManId, id));
    if (n >= 10) throw new Error("signups-full");

    // Already signed up?
    const existing = await tx.query.tenManSignups.findFirst({
      where: and(eq(tenManSignups.tenManId, id), eq(tenManSignups.userId, userId)),
    });
    if (existing) return; // idempotent

    const signupOrder = n + 1;
    await tx.insert(tenManSignups).values({ tenManId: id, userId, signupOrder });

    // If this was the 10th signup, transition to voting
    if (signupOrder === 10) {
      await tx
        .update(tenMans)
        .set({ state: "voting", signupsClosedAt: new Date() })
        .where(eq(tenMans.id, id));
    }
  });

  revalidate(id);
}

/**
 * Signed-in user: drop out of signups (only during signups phase).
 */
export async function leaveSignup(id: string): Promise<void> {
  const session = await requireAuth();
  const userId = session.user.id;

  await db.transaction(async (tx) => {
    const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
    if (!tm) throw new Error("Not found");
    if (tm.state !== "signups") throw new Error("Cannot leave now");

    // Delete this user's signup
    await tx
      .delete(tenManSignups)
      .where(and(eq(tenManSignups.tenManId, id), eq(tenManSignups.userId, userId)));

    // Re-order remaining signups to fill the gap
    const remaining = await tx
      .select()
      .from(tenManSignups)
      .where(eq(tenManSignups.tenManId, id))
      .orderBy(tenManSignups.signupOrder);

    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].signupOrder !== i + 1) {
        await tx
          .update(tenManSignups)
          .set({ signupOrder: i + 1 })
          .where(eq(tenManSignups.id, remaining[i].id));
      }
    }
  });

  revalidate(id);
}

/**
 * Voter (must be one of the 10 signups) casts 2 votes.
 * Replaces any existing votes in a single transaction.
 * If this brings total unique-voter count to 10, elect captains.
 */
export async function castVote(id: string, candidateIds: [string, string]): Promise<void> {
  const session = await requireAuth();
  const userId = session.user.id;

  if (candidateIds[0] === candidateIds[1]) throw new Error("Must pick 2 different candidates");

  await db.transaction(async (tx) => {
    const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
    if (!tm || tm.state !== "voting") throw new Error("Voting is not open");

    // Voter must be a signup
    const signup = await tx.query.tenManSignups.findFirst({
      where: and(eq(tenManSignups.tenManId, id), eq(tenManSignups.userId, userId)),
    });
    if (!signup) throw new Error("You are not in this 10-man");

    // Delete existing votes from this voter, insert fresh
    await tx
      .delete(tenManVotes)
      .where(and(eq(tenManVotes.tenManId, id), eq(tenManVotes.voterUserId, userId)));

    await tx.insert(tenManVotes).values([
      { tenManId: id, voterUserId: userId, candidateUserId: candidateIds[0] },
      { tenManId: id, voterUserId: userId, candidateUserId: candidateIds[1] },
    ]);

    // Check if all 10 have now voted
    const allVotes = await tx
      .select({
        voterUserId: tenManVotes.voterUserId,
        candidateUserId: tenManVotes.candidateUserId,
      })
      .from(tenManVotes)
      .where(eq(tenManVotes.tenManId, id));

    const uniqueVoters = new Set(allVotes.map((v) => v.voterUserId));
    if (uniqueVoters.size >= 10) {
      // Elect captains (writes tenManCaptains rows)
      await electCaptains(tx, id, allVotes);
      await tx
        .update(tenMans)
        .set({ state: "drafting", draftStartedAt: new Date() })
        .where(eq(tenMans.id, id));
    }
  });

  revalidate(id);
}

/**
 * On-the-clock captain (or admin): pick a player from the pool.
 */
export async function submitPick(id: string, pickedUserId: string): Promise<void> {
  const session = await requireAuth();
  const callerId = session.user.id;
  const isAdmin = session.user.role === "admin";

  await db.transaction(async (tx) => {
    const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
    if (!tm || tm.state !== "drafting") throw new Error("Draft is not live");

    const picks = await tx
      .select()
      .from(tenManPicks)
      .where(eq(tenManPicks.tenManId, id))
      .orderBy(tenManPicks.pickNumber);

    if (picks.length >= 8) throw new Error("Draft is already complete");

    const captains = await tx
      .select()
      .from(tenManCaptains)
      .where(eq(tenManCaptains.tenManId, id))
      .orderBy(tenManCaptains.captainOrder);

    const nextPickIdx = picks.length;
    const captainOrderNeeded = PICK_ORDER_C1_C2[nextPickIdx];
    const onTheClock = captains.find((c) => c.captainOrder === captainOrderNeeded);
    if (!onTheClock) throw new Error("No captain on the clock");

    if (!isAdmin && callerId !== onTheClock.userId) {
      throw new Error("It is not your turn to pick");
    }

    // pickedUserId must not be a captain and must not already be picked
    const captainIds = new Set(captains.map((c) => c.userId));
    const pickedIds = new Set(picks.map((p) => p.pickedUserId));
    if (captainIds.has(pickedUserId) || pickedIds.has(pickedUserId)) {
      throw new Error("Player is not available");
    }

    const pickNumber = nextPickIdx + 1;
    await tx.insert(tenManPicks).values({
      tenManId: id,
      pickNumber,
      captainUserId: onTheClock.userId,
      pickedUserId,
    });

    // If this was the 8th pick, transition to ready
    if (pickNumber === 8) {
      await tx
        .update(tenMans)
        .set({ state: "ready", readyAt: new Date() })
        .where(eq(tenMans.id, id));
    }
  });

  revalidate(id);
}

/**
 * Admin: report the match result, locking the session.
 */
export async function reportResult(
  id: string,
  args: { winnerCaptainUserId: string; durationLabel?: string },
): Promise<void> {
  await requireAdmin();
  const tm = await getTenManOrFail(id);
  if (tm.state !== "ready") throw new Error("Not in ready state");

  // Verify winner is a captain
  const cap = await db.query.tenManCaptains.findFirst({
    where: and(
      eq(tenManCaptains.tenManId, id),
      eq(tenManCaptains.userId, args.winnerCaptainUserId),
    ),
  });
  if (!cap) throw new Error("Winner is not a captain");

  await db
    .update(tenMans)
    .set({
      state: "complete",
      winnerCaptainUserId: args.winnerCaptainUserId,
      durationLabel: args.durationLabel ?? null,
      completedAt: new Date(),
    })
    .where(eq(tenMans.id, id));

  revalidate(id);
}
