"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { LinkFormState } from "@/app/profile/account-actions";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import {
  addRiotLink,
  removeRiotLink,
  setDiscordUserId,
  setDiscordUsername,
} from "@/lib/account-edits";
import { requireAdmin } from "@/lib/auth-helpers";
import { refreshRiotStats } from "@/lib/stat-refresh";

/**
 * Admin tools on a player's public page: fix their Discord username / matched
 * ID and Riot links. Same rules as the player's own /profile forms
 * (src/lib/account-edits.ts); the events name the admin as actor.
 */

async function target(formData: FormData) {
  const session = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const user = userId
    ? await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, username: true },
      })
    : null;
  if (!user?.username) redirect("/admin/users");
  return { adminId: session.user.id, userId: user.id, path: `/users/${user.username}` };
}

function done(path: string): never {
  revalidatePath(path);
  redirect(`${path}?saved=1`);
}

export async function adminSaveDiscordUsername(formData: FormData) {
  const { adminId, userId, path } = await target(formData);
  const error = await setDiscordUsername(
    userId,
    formData.get("discordUsername")?.toString(),
    adminId,
  );
  if (error) redirect(`${path}?error=discord-${error}`);
  done(path);
}

export async function adminSaveDiscordUserId(formData: FormData) {
  const { adminId, userId, path } = await target(formData);
  const error = await setDiscordUserId(userId, formData.get("discordUserId")?.toString(), adminId);
  if (error) redirect(`${path}?error=discord-id-${error}`);
  done(path);
}

export async function adminLinkRiot(
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const { adminId, userId, path } = await target(formData);
  const error = await addRiotLink(userId, formData.get("riotId") as string | null, adminId);
  if (error) return { error };
  done(path);
}

export async function adminUnlinkRiot(formData: FormData) {
  const { adminId, userId, path } = await target(formData);
  const linkId = String(formData.get("linkId") ?? "");
  if (linkId) await removeRiotLink(userId, linkId, adminId);
  done(path);
}

// No rate limit: the player's own refresh is limited to once an hour.
export async function adminRefreshStats(formData: FormData) {
  const { userId, path } = await target(formData);
  await refreshRiotStats(userId);
  done(path);
}
