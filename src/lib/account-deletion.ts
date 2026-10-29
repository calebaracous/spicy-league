import "server-only";

import { and, eq, inArray, notInArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { accounts, sessions, users } from "@/db/schema/auth";
import { draftPicks, teamMembers, teams } from "@/db/schema/drafts";
import { matchSubstitutions } from "@/db/schema/matches";
import { seasonCaptains, seasonSignups, seasons, type SeasonState } from "@/db/schema/seasons";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { tenManCaptains, tenManPicks, tenMans, tenManSignups } from "@/db/schema/ten-mans";
import { removeLeagueRoles } from "@/lib/discord-ping-roles";
import { syncInBackground, type Person } from "@/lib/discord-roles";
import { logEvent } from "@/lib/events";

/**
 * Account deletion, from the owner's own profile or an admin's tools on
 * /users/[username]. See docs/DATA-MODEL.md → "Deleting an account".
 *
 * A plain `DELETE FROM users` cascades to teams the player captained (and
 * their matches), draft picks and 10-man history, which would rewrite past
 * seasons. So a player with league history is **anonymized** instead: their
 * personal data, sign-in and linked accounts are removed, and the row stays
 * as "Deleted player" (no username, so no public profile) to keep rosters and
 * results intact. Anyone without history is deleted outright.
 */

export const DELETED_PLAYER_NAME = "Deleted player";

/** Signups in these seasons are still just signups; deleting them changes nothing else. */
const PRE_DRAFT_STATES: SeasonState[] = ["draft", "signups_open", "signups_closed"];
const ACTIVE_TEN_MAN_STATES = ["signups", "voting", "drafting", "ready"] as const;

/**
 * Why this account can't be deleted right now, or null. Shown as-is to both
 * the owner and admins, so it says "this account", not "you".
 */
export async function deletionBlocker(userId: string): Promise<string | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  if (!user) return "That account no longer exists.";
  if (user.role === "admin") {
    return "Admin accounts can't be deleted. Another admin has to remove the admin role first.";
  }

  // In a season past signups (captains picked, drafting or playing), or a
  // captain in one that hasn't started: removing them would break the draft
  // order or a team mid-season.
  const [inSeason] = await db
    .select({ name: seasons.name })
    .from(seasonSignups)
    .innerJoin(seasons, eq(seasonSignups.seasonId, seasons.id))
    .where(
      and(
        eq(seasonSignups.userId, userId),
        notInArray(seasons.state, [...PRE_DRAFT_STATES, "complete"]),
      ),
    )
    .limit(1);
  if (inSeason) {
    return `This account is in ${inSeason.name}, which is under way. It can be deleted once the season is complete.`;
  }
  const [captain] = await db
    .select({ name: seasons.name })
    .from(seasonCaptains)
    .innerJoin(seasons, eq(seasonCaptains.seasonId, seasons.id))
    .where(and(eq(seasonCaptains.userId, userId), notInArray(seasons.state, ["complete"])))
    .limit(1);
  if (captain) {
    return `This account is a captain in ${captain.name}. An admin has to remove the captaincy first.`;
  }

  const [tenMan] = await db
    .select({ id: tenMans.id })
    .from(tenManSignups)
    .innerJoin(tenMans, eq(tenManSignups.tenManId, tenMans.id))
    .where(
      and(eq(tenManSignups.userId, userId), inArray(tenMans.state, [...ACTIVE_TEN_MAN_STATES])),
    )
    .limit(1);
  if (tenMan) {
    return "This account is in a 10-man that hasn't finished. Leave it or wait until it's over.";
  }
  return null;
}

