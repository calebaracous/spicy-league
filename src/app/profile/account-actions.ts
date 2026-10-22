"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { requireOnboarded } from "@/lib/auth-helpers";
import { logEvent } from "@/lib/events";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getAccountByRiotId } from "@/lib/riot-api";
import { refreshRiotStats } from "@/lib/stat-refresh";
import { MAX_RIOT_ACCOUNTS } from "./constants";

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
  const raw = (formData.get("riotId") as string | null)?.trim() ?? "";

  const parts = raw.split("#");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { error: "Enter your Riot ID as GameName#TAG." };
  }
  const [gameName, tagLine] = parts;

  const account = await getAccountByRiotId(gameName, tagLine);
  if (!account) {
    return { error: "That Riot ID wasn't found. Double-check your game name and tag." };
  }

  const existingLinks = await db.query.accountLinks.findMany({
    where: and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "riot")),
  });

  if (existingLinks.some((l) => l.externalId === account.puuid)) {
    return { error: "That Riot account is already linked to your profile." };
  }
  if (existingLinks.length >= MAX_RIOT_ACCOUNTS) {
    return { error: `You can link up to ${MAX_RIOT_ACCOUNTS} Riot accounts.` };
  }

  const [inserted] = await db
    .insert(accountLinks)
    .values({
      userId: session.user.id,
      provider: "riot",
      externalId: account.puuid,
      externalHandle: `${account.gameName}#${account.tagLine}`,
    })
    .returning({ id: accountLinks.id });

  if (inserted) {
    await logEvent("riot.linked", {
      actorId: session.user.id,
      data: { riotId: `${account.gameName}#${account.tagLine}` },
    });
    await refreshRiotStats(session.user.id);
  }

  revalidatePath("/profile");
  revalidatePath(`/users/${session.user.username}`);
  redirect("/profile?saved=1");
}

export async function unlinkRiotAccount(formData: FormData) {
  const session = await requireOnboarded();
  const linkId = (formData.get("linkId") as string | null)?.trim() ?? "";
  if (!linkId) redirect("/profile");

  // Snapshots cascade-delete via FK; this also confirms the link belongs to
  // the requesting user.
  const [removed] = await db
    .delete(accountLinks)
    .where(and(eq(accountLinks.id, linkId), eq(accountLinks.userId, session.user.id)))
    .returning({ handle: accountLinks.externalHandle });
  if (removed) {
    await logEvent("riot.unlinked", { actorId: session.user.id, data: { riotId: removed.handle } });
  }

  // Defensive: clean up any orphan snapshots (shouldn't exist after cascade).
  await db
    .delete(riotStatSnapshots)
    .where(
      and(
        eq(riotStatSnapshots.userId, session.user.id),
        eq(riotStatSnapshots.accountLinkId, linkId),
      ),
    );

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
