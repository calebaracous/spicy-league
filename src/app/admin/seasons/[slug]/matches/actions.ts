"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { ensureMatchThreads, postTeamSchedules } from "@/lib/discord-notify";
import { mergeReports, syncInBackground } from "@/lib/discord-roles";
import { createTiebreakers, generateSchedule, seedPlayoffs } from "@/lib/schedule";

export async function generateMatchSchedule(slug: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  const created = await generateSchedule(season.id);
  if (created === 0) {
    redirect(`/admin/seasons/${slug}/matches?error=already-generated`);
  }

  // Discord: a thread per match, then each team's fixtures (linking the threads).
  syncInBackground(`${slug} schedule`, async () =>
    mergeReports(await ensureMatchThreads(season.id), await postTeamSchedules(season.id)),
  );

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
  if (created === "needs-tiebreaker") {
    redirect(`/admin/seasons/${slug}/matches?error=needs-tiebreaker`);
  }
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

  syncInBackground(`${slug} semifinal threads`, () => ensureMatchThreads(season.id));

  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath(`/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=seeded`);
}

export async function createTiebreakersAction(slug: string) {
  await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  // Ties are only final once every group match is confirmed, and a new round
  // only makes sense once the previous round of tiebreakers is settled.
  const pending = await db.query.matches.findFirst({
    where: and(
      eq(matches.seasonId, season.id),
      inArray(matches.stage, ["group", "tiebreaker"]),
      ne(matches.state, "confirmed"),
    ),
  });
  if (pending) {
    redirect(
      `/admin/seasons/${slug}/matches?error=${
        pending.stage === "group" ? "group-unfinished" : "tiebreaker-pending"
      }`,
    );
  }

  const created = await createTiebreakers(season.id);
  if (created === 0) redirect(`/admin/seasons/${slug}/matches?error=no-tiebreaker-needed`);

  syncInBackground(`${slug} tiebreaker threads`, () => ensureMatchThreads(season.id));

  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath(`/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=tiebreakers-${created}`);
}
