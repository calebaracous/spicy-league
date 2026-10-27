import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { MAX_RIOT_ACCOUNTS } from "@/app/profile/constants";
import { normalizeDiscordUserId, normalizeDiscordUsername } from "@/lib/discord";
import { logEvent } from "@/lib/events";
import { getAccountByRiotId } from "@/lib/riot-api";
import { parseRiotId } from "@/lib/riot-id";
import { refreshRiotStats } from "@/lib/stat-refresh";

/**
 * Discord and Riot account edits for one user, shared by the player's own
 * /profile actions and the admin tools on /users/[username]. Callers do the
 * auth check; `actorId` is who made the change. When it isn't `userId` (an
 * admin editing someone else) the event names the player as its subject.
 */

function eventPeople(userId: string, actorId: string) {
  return { actorId, subjectUserId: actorId === userId ? null : userId };
}

export type DiscordEditError = "invalid" | "taken";

/** Required for season signups, so it can be changed but not cleared. */
export async function setDiscordUsername(
  userId: string,
  raw: string | null | undefined,
  actorId: string,
): Promise<DiscordEditError | null> {
  const discordUsername = normalizeDiscordUsername(raw);
  if (!discordUsername) return "invalid";

  const taken = await db.query.users.findFirst({
    where: and(eq(users.discordUsername, discordUsername), ne(users.id, userId)),
    columns: { id: true },
  });
  if (taken) return "taken";

  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { discordUsername: true },
  });
  if (current?.discordUsername === discordUsername) return null;

  // A different username may be a different Discord account: forget the
  // resolved ID so the next role sync searches again.
  await db
    .update(users)
    .set({ discordUsername, discordUserId: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
  await logEvent("profile.discord_updated", {
    ...eventPeople(userId, actorId),
    data: { changes: { discordUsername: [current?.discordUsername ?? null, discordUsername] } },
  });
  return null;
}

/**
 * Admin override for the matched Discord ID, for when the username search
 * can't find the player. Empty clears it, so the next sync searches again.
 */
export async function setDiscordUserId(
  userId: string,
  raw: string | null | undefined,
  actorId: string,
): Promise<DiscordEditError | null> {
  const blank = !(raw ?? "").trim();
  const discordUserId = blank ? null : normalizeDiscordUserId(raw);
  if (!blank && !discordUserId) return "invalid";

  if (discordUserId) {
    // Not unique in the DB, but two accounts on one Discord user would get
    // each other's roles.
    const taken = await db.query.users.findFirst({
      where: and(eq(users.discordUserId, discordUserId), ne(users.id, userId)),
      columns: { id: true },
    });
    if (taken) return "taken";
  }

  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { discordUserId: true },
  });
  if ((current?.discordUserId ?? null) === discordUserId) return null;

  await db.update(users).set({ discordUserId, updatedAt: new Date() }).where(eq(users.id, userId));
  await logEvent("profile.discord_updated", {
    ...eventPeople(userId, actorId),
    data: { changes: { discordUserId: [current?.discordUserId ?? null, discordUserId] } },
  });
  return null;
}

/** Looks the Riot ID up, links it and loads its stats. Returns an error message or null. */
export async function addRiotLink(
  userId: string,
  raw: string | null | undefined,
  actorId: string,
): Promise<string | null> {
  const riotId = parseRiotId(raw);
  if (!riotId) return "Enter the Riot ID as GameName#TAG.";

  const account = await getAccountByRiotId(riotId.gameName, riotId.tagLine);
  if (!account) {
    return "That Riot ID wasn't found. Double-check the game name and tag.";
  }

  const existingLinks = await db.query.accountLinks.findMany({
    where: and(eq(accountLinks.userId, userId), eq(accountLinks.provider, "riot")),
  });
  if (existingLinks.some((l) => l.externalId === account.puuid)) {
    return "That Riot account is already linked to this profile.";
  }
  if (existingLinks.length >= MAX_RIOT_ACCOUNTS) {
    return `A profile can have up to ${MAX_RIOT_ACCOUNTS} Riot accounts.`;
  }

  const handle = `${account.gameName}#${account.tagLine}`;
  const [inserted] = await db
    .insert(accountLinks)
    .values({ userId, provider: "riot", externalId: account.puuid, externalHandle: handle })
    .returning({ id: accountLinks.id });

  if (inserted) {
    await logEvent("riot.linked", { ...eventPeople(userId, actorId), data: { riotId: handle } });
    await refreshRiotStats(userId);
  }
  return null;
}

export async function removeRiotLink(userId: string, linkId: string, actorId: string) {
  // Snapshots cascade-delete via FK; the userId filter confirms the link
  // belongs to this user.
  const [removed] = await db
    .delete(accountLinks)
    .where(and(eq(accountLinks.id, linkId), eq(accountLinks.userId, userId)))
    .returning({ handle: accountLinks.externalHandle });
  if (removed) {
    await logEvent("riot.unlinked", {
      ...eventPeople(userId, actorId),
      data: { riotId: removed.handle },
    });
  }

  // Defensive: clean up any orphan snapshots (shouldn't exist after cascade).
  await db
    .delete(riotStatSnapshots)
    .where(and(eq(riotStatSnapshots.userId, userId), eq(riotStatSnapshots.accountLinkId, linkId)));
}
