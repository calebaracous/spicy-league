import "server-only";

import { desc, eq, inArray, not, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import {
  tenManCaptains,
  tenManPicks,
  tenManSignups,
  tenManVotes,
  tenMans,
  type TenMan,
  type TenManState,
} from "@/db/schema/ten-mans";

// Snake draft order: index = pick# (0-based), value = captain index (1 or 2)
// C1, C2, C2, C1, C1, C2, C2, C1
export const PICK_ORDER_C1_C2 = [1, 2, 2, 1, 1, 2, 2, 1] as const;

export type TenManSignupEntry = {
  userId: string;
  displayName: string;
  signupOrder: number;
  rolePrefs: unknown;
  joinedAt: Date;
};

export type TenManCaptainEntry = {
  userId: string;
  displayName: string;
  captainOrder: number;
  voteCount: number;
};

export type TenManPickEntry = {
  pickNumber: number;
  captainUserId: string;
  captainDisplayName: string;
  pickedUserId: string;
  pickedDisplayName: string;
  pickedAt: Date;
};

export type TenManSnapshot = {
  tenMan: TenMan;
  signups: TenManSignupEntry[];
  votes: { voterUserId: string; candidateUserId: string }[];
  tally: Record<string, number>;
  captains: TenManCaptainEntry[];
  picks: TenManPickEntry[];
  onTheClock: { pickNumber: number; captainUserId: string; captainOrder: number } | null;
  result: { winnerCaptainUserId: string; durationLabel: string | null } | null;
};

export async function getActiveTenMan(): Promise<TenMan | null> {
  const rows = await db
    .select()
    .from(tenMans)
    .where(not(inArray(tenMans.state, ["complete", "cancelled"])))
    .orderBy(desc(tenMans.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTenManSnapshot(id: string): Promise<TenManSnapshot | null> {
  const tenMan = await db.query.tenMans.findFirst({ where: eq(tenMans.id, id) });
  if (!tenMan) return null;

  const [signupRows, voteRows, captainRows, pickRows] = await Promise.all([
    db
      .select({
        userId: tenManSignups.userId,
        displayName: sql<string>`COALESCE(${users.name}, ${users.username}, '?')`,
        signupOrder: tenManSignups.signupOrder,
        joinedAt: tenManSignups.createdAt,
        // rolePrefs not stored in ten-man signups; use null for now
      })
      .from(tenManSignups)
      .leftJoin(users, eq(tenManSignups.userId, users.id))
      .where(eq(tenManSignups.tenManId, id))
      .orderBy(tenManSignups.signupOrder),

    db
      .select({
        voterUserId: tenManVotes.voterUserId,
        candidateUserId: tenManVotes.candidateUserId,
      })
      .from(tenManVotes)
      .where(eq(tenManVotes.tenManId, id)),

    db
      .select({
        userId: tenManCaptains.userId,
        displayName: sql<string>`COALESCE(${users.name}, ${users.username}, '?')`,
        captainOrder: tenManCaptains.captainOrder,
        voteCount: tenManCaptains.voteCount,
      })
      .from(tenManCaptains)
      .leftJoin(users, eq(tenManCaptains.userId, users.id))
      .where(eq(tenManCaptains.tenManId, id))
      .orderBy(tenManCaptains.captainOrder),

    db
      .select({
        pickNumber: tenManPicks.pickNumber,
        captainUserId: tenManPicks.captainUserId,
        captainDisplayName: sql<string>`cu.name`,
        pickedUserId: tenManPicks.pickedUserId,
        pickedDisplayName: sql<string>`pu.name`,
        pickedAt: tenManPicks.pickedAt,
      })
      .from(tenManPicks)
      .leftJoin(sql`"users" cu`, sql`cu.id = ${tenManPicks.captainUserId}`)
      .leftJoin(sql`"users" pu`, sql`pu.id = ${tenManPicks.pickedUserId}`)
      .where(eq(tenManPicks.tenManId, id))
      .orderBy(tenManPicks.pickNumber),
  ]);

  // Compute vote tally
  const tally: Record<string, number> = {};
  for (const v of voteRows) {
    tally[v.candidateUserId] = (tally[v.candidateUserId] ?? 0) + 1;
  }

  // Compute on-the-clock from pick order
  let onTheClock: TenManSnapshot["onTheClock"] = null;
  if (tenMan.state === "drafting" && pickRows.length < 8 && captainRows.length >= 2) {
    const nextPickIdx = pickRows.length; // 0-based
    const captainOrderNeeded = PICK_ORDER_C1_C2[nextPickIdx];
    const cap = captainRows.find((c) => c.captainOrder === captainOrderNeeded);
    if (cap) {
      onTheClock = {
        pickNumber: nextPickIdx + 1,
        captainUserId: cap.userId,
        captainOrder: cap.captainOrder,
      };
    }
  }

  // Result
  const result = tenMan.winnerCaptainUserId
    ? { winnerCaptainUserId: tenMan.winnerCaptainUserId, durationLabel: tenMan.durationLabel }
    : null;

  return {
    tenMan,
    signups: signupRows.map((r) => ({
      userId: r.userId,
      displayName: r.displayName,
      signupOrder: r.signupOrder,
      rolePrefs: null,
      joinedAt: r.joinedAt,
    })),
    votes: voteRows,
    tally,
    captains: captainRows.map((c) => ({
      userId: c.userId,
      displayName: c.displayName,
      captainOrder: c.captainOrder,
      voteCount: c.voteCount,
    })),
    picks: pickRows.map((p) => ({
      pickNumber: p.pickNumber,
      captainUserId: p.captainUserId,
      captainDisplayName: p.captainDisplayName,
      pickedUserId: p.pickedUserId,
      pickedDisplayName: p.pickedDisplayName,
      pickedAt: p.pickedAt,
    })),
    onTheClock,
    result,
  };
}

export async function getRecentTenMans(limit = 10) {
  const rows = await db
    .select({
      id: tenMans.id,
      completedAt: tenMans.completedAt,
      durationLabel: tenMans.durationLabel,
      winnerCaptainUserId: tenMans.winnerCaptainUserId,
      winnerName: sql<string>`wu.name`,
    })
    .from(tenMans)
    .leftJoin(sql`"users" wu`, sql`wu.id = ${tenMans.winnerCaptainUserId}`)
    .where(eq(tenMans.state, "complete"))
    .orderBy(desc(tenMans.completedAt))
    .limit(limit);

  // For each completed 10-man we also need the loser captain name.
  // Fetch captains separately to keep the query simple.
  const results = await Promise.all(
    rows.map(async (row) => {
      const caps = await db
        .select({
          userId: tenManCaptains.userId,
          displayName: sql<string>`COALESCE(${users.name}, ${users.username}, '?')`,
          captainOrder: tenManCaptains.captainOrder,
        })
        .from(tenManCaptains)
        .leftJoin(users, eq(tenManCaptains.userId, users.id))
        .where(eq(tenManCaptains.tenManId, row.id))
        .orderBy(tenManCaptains.captainOrder);

      const winner = caps.find((c) => c.userId === row.winnerCaptainUserId);
      const loser = caps.find((c) => c.userId !== row.winnerCaptainUserId);
      return {
        id: row.id,
        completedAt: row.completedAt,
        durationLabel: row.durationLabel,
        winnerName: winner?.displayName ?? "?",
        loserName: loser?.displayName ?? "?",
      };
    }),
  );

  return results;
}

type DbOrTx = {
  insert: typeof db.insert;
};

/**
 * Elect captains once all votes are in.
 * Top 2 by vote_count; ties broken at random.
 * Must be called inside a transaction.
 */
export async function electCaptains(
  tx: DbOrTx,
  tenManId: string,
  votes: { voterUserId: string; candidateUserId: string }[],
): Promise<void> {
  // Tally
  const tally: Record<string, number> = {};
  for (const v of votes) {
    tally[v.candidateUserId] = (tally[v.candidateUserId] ?? 0) + 1;
  }

  // All signup user IDs are valid candidates
  const sorted = Object.entries(tally).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return Math.random() - 0.5; // random tiebreak
  });

  const top2 = sorted.slice(0, 2);

  await tx.insert(tenManCaptains).values(
    top2.map(([userId, voteCount], i) => ({
      tenManId,
      userId,
      captainOrder: i + 1,
      voteCount,
    })),
  );
}

export type { TenMan, TenManState };
