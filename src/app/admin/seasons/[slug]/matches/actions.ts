"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { matches } from "@/db/schema/matches";
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
  redirect(`/admin/seasons/${slug}/matches?saved=generated-${created}`);
}

export async function seedPlayoffsAction(slug: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  // Standings must be final: every group match confirmed.
  const pending = await db.query.matches.findFirst({
    where: and(
      eq(matches.seasonId, season.id),
      eq(matches.stage, "group"),
      ne(matches.state, "confirmed"),
    ),
  });
  if (pending) redirect(`/admin/seasons/${slug}/matches?error=group-unfinished`);

  const created = await seedPlayoffs(season.id);
  if (created === 0) {
    redirect(`/admin/seasons/${slug}/matches?error=playoffs-already-seeded`);
  }

  // Seeding from the group stage moves the season on, so admins don't have to
  // flip the state first (the card used to be hidden until they did).
  if (season.state === "group_stage") {
    await db
      .update(seasons)
      .set({ state: "playoffs", updatedAt: new Date() })
      .where(eq(seasons.id, season.id));
    revalidatePath(`/seasons/${slug}`);
    revalidatePath(`/admin/seasons/${slug}`);
    revalidatePath("/");
  }

  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath(`/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=seeded`);
}
