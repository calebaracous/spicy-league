"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { seasons } from "@/db/schema/seasons";
import { requireOnboarded } from "@/lib/auth-helpers";
import { renameTeamInDiscord, syncInBackground } from "@/lib/discord-roles";
import { logEvent } from "@/lib/events";
import { getCaptainedTeamId } from "@/lib/schedule";
import { normalizeTeamName } from "@/lib/team-name";

/**
 * A team's captain (either of a duo) renames it, until the season completes;
 * admins can rename any team at any time. Names are unique per season
 * (case-insensitive). The Discord role and channels follow in the background.
 */
export async function renameTeam(slug: string, teamId: string, formData: FormData) {
  const session = await requireOnboarded();
  const back = `/seasons/${slug}/teams`;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/seasons");
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.id, teamId), eq(teams.seasonId, season.id)),
  });
  if (!team) redirect(`${back}?error=not-found`);

  if (session.user.role !== "admin") {
    if (season.state === "complete") redirect(`${back}?error=season-complete`);
    if ((await getCaptainedTeamId(season.id, session.user.id)) !== team.id) {
      redirect(`${back}?error=not-captain`);
    }
  }

  const name = normalizeTeamName(formData.get("name")?.toString());
  if (!name) redirect(`${back}?error=invalid-name`);
  if (name === team.name) redirect(`${back}?saved=renamed`);

  const [clash] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.seasonId, season.id),
        ne(teams.id, team.id),
        sql`lower(${teams.name}) = lower(${name})`,
      ),
    )
    .limit(1);
  if (clash) redirect(`${back}?error=name-taken`);

  await db.update(teams).set({ name }).where(eq(teams.id, team.id));
  await logEvent("team.renamed", {
    actorId: session.user.id,
    seasonId: season.id,
    data: { from: team.name, to: name },
  });
  syncInBackground(`${slug} team rename`, () => renameTeamInDiscord(team.id));

  // Team names show up all over the season and on the home page.
  revalidatePath(`/seasons/${slug}`, "layout");
  revalidatePath("/");
  redirect(`${back}?saved=renamed`);
}
