"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { signOut } from "@/auth";
import { db } from "@/db/client";
import { accountLinks } from "@/db/schema/stats";
import { deleteAccount, deletionBlocker } from "@/lib/account-deletion";
import { addRiotLink, removeRiotLink } from "@/lib/account-edits";
import { requireOnboarded } from "@/lib/auth-helpers";
import { logEvent } from "@/lib/events";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { refreshRiotStats } from "@/lib/stat-refresh";

/**
 * The link forms use useActionState: validation failures come back as
 * `{ error }` so the form can show them inline and keep what was typed
 * (a redirect to ?error= would wipe the input). Success still redirects.
 */
export type LinkFormState = { error?: string };

// ── Riot linking ───────────────────────────────────────────────────────────

export async function linkRiotAccount(
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const session = await requireOnboarded();
  const error = await addRiotLink(
    session.user.id,
    formData.get("riotId") as string | null,
    session.user.id,
  );
  if (error) return { error };

  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}

export async function unlinkRiotAccount(formData: FormData) {
  const session = await requireOnboarded();
  const linkId = (formData.get("linkId") as string | null)?.trim() ?? "";
  if (!linkId) redirect("/profile");

  await removeRiotLink(session.user.id, linkId, session.user.id);

  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}

// ── CS2 linking ────────────────────────────────────────────────────────────

export async function linkCs2Account(
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const session = await requireOnboarded();
  const steamId = (formData.get("steamId") as string | null)?.trim() ?? "";
  const leetifyUrl = (formData.get("leetifyUrl") as string | null)?.trim() ?? "";

  if (!steamId) return { error: "Steam ID is required." };

  if (!/^7656\d{13}$/.test(steamId)) {
    return { error: "Enter a valid Steam64 ID (17-digit number starting with 7656)." };
  }

  if (leetifyUrl) {
    let host: string | null = null;
    try {
      host = new URL(leetifyUrl).hostname.toLowerCase();
    } catch {
      return { error: "Enter a valid Leetify URL." };
    }
    if (host !== "leetify.com" && !host.endsWith(".leetify.com")) {
      return { error: "The Leetify link must point to leetify.com." };
    }
  }

  const existingSteam = await db.query.accountLinks.findFirst({
    where: and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "steam")),
  });
  if (existingSteam) {
    await db
      .update(accountLinks)
      .set({ externalId: steamId, linkedAt: new Date() })
      .where(eq(accountLinks.id, existingSteam.id));
  } else {
    await db.insert(accountLinks).values({
      userId: session.user.id,
      provider: "steam",
      externalId: steamId,
    });
  }

  if (leetifyUrl) {
    const existingLeetify = await db.query.accountLinks.findFirst({
      where: and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "leetify")),
    });
    if (existingLeetify) {
      await db
        .update(accountLinks)
        .set({ externalId: leetifyUrl, externalHandle: leetifyUrl, linkedAt: new Date() })
        .where(eq(accountLinks.id, existingLeetify.id));
    } else {
      await db.insert(accountLinks).values({
        userId: session.user.id,
        provider: "leetify",
        externalId: leetifyUrl,
        externalHandle: leetifyUrl,
      });
    }
  }
  await logEvent("cs2.linked", { actorId: session.user.id, data: { steamId } });

  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}

export async function unlinkCs2Account() {
  const session = await requireOnboarded();
  await db
    .delete(accountLinks)
    .where(and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "steam")));
  await db
    .delete(accountLinks)
    .where(and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "leetify")));
  await logEvent("cs2.unlinked", { actorId: session.user.id });
  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}

// ── Account deletion ───────────────────────────────────────────────────────

export async function deleteOwnAccount(
  _prev: LinkFormState,
  formData: FormData,
): Promise<LinkFormState> {
  const session = await requireOnboarded();
  const typed = (formData.get("confirm") as string | null)?.trim().toLowerCase() ?? "";
  if (typed !== session.user.username) {
    return { error: "Type your username exactly to confirm." };
  }
  const blocker = await deletionBlocker(session.user.id);
  if (blocker) return { error: blocker };

  // Sign out first so this response clears the session cookies; otherwise
  // the 5-minute cookie cache would keep showing them as signed in.
  await signOut();
  const result = await deleteAccount(session.user.id, session.user.id);
  if ("error" in result) return result;
  redirect("/?account-deleted=1");
}

// ── Manual stat refresh ────────────────────────────────────────────────────

export async function manualRefreshStats() {
  const session = await requireOnboarded();

  const rl = await checkRateLimit(rateLimits.statRefresh, session.user.id);
  if (!rl.success) {
    redirect("/profile?error=refresh-rate-limited");
  }

  await refreshRiotStats(session.user.id);

  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}
