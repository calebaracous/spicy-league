"use server";

import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { pingTenMan } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import {
  tenManCaptains,
  tenManPicks,
  tenManSignups,
  tenManVotes,
  tenMans,
} from "@/db/schema/ten-mans";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";
import { getActiveBan } from "@/lib/bans";
import { logEvent } from "@/lib/events";
import { electCaptains, PICK_ORDER_C1_C2 } from "@/lib/ten-man";

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Every action returns `{ error }` for expected failures (races, wrong phase,
 * not your turn) instead of throwing: thrown server-action errors crash the
 * page into the error boundary and have their message stripped in production.
 * Throw `TenManError` inside an action body; `run()` turns it into `{ error }`.
 * Anything else (auth redirects, DB failures) still propagates.
 */
export type TenManActionResult = { error?: string };

class TenManError extends Error {}

async function run(fn: () => Promise<void>): Promise<TenManActionResult> {
  try {
    await fn();
    return {};
  } catch (err) {
    if (err instanceof TenManError) return { error: err.message };
    throw err;
  }
}

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } })?.code;
  const causeCode = (err as { cause?: { code?: string } })?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

function revalidate(tenManId: string) {
  revalidatePath("/10-man");
  revalidatePath(`/10-man/${tenManId}`);
}

async function getTenManOrFail(id: string) {
  const row = await db.query.tenMans.findFirst({ where: eq(tenMans.id, id) });
  if (!row) throw new TenManError("This 10-man no longer exists.");
  return row;
}

// ── actions ───────────────────────────────────────────────────────────────────

/**
 * Admin: create a new 10-man session.
 * Returns `{ error }` if one is already active (partial unique index on DB).
 */