/** True if removing the row would delete teams, picks, lineups or 10-man results. */
async function hasLeagueHistory(userId: string): Promise<boolean> {
  const checks = await Promise.all([
    db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.userId, userId)),
    db.select({ id: teams.id }).from(teams).where(eq(teams.captainUserId, userId)),
    db
      .select({ id: draftPicks.id })
      .from(draftPicks)
      .where(or(eq(draftPicks.pickedUserId, userId), eq(draftPicks.captainUserId, userId))),
    db
      .select({ id: seasonCaptains.id })
      .from(seasonCaptains)
      .where(eq(seasonCaptains.userId, userId)),
    db
      .select({ id: matchSubstitutions.id })
      .from(matchSubstitutions)
      .where(eq(matchSubstitutions.subUserId, userId)),
    db.select({ id: tenManSignups.id }).from(tenManSignups).where(eq(tenManSignups.userId, userId)),
    db
      .select({ id: tenManCaptains.id })
      .from(tenManCaptains)
      .where(eq(tenManCaptains.userId, userId)),
    db
      .select({ id: tenManPicks.id })
      .from(tenManPicks)
      .where(or(eq(tenManPicks.pickedUserId, userId), eq(tenManPicks.captainUserId, userId))),
  ]);
  return checks.some((rows) => rows.length > 0);
}

export type DeleteResult = { error: string } | { anonymized: boolean };

/**
 * Deletes (or anonymizes) the account and logs `user.deleted`. Callers check
 * permission; this re-checks `deletionBlocker`. The owner's own session
 * cookie is the caller's job (sign out first — see deleteOwnAccount).
 */
export async function deleteAccount(userId: string, actorId: string): Promise<DeleteResult> {
  const blocker = await deletionBlocker(userId);
  if (blocker) return { error: blocker };

  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return { error: "That account no longer exists." };
  const anonymized = await hasLeagueHistory(userId);

  if (anonymized) {
    await db.transaction(async (tx) => {
      await tx.delete(sessions).where(eq(sessions.userId, userId));
      await tx.delete(accounts).where(eq(accounts.userId, userId));
      await tx.delete(riotStatSnapshots).where(eq(riotStatSnapshots.userId, userId));
      await tx.delete(accountLinks).where(eq(accountLinks.userId, userId));
      // Upcoming signups go; past ones stay (draft history reads them) minus
      // their free-text answers.
      const upcoming = tx
        .select({ id: seasons.id })
        .from(seasons)
        .where(inArray(seasons.state, PRE_DRAFT_STATES));
      await tx
        .delete(seasonSignups)
        .where(and(eq(seasonSignups.userId, userId), inArray(seasonSignups.seasonId, upcoming)));
      await tx
        .update(seasonSignups)
        .set({ notes: null, quandary: null })
        .where(eq(seasonSignups.userId, userId));
      await tx
        .update(users)
        .set({
          name: DELETED_PLAYER_NAME,
          username: null,
          // Unique and not null; .invalid never resolves, so nothing can be sent to it.
          email: `deleted-${userId}@deleted.invalid`,
          emailVerified: false,
          image: null,
          bio: null,
          pronouns: null,
          opggUrl: null,
          discordUsername: null,
          discordUserId: null,
          tenManPings: false,
          captainInterest: false,
          statsOptInAt: null,
          eventsSeenAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
    });
  } else {
    // Cascades to sessions, accounts, signups and linked accounts.
    await db.delete(users).where(eq(users.id, userId));
  }

  const self = actorId === userId;
  await logEvent("user.deleted", {
    // A deleted actor can't be named, so the username travels in `data`.
    actorId: self ? (anonymized ? userId : null) : actorId,
    subjectUserId: anonymized && !self ? userId : null,
    data: { username: user.username, self, anonymized },
  });

  // Snapshot taken before the row changed: revoke needs the Discord ID.
  const person: Person = {
    id: userId,
    label: user.username ?? userId,
    discordUsername: user.discordUsername,
    discordUserId: user.discordUserId,
  };
  if (person.discordUserId) {
    syncInBackground("account deleted", () => removeLeagueRoles(person));
  }
  return { anonymized };
}
