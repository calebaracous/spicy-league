"use server";

import { and, asc, desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { draftPicks, drafts } from "@/db/schema/drafts";
import { seasonCaptains, seasonSignups, seasons } from "@/db/schema/seasons";
import { requireAdmin, requireOnboarded } from "@/lib/auth-helpers";
import { captainOrderForPick, finalizeDraft, totalPicks as totalPicksFor } from "@/lib/draft";

async function getSeasonOrFail(slug: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");
  return season;
}

export async function startDraft(slug: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);

  const captainCount = await db
    .select({ id: seasonCaptains.id })
    .from(seasonCaptains)
    .where(eq(seasonCaptains.seasonId, season.id));
  if (captainCount.length < 2) {
    redirect(`/admin/seasons/${slug}/draft?error=need-captains`);
  }

  const existing = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (existing) {
    if (existing.state === "completed") {
      redirect(`/admin/seasons/${slug}/draft?error=already-complete`);
    }
    await db
      .update(drafts)
      .set({ state: "in_progress", startedAt: existing.startedAt ?? new Date() })
      .where(eq(drafts.id, existing.id));
  } else {
    await db.insert(drafts).values({
      seasonId: season.id,
      state: "in_progress",
      startedAt: new Date(),
    });
  }

  if (season.state !== "drafting") {
    await db
      .update(seasons)
      .set({ state: "drafting", updatedAt: new Date() })
      .where(eq(seasons.id, season.id));
  }

  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}/draft?saved=1`);
}

export async function pauseDraft(slug: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);
  await db
    .update(drafts)
    .set({ state: "paused" })
    .where(and(eq(drafts.seasonId, season.id), eq(drafts.state, "in_progress")));

  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}/draft`);
  redirect(`/admin/seasons/${slug}/draft?saved=1`);
}

export async function resumeDraft(slug: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);
  await db
    .update(drafts)
    .set({ state: "in_progress" })
    .where(and(eq(drafts.seasonId, season.id), eq(drafts.state, "paused")));

  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}/draft`);
  redirect(`/admin/seasons/${slug}/draft?saved=1`);
}

export async function undoLastPick(slug: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);
  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (!draft) redirect(`/admin/seasons/${slug}/draft?error=no-draft`);

  const last = await db
    .select()
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draft.id))
    .orderBy(desc(draftPicks.pickNumber))
    .limit(1);
  if (last.length === 0) {
    redirect(`/admin/seasons/${slug}/draft?error=no-picks`);
  }

  await db.delete(draftPicks).where(eq(draftPicks.id, last[0].id));

  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}/draft`);
  redirect(`/admin/seasons/${slug}/draft?saved=1`);
}

export async function submitPick(slug: string, pickedUserId: string) {
  const session = await requireOnboarded();
  const season = await getSeasonOrFail(slug);

  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (!draft) redirect(`/seasons/${slug}/draft?error=no-draft`);
  if (draft.state !== "in_progress") {
    redirect(`/seasons/${slug}/draft?error=not-running`);
  }

  const captains = await db
    .select({ userId: seasonCaptains.userId, captainOrder: seasonCaptains.captainOrder })
    .from(seasonCaptains)
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder));

  const captainCount = captains.length;
  const total = totalPicksFor(captainCount);

  const existingPicks = await db
    .select({ pickedUserId: draftPicks.pickedUserId, pickNumber: draftPicks.pickNumber })
    .from(draftPicks)
    .where(eq(draftPicks.draftId, draft.id));

  if (existingPicks.length >= total) {
    redirect(`/seasons/${slug}/draft?error=draft-complete`);
  }

  const nextPickNumber = existingPicks.length + 1;
  const order = captainOrderForPick(nextPickNumber, captainCount);
  const onClockCaptain = captains.find((c) => c.captainOrder === order);
  if (!onClockCaptain) {
    redirect(`/seasons/${slug}/draft?error=internal`);
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin && session.user.id !== onClockCaptain.userId) {
    redirect(`/seasons/${slug}/draft?error=not-your-turn`);
  }

  const captainIds = new Set(captains.map((c) => c.userId));
  if (captainIds.has(pickedUserId)) {
    redirect(`/seasons/${slug}/draft?error=cant-pick-captain`);
  }

  const pickedIds = new Set(existingPicks.map((p) => p.pickedUserId));
  if (pickedIds.has(pickedUserId)) {
    redirect(`/seasons/${slug}/draft?error=already-picked`);
  }

  const inSignups = await db.query.seasonSignups.findFirst({
    where: and(eq(seasonSignups.seasonId, season.id), eq(seasonSignups.userId, pickedUserId)),
  });
  if (!inSignups) {
    redirect(`/seasons/${slug}/draft?error=not-in-pool`);
  }

  await db.insert(draftPicks).values({
    draftId: draft.id,
    pickNumber: nextPickNumber,
    captainUserId: onClockCaptain.userId,
    pickedUserId,
  });

  if (nextPickNumber === total) {
    await finalizeDraft(draft.id);
  }

  revalidatePath(`/seasons/${slug}/draft`);
  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/seasons/${slug}/draft`);
}
