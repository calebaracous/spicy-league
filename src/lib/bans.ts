import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { sessions, users } from "@/db/schema/auth";

/**
 * League bans. A banned user can't create a session (sign-in is refused by
 * the `session.create.before` hook in src/lib/auth.ts), their existing
 * sessions are deleted when the ban is applied, and season / 10-man signup
 * actions refuse them. Public profiles stay visible.
 *
 * Better Auth's session cookie cache (5 min) means an already-open tab can
 * keep reading pages for up to 5 minutes; every write path checks
 * `getActiveBan` against the DB, so a banned user can't act in that window.
 */

type BanFields = {
  bannedAt: Date | null;
  banExpiresAt: Date | null;
  banReason: string | null;
};

export function isBanActive(u: BanFields, now = new Date()): boolean {
  return !!u.bannedAt && (!u.banExpiresAt || u.banExpiresAt > now);
}

export function banMessage(u: BanFields): string {
  const until = u.banExpiresAt
    ? ` until ${u.banExpiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })} (UTC)`
    : "";
  return `This account is suspended from Spicy League${until}.${u.banReason ? ` Reason: ${u.banReason}` : ""}`;
}

/** The user's active ban, or null. Reads the DB (not the cached session). */
export async function getActiveBan(userId: string): Promise<BanFields | null> {
  const u = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { bannedAt: true, banExpiresAt: true, banReason: true },
  });
  return u && isBanActive(u) ? u : null;
}

export async function banUser(args: {
  userId: string;
  adminId: string;
  reason: string | null;
  expiresAt: Date | null;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        bannedAt: new Date(),
        banReason: args.reason,
        banExpiresAt: args.expiresAt,
        bannedBy: args.adminId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, args.userId));
    // Sign them out everywhere.
    await tx.delete(sessions).where(eq(sessions.userId, args.userId));
  });
}

export async function unbanUser(userId: string): Promise<void> {
  await db
    .update(users)
    .set({
      bannedAt: null,
      banReason: null,
      banExpiresAt: null,
      bannedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}
