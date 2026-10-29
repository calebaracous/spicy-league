import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { matches, type Match } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { ensureMatchThreads, notifyMatchEvent } from "@/lib/discord-notify";
import { syncChampionRole } from "@/lib/discord-ping-roles";
import { mergeReports, syncInBackground } from "@/lib/discord-roles";

// What a confirmed result sets in motion (docs/MATCHES.md). Shared by the
// admin Confirm button, match day's automatic confirm when a series ends, and
// the admin Edit result tool, which may change an already-confirmed result.

type SeasonRef = { id: string; slug: string };

/**
 * After `match` is confirmed: both semis confirmed → the final exists (and, if
 * an edit changed a semi's winner while the final is still unplayed, it gets
 * the new team); a confirmed final completes the season and crowns its winner.
 */
export async function applyConfirmEffects(season: SeasonRef, match: Match): Promise<void> {
  if (match.stage === "semis") {
    const semis = await db
      .select()
      .from(matches)
      .where(and(eq(matches.seasonId, season.id), eq(matches.stage, "semis")))
      .orderBy(asc(matches.round));
    const bothConfirmed =
      semis.length === 2 && semis.every((m) => m.state === "confirmed" && m.winnerTeamId);
    if (bothConfirmed) {
      const [s1, s2] = semis;
      const final = await db.query.matches.findFirst({
        where: and(eq(matches.seasonId, season.id), eq(matches.stage, "final")),
      });
      if (!final) {
        await db.insert(matches).values({
          seasonId: season.id,
          round: 201,
          stage: "final",
          homeTeamId: s1.winnerTeamId!,
          awayTeamId: s2.winnerTeamId!,
        });
      } else if (
        final.state === "scheduled" &&
        (final.homeTeamId !== s1.winnerTeamId || final.awayTeamId !== s2.winnerTeamId)
      ) {
        await db
          .update(matches)
          .set({ homeTeamId: s1.winnerTeamId!, awayTeamId: s2.winnerTeamId! })
          .where(eq(matches.id, final.id));
      }
    }
  } else if (match.stage === "final") {
    await db
      .update(seasons)
      .set({ state: "complete", championTeamId: match.winnerTeamId, updatedAt: new Date() })
      .where(eq(seasons.id, season.id));
  }

  // Discord: note it in the thread; a just-created final gets its thread; a
  // confirmed final hands out the Champion role.
  syncInBackground(`${season.slug} result confirmed`, async () => {
    const reports = [await notifyMatchEvent(match.id, "confirmed")];
    if (match.stage === "semis") reports.push(await ensureMatchThreads(season.id));
    if (match.stage === "final") reports.push(await syncChampionRole(season.id));
    return mergeReports(...reports);
  });

  revalidatePath(`/seasons/${season.slug}`);
  revalidatePath(`/seasons/${season.slug}/matches`);
  revalidatePath(`/seasons/${season.slug}/matches/${match.id}`);
  revalidatePath(`/admin/seasons/${season.slug}/matches`);
}

/**
 * Sets a series result and confirms it in one go (match day's automatic
 * confirm, admin Edit result), then runs the confirm effects. Keeps an
 * earlier reporter; otherwise `actorId` becomes it.
 */
export async function confirmWithResult(opts: {
  season: SeasonRef;
  matchId: string;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  actorId: string;
}): Promise<Match> {
  const now = new Date();
  const existing = await db.query.matches.findFirst({ where: eq(matches.id, opts.matchId) });
  if (!existing) throw new Error(`match ${opts.matchId} not found`);
  const [match] = await db
    .update(matches)
    .set({
      winnerTeamId: opts.winnerTeamId,
      homeScore: opts.homeScore,
      awayScore: opts.awayScore,
      state: "confirmed",
      reportedBy: existing.reportedBy ?? opts.actorId,
      reportedAt: existing.reportedAt ?? now,
      confirmedAt: now,
    })
    .where(eq(matches.id, opts.matchId))
    .returning();
  await applyConfirmEffects(opts.season, match);
  return match;
}