export async function start10Man(): Promise<TenManActionResult & { id?: string }> {
  const session = await requireAdmin();

  // Generate a fun lobby code like SPCY-xxxx
  const code = `SPCY-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  try {
    const [row] = await db
      .insert(tenMans)
      .values({ createdBy: session.user.id, state: "signups", lobbyCode: code })
      .returning({ id: tenMans.id });
    await logEvent("tenman.started", { actorId: session.user.id, data: { tenManId: row.id } });

    revalidatePath("/10-man");
    syncInBackground("10-man ping", pingTenMan);
    return { id: row.id };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "A 10-man is already running. Finish or cancel it first." };
    }
    throw err;
  }
}

/**
 * Admin: cancel any active 10-man before it completes.
 */
export async function cancel10Man(id: string): Promise<TenManActionResult> {
  const session = await requireAdmin();
  return run(async () => {
    const tm = await getTenManOrFail(id);
    if (tm.state === "complete") throw new TenManError("A completed 10-man cannot be cancelled.");

    await db.update(tenMans).set({ state: "cancelled" }).where(eq(tenMans.id, id));
    await logEvent("tenman.cancelled", { actorId: session.user.id, data: { tenManId: id } });
    revalidate(id);
  });
}

/**
 * Any signed-in user: join signups (max 10, deduplicated).
 */
export async function joinSignup(id: string): Promise<TenManActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;

  return run(async () => {
    if (await getActiveBan(userId)) {
      throw new TenManError("Your account is suspended from Spicy League.");
    }
    const joined = await db.transaction(async (tx) => {
      // Lock the row
      const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
      if (!tm) throw new TenManError("This 10-man no longer exists.");
      if (tm.state !== "signups") throw new TenManError("Signups are closed for this 10-man.");

      // Count current signups
      const [{ n }] = await tx
        .select({ n: count() })
        .from(tenManSignups)
        .where(eq(tenManSignups.tenManId, id));
      if (n >= 10) throw new TenManError("All 10 spots were just taken.");

      // Already signed up?
      const existing = await tx.query.tenManSignups.findFirst({
        where: and(eq(tenManSignups.tenManId, id), eq(tenManSignups.userId, userId)),
      });
      if (existing) return false; // idempotent

      const signupOrder = n + 1;
      await tx.insert(tenManSignups).values({ tenManId: id, userId, signupOrder });

      // If this was the 10th signup, transition to voting
      if (signupOrder === 10) {
        await tx
          .update(tenMans)
          .set({ state: "voting", signupsClosedAt: new Date() })
          .where(eq(tenMans.id, id));
      }
      return true;
    });
    if (joined) await logEvent("tenman.joined", { actorId: userId, data: { tenManId: id } });

    revalidate(id);
  });
}

/**
 * Signed-in user: drop out of signups (only during signups phase).
 */
export async function leaveSignup(id: string): Promise<TenManActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;

  return run(async () => {
    await db.transaction(async (tx) => {
      const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
      if (!tm) throw new TenManError("This 10-man no longer exists.");
      if (tm.state !== "signups")
        throw new TenManError("You can only leave while signups are open.");

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
    await logEvent("tenman.left", { actorId: userId, data: { tenManId: id } });

    revalidate(id);
  });
}

/**
 * Voter (must be one of the 10 signups) casts 2 votes.
 * Replaces any existing votes in a single transaction.
 * If this brings total unique-voter count to 10, elect captains.
 */
export async function castVote(
  id: string,
  candidateIds: [string, string],
): Promise<TenManActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;

  return run(async () => {
    if (candidateIds[0] === candidateIds[1]) throw new TenManError("Pick two different players.");

    await db.transaction(async (tx) => {
      const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
      if (!tm || tm.state !== "voting") throw new TenManError("Voting has closed.");

      // Voter and both candidates must be signups. Self-votes are allowed —
      // volunteering to captain is a legitimate choice in a pickup game.
      const signups = await tx
        .select({ userId: tenManSignups.userId })
        .from(tenManSignups)
        .where(eq(tenManSignups.tenManId, id));
      const signupIds = new Set(signups.map((s) => s.userId));
      if (!signupIds.has(userId)) throw new TenManError("You are not in this 10-man");
      if (!candidateIds.every((c) => signupIds.has(c))) {
        throw new TenManError("Candidates must be in this 10-man");
      }

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
  });
}

/**
 * On-the-clock captain (or admin): pick a player from the pool.
 * `expectedPickNumber` is the pick the clicker saw; if the draft has moved on,
 * the click is rejected rather than credited to whoever is now on the clock.
 */
export async function submitPick(
  id: string,
  pickedUserId: string,
  expectedPickNumber: number,
): Promise<TenManActionResult> {
  const session = await requireAuth();
  const callerId = session.user.id;
  const isAdmin = session.user.role === "admin";

  return run(async () => {
    await db.transaction(async (tx) => {
      const [tm] = await tx.select().from(tenMans).where(eq(tenMans.id, id)).for("update");
      if (!tm || tm.state !== "drafting") throw new TenManError("The draft is not in progress");

      const picks = await tx
        .select()
        .from(tenManPicks)
        .where(eq(tenManPicks.tenManId, id))
        .orderBy(tenManPicks.pickNumber);

      if (picks.length >= 8) throw new TenManError("Draft is already complete");

      const captains = await tx
        .select()
        .from(tenManCaptains)
        .where(eq(tenManCaptains.tenManId, id))
        .orderBy(tenManCaptains.captainOrder);

      const nextPickIdx = picks.length;
      if (expectedPickNumber !== nextPickIdx + 1) {
        throw new TenManError("Another pick was made first. Check the board and pick again.");
      }
      const captainOrderNeeded = PICK_ORDER_C1_C2[nextPickIdx];
      const onTheClock = captains.find((c) => c.captainOrder === captainOrderNeeded);
      if (!onTheClock) throw new TenManError("No captain on the clock");

      if (!isAdmin && callerId !== onTheClock.userId) {
        throw new TenManError("It is not your turn to pick");
      }

      // pickedUserId must not be a captain and must not already be picked
      const captainIds = new Set(captains.map((c) => c.userId));
      const pickedIds = new Set(picks.map((p) => p.pickedUserId));
      if (captainIds.has(pickedUserId) || pickedIds.has(pickedUserId)) {
        throw new TenManError("Player is not available");
      }
      const inSignups = await tx.query.tenManSignups.findFirst({
        where: and(eq(tenManSignups.tenManId, id), eq(tenManSignups.userId, pickedUserId)),
      });
      if (!inSignups) throw new TenManError("Player is not in this 10-man");

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
    await logEvent("tenman.pick", {
      actorId: callerId,
      subjectUserId: pickedUserId,
      data: { tenManId: id, pickNumber: expectedPickNumber },
    });

    revalidate(id);
  });
}

/**
 * Admin: report the match result, locking the session.
 */
export async function reportResult(
  id: string,
  args: { winnerCaptainUserId: string; durationLabel?: string },
): Promise<TenManActionResult> {
  const session = await requireAdmin();
  return run(async () => {
    const tm = await getTenManOrFail(id);
    if (tm.state !== "ready")
      throw new TenManError("The result can only be reported once teams are set.");

    // Verify winner is a captain
    const cap = await db.query.tenManCaptains.findFirst({
      where: and(
        eq(tenManCaptains.tenManId, id),
        eq(tenManCaptains.userId, args.winnerCaptainUserId),
      ),
    });
    if (!cap) throw new TenManError("Winner is not a captain");

    await db
      .update(tenMans)
      .set({
        state: "complete",
        winnerCaptainUserId: args.winnerCaptainUserId,
        durationLabel: args.durationLabel ?? null,
        completedAt: new Date(),
      })
      .where(eq(tenMans.id, id));
    await logEvent("tenman.result", {
      actorId: session.user.id,
      subjectUserId: args.winnerCaptainUserId,
      data: { tenManId: id },
    });

    revalidate(id);
  });
}
