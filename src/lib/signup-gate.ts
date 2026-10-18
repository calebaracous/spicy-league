import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import type { Game } from "@/db/schema/seasons";
import { hasRiotLink } from "@/lib/riot-links";

/**
 * What a user still has to add on /profile before a new season signup: a
 * Discord username (every game) and, for LoL, a linked Riot account. Checked
 * by the signup page (shows a notice instead of the form) and again by
 * `submitSignup`. Existing signups are never revisited.
 */
export async function missingSignupRequirements(
  userId: string,
  game: Game,
): Promise<{ discord: boolean; riot: boolean }> {
  const [user, riot] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { discordUsername: true },
    }),
    game === "lol" ? hasRiotLink(userId) : Promise.resolve(true),
  ]);
  return { discord: !user?.discordUsername, riot: !riot };
}
