"use server";

import { and, count, eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups, seasonCaptains } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";

export async function promoteCaptain(slug: string, signupId: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) redirect("/admin?error=not-found");

  const signup = await db.query.seasonSignups.findFirst({
    where: and(eq(seasonSignups.id, signupId), eq(seasonSignups.seasonId, season.id)),
  });
  if (!signup) redirect(`/admin/seasons/${slug}/signups?error=not-found`);

  const existing = await db.query.seasonCaptains.findFirst({
    where: and(eq(seasonCaptains.seasonId, season.id), eq(seasonCaptains.userId, signup.userId)),
  });
  if (existing) redirect(`/admin/seasons/${slug}/signups?error=already-captain`);

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(seasonCaptains.captainOrder) })
    .from(seasonCaptains)
    .where(eq(seasonCaptains.seasonId, season.id));

  await db.insert(seasonCaptains).values({
    seasonId: season.id,
    userId: signup.userId,
    captainOrder: (maxOrder ?? 0) + 1,
  });

  revalidatePath(`/admin/seasons/${slug}/signups`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

export async function demoteCaptain(slug: string, captainId: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) redirect("/admin?error=not-found");

  await db
    .delete(seasonCaptains)
    .where(and(eq(seasonCaptains.id, captainId), eq(seasonCaptains.seasonId, season.id)));

  // Re-number remaining captains in order
  const remaining = await db.query.seasonCaptains.findMany({
    where: eq(seasonCaptains.seasonId, season.id),
    orderBy: (t, { asc }) => [asc(t.captainOrder)],
  });

  for (let i = 0; i < remaining.length; i++) {
    await db
      .update(seasonCaptains)
      .set({ captainOrder: i + 1 })
      .where(eq(seasonCaptains.id, remaining[i].id));
  }

  revalidatePath(`/admin/seasons/${slug}/signups`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

export async function moveCaptain(slug: string, captainId: string, direction: "up" | "down") {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) redirect("/admin?error=not-found");

  const ordered = await db.query.seasonCaptains.findMany({
    where: eq(seasonCaptains.seasonId, season.id),
    orderBy: (t, { asc }) => [asc(t.captainOrder)],
  });

  const idx = ordered.findIndex((c) => c.id === captainId);
  if (idx === -1) redirect(`/admin/seasons/${slug}/signups?error=not-found`);

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= ordered.length) {
    redirect(`/admin/seasons/${slug}/signups?saved=1`);
  }

  const a = ordered[idx];
  const b = ordered[swapWith];

  // Two-step swap to avoid unique-constraint collisions if one is added
  await db.update(seasonCaptains).set({ captainOrder: -1 }).where(eq(seasonCaptains.id, a.id));
  await db
    .update(seasonCaptains)
    .set({ captainOrder: a.captainOrder })
    .where(eq(seasonCaptains.id, b.id));
  await db
    .update(seasonCaptains)
    .set({ captainOrder: b.captainOrder })
    .where(eq(seasonCaptains.id, a.id));

  revalidatePath(`/admin/seasons/${slug}/signups`);
  revalidatePath(`/seasons/${slug}/captains`);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

export async function getSignupStats(seasonId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(seasonSignups)
    .where(eq(seasonSignups.seasonId, seasonId));
  return { total, recommendedCaptains: Math.floor(total / 5) };
}
