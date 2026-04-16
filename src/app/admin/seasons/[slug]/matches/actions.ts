"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { generateSchedule, seedPlayoffs } from "@/lib/schedule";

export async function generateMatchSchedule(slug: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  const created = await generateSchedule(season.id);
  if (created === 0) {
    redirect(`/admin/seasons/${slug}/matches?error=already-generated`);
  }

  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=${created}`);
}

export async function seedPlayoffsAction(slug: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  const created = await seedPlayoffs(season.id);
  if (created === 0) {
    redirect(`/admin/seasons/${slug}/matches?error=playoffs-already-seeded`);
  }

  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath(`/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=seeded`);
}
