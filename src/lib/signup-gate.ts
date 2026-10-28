import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import type { Game } from "@/db/schema/seasons";
import { discordConfig, getMember, searchMembers } from "@/lib/discord-api";
import { pickExactMember } from "@/lib/discord-plan";
import { describe, isTestSeason } from "@/lib/discord-roles";
import { hasRiotLink } from "@/lib/riot-links";

export type SignupRequirements = {
  /** No Discord username on their profile. */
  discord: boolean;
  /** LoL only: no linked Riot account. */
  riot: boolean;
  /** Has a Discord username, but nobody by that name is in the league server. */
  server: boolean;
};

/**
 * What a user still has to do before a new season signup: a Discord username
 * on /profile (every game), membership in the Spicy League Discord server,
 * and, for LoL, a linked Riot account. Checked by the signup page (shows a
 * notice instead of the form) and again by `submitSignup`. Existing signups
 * are never revisited.
 */
export async function missingSignupRequirements(
  userId: string,
  season: { slug: string; game: Game },
): Promise<SignupRequirements> {
  const [user, riot] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { discordUsername: true, discordUserId: true },
    }),
    season.game === "lol" ? hasRiotLink(userId) : Promise.resolve(true),
  ]);
  const discordUsername = user?.discordUsername ?? null;
  const inServer =
    discordUsername && !isTestSeason(season.slug)
      ? await isInDiscordServer(userId, discordUsername, user?.discordUserId ?? null)
      : true;
  return { discord: !discordUsername, riot: !riot, server: !inServer };
}

/**
 * Whether the user is in the league Discord server: by their matched ID, else
 * an exact username search (saving the ID it finds, like the role sync).
 * Fails open: without the bot configured, or if Discord errors, signups
 * aren't blocked.
 */
async function isInDiscordServer(
  userId: string,
  discordUsername: string,
  discordUserId: string | null,
): Promise<boolean> {
  const cfg = discordConfig();
  if (!cfg) return true;
  try {
    if (discordUserId) {
      if (await getMember(cfg, discordUserId)) return true;
      // Left the server (or a wrong ID): forget it and look them up by name.
      await db.update(users).set({ discordUserId: null }).where(eq(users.id, userId));
    }
    const member = pickExactMember(await searchMembers(cfg, discordUsername), discordUsername);
    if (!member) return false;
    // One ID per account (users.discordUserId isn't unique in the DB).
    const taken = await db.query.users.findFirst({
      where: and(eq(users.discordUserId, member.user.id), ne(users.id, userId)),
      columns: { id: true },
    });
    if (!taken) {
      await db.update(users).set({ discordUserId: member.user.id }).where(eq(users.id, userId));
    }
    return true;
  } catch (err) {
    console.error(`[discord] signup gate: ${describe(err)}`);
    return true;
  }
}
