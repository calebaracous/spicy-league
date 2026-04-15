"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { accountLinks } from "@/db/schema/stats";
import { requireOnboarded } from "@/lib/auth-helpers";
import { checkRateLimit, rateLimits } from "@/lib/rate-limit";
import { getAccountByRiotId } from "@/lib/riot-api";
import { refreshRiotStats } from "@/lib/stat-refresh";

// ── Riot linking ───────────────────────────────────────────────────────────

export async function linkRiotAccount(formData: FormData) {
  const session = await requireOnboarded();
  const raw = (formData.get("riotId") as string | null)?.trim() ?? "";

  const parts = raw.split("#");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    redirect("/profile?error=riot-format");
  }
  const [gameName, tagLine] = parts;

  const account = await getAccountByRiotId(gameName, tagLine);
  if (!account) {
    redirect("/profile?error=riot-not-found");
  }

  // Upsert the link
  const existing = await db.query.accountLinks.findFirst({
    where: and(
      eq(accountLinks.userId, session.user.id),
      eq(accountLinks.provider, "riot"),
    ),
  });

  if (existing) {
    await db
      .update(accountLinks)
      .set({
        externalId: account.puuid,
        externalHandle: `${account.gameName}#${account.tagLine}`,
        linkedAt: new Date(),
      })
      .where(eq(accountLinks.id, existing.id));
  } else {
    await db.insert(accountLinks).values({
      userId: session.user.id,
      provider: "riot",
      externalId: account.puuid,
      externalHandle: `${account.gameName}#${account.tagLine}`,
    });
  }

  // Fetch stats immediately after linking
  await refreshRiotStats(session.user.id);

  revalidatePath("/profile");
  revalidatePath(`/u/${session.user.displayName}`);
  redirect("/profile?saved=1");
}

export async function unlinkRiotAccount() {
  const session = await requireOnboarded();
  await db
    .delete(accountLinks)
    .where(
      and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "riot")),
    );
  revalidatePath("/profile");
  revalidatePath(`/u/${session.user.displayName}`);
  redirect("/profile?saved=1");
}

// ── CS2 linking ────────────────────────────────────────────────────────────

export async function linkCs2Account(formData: FormData) {
  const session = await requireOnboarded();
  const steamId = (formData.get("steamId") as string | null)?.trim() ?? "";
  const leetifyUrl = (formData.get("leetifyUrl") as string | null)?.trim() ?? "";

  if (!steamId) {
    redirect("/profile?error=steam-required");
  }

  // Basic Steam64 ID validation (17 digit number starting with 7656)
  if (!/^7656\d{13}$/.test(steamId)) {
    redirect("/profile?error=steam-format");
  }

  if (leetifyUrl) {
    try {
      const url = new URL(leetifyUrl);
      if (!url.hostname.includes("leetify.com")) {
        redirect("/profile?error=leetify-host");
      }
    } catch {
      redirect("/profile?error=leetify-url");
    }
  }

  // Upsert Steam link
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

  // Upsert Leetify link
  if (leetifyUrl) {
    const existingLeetify = await db.query.accountLinks.findFirst({
      where: and(
        eq(accountLinks.userId, session.user.id),
        eq(accountLinks.provider, "leetify"),
      ),
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

  revalidatePath("/profile");
  revalidatePath(`/u/${session.user.displayName}`);
  redirect("/profile?saved=1");
}

export async function unlinkCs2Account() {
  const session = await requireOnboarded();
  await db
    .delete(accountLinks)
    .where(
      and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "steam")),
    );
  await db
    .delete(accountLinks)
    .where(
      and(eq(accountLinks.userId, session.user.id), eq(accountLinks.provider, "leetify")),
    );
  revalidatePath("/profile");
  revalidatePath(`/u/${session.user.displayName}`);
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
  revalidatePath(`/u/${session.user.displayName}`);
  redirect("/profile?saved=1");
}
