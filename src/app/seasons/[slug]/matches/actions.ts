"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireOnboarded } from "@/lib/auth-helpers";
import { getTeamForCaptain } from "@/lib/schedule";

async function getSeasonOrFail(slug: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/seasons");
  return season;
}

export async function reportMatch(slug: string, matchId: string, formData: FormData) {
  const session = await requireOnboarded();
  const season = await getSeasonOrFail(slug);

  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) redirect(`/seasons/${slug}/matches?error=not-found`);
  if (match.state === "confirmed") {
    redirect(`/seasons/${slug}/matches/${matchId}?error=already-confirmed`);
  }

  const isAdmin = session.user.role === "admin";
  if (!isAdmin) {
    const team = await getTeamForCaptain(season.id, session.user.id);
    if (!team) redirect(`/seasons/${slug}/matches/${matchId}?error=not-on-team`);
    if (team.id !== match.homeTeamId && team.id !== match.awayTeamId) {
      redirect(`/seasons/${slug}/matches/${matchId}?error=not-your-match`);
    }
  }

  const winnerTeamId = formData.get("winnerTeamId")?.toString() ?? "";
  if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
    redirect(`/seasons/${slug}/matches/${matchId}?error=invalid-winner`);
  }

  const homeScore = parseInt(formData.get("homeScore")?.toString() ?? "0", 10) || null;
  const awayScore = parseInt(formData.get("awayScore")?.toString() ?? "0", 10) || null;

  await db
    .update(matches)
    .set({
      winnerTeamId,
      homeScore,
      awayScore,
      state: "reported",
      reportedBy: session.user.id,
      reportedAt: new Date(),
    })
    .where(eq(matches.id, matchId));

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/seasons/${slug}/matches/${matchId}?saved=1`);
}

export async function confirmMatch(slug: string, matchId: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);

  // Fetch match before update so we know its stage
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) redirect(`/admin/seasons/${slug}/matches?error=not-found`);

  await db
    .update(matches)
    .set({ state: "confirmed", confirmedAt: new Date() })
    .where(eq(matches.id, matchId));

  if (match.stage === "semis") {
    // Check if both semis are now confirmed — if so, create the final
    const allSemis = await db
      .select()
      .from(matches)
      .where(and(eq(matches.seasonId, season.id), eq(matches.stage, "semis")));

    const bothConfirmed =
      allSemis.length === 2 && allSemis.every((m) => m.state === "confirmed" && m.winnerTeamId);

    if (bothConfirmed) {
      const existingFinal = await db.query.matches.findFirst({
        where: and(eq(matches.seasonId, season.id), eq(matches.stage, "final")),
      });
      if (!existingFinal) {
        const [s1, s2] = allSemis;
        await db.insert(matches).values({
          seasonId: season.id,
          round: 201,
          stage: "final",
          homeTeamId: s1.winnerTeamId!,
          awayTeamId: s2.winnerTeamId!,
        });
      }
    }
  } else if (match.stage === "final") {
    // Final confirmed → season is complete
    await db.update(seasons).set({ state: "complete" }).where(eq(seasons.id, season.id));
    revalidatePath(`/seasons/${slug}`);
  }

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=1`);
}

export async function disputeMatch(slug: string, matchId: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);

  await db
    .update(matches)
    .set({ state: "disputed", winnerTeamId: null, homeScore: null, awayScore: null })
    .where(and(eq(matches.id, matchId), eq(matches.seasonId, season.id)));

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=1`);
}

export async function resetMatch(slug: string, matchId: string) {
  await requireAdmin();
  const season = await getSeasonOrFail(slug);

  await db
    .update(matches)
    .set({
      state: "scheduled",
      winnerTeamId: null,
      homeScore: null,
      awayScore: null,
      reportedBy: null,
      reportedAt: null,
      confirmedAt: null,
    })
    .where(and(eq(matches.id, matchId), eq(matches.seasonId, season.id)));

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=1`);
}
