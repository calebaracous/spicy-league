"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireOnboarded } from "@/lib/auth-helpers";
import { BO2_RESULTS, hasResult, type Bo2Result } from "@/lib/match-format";
import { notifyMatchEvent } from "@/lib/discord-notify";
import { syncChampionRole } from "@/lib/discord-ping-roles";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent, matchEventData } from "@/lib/events";
import { applyConfirmEffects, confirmWithResult } from "@/lib/match-results";
import { getTeamForCaptain } from "@/lib/schedule";

async function getSeasonOrFail(slug: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/seasons");
  return season;
}

// Un-confirming the final un-crowns the champion (and takes the Discord
// Champion role back). Season state is left alone; the admin moves it back
// with the generic transition if needed.
async function clearChampionIfFinal(seasonId: string, matchId: string) {
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, seasonId)),
    columns: { stage: true },
  });
  if (match?.stage !== "final") return;
  await db
    .update(seasons)
    .set({ championTeamId: null, updatedAt: new Date() })
    .where(eq(seasons.id, seasonId));
  syncInBackground("champion role", () => syncChampionRole(seasonId));
}

type ReportedResult = {
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};
type MatchSides = { homeTeamId: string; awayTeamId: string };

/** Bo2 group match: one of 2–0 / 1–1 / 0–2. The winner follows from the score; 1–1 is a draw. */
function readBo2Result(match: MatchSides, formData: FormData): ReportedResult | string {
  const key = formData.get("result")?.toString() ?? "";
  if (!Object.hasOwn(BO2_RESULTS, key)) return "invalid-result";
  const { homeScore, awayScore } = BO2_RESULTS[key as Bo2Result];
  const winnerTeamId =
    homeScore > awayScore ? match.homeTeamId : awayScore > homeScore ? match.awayTeamId : null;
  return { winnerTeamId, homeScore, awayScore };
}

/** Everything else (playoffs, tiebreakers, Bo1 groups): a winner, plus an optional score. */
function readWinnerResult(match: MatchSides, formData: FormData): ReportedResult | string {
  const winnerTeamId = formData.get("winnerTeamId")?.toString() ?? "";
  if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
    return "invalid-winner";
  }

  // Scores are optional, but a 0 is a real score (the old `|| null` turned a
  // 2-0 into 2-blank, which then rendered with no score at all).
  const homeScore = parseScore(formData.get("homeScore"));
  const awayScore = parseScore(formData.get("awayScore"));
  if (homeScore === undefined || awayScore === undefined) return "invalid-score";
  if ((homeScore === null) !== (awayScore === null)) return "partial-score";
  if (homeScore !== null && awayScore !== null) {
    const winnerScore = winnerTeamId === match.homeTeamId ? homeScore : awayScore;
    const loserScore = winnerTeamId === match.homeTeamId ? awayScore : homeScore;
    if (winnerScore <= loserScore) return "score-mismatch";
  }
  return { winnerTeamId, homeScore, awayScore };
}

/** Blank -> null (no score given); 0-10 -> number; anything else -> undefined (invalid). */
function parseScore(raw: FormDataEntryValue | null): number | null | undefined {
  const v = raw?.toString().trim() ?? "";
  if (v === "") return null;
  if (!/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n <= 10 ? n : undefined;
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
  // Which side reported (null for an admin), so Discord pings the other one.
  let reportingTeamId: string | null = null;
  if (!isAdmin) {
    const team = await getTeamForCaptain(season.id, session.user.id);
    if (!team) redirect(`/seasons/${slug}/matches/${matchId}?error=not-on-team`);
    if (team.id !== match.homeTeamId && team.id !== match.awayTeamId) {
      redirect(`/seasons/${slug}/matches/${matchId}?error=not-your-match`);
    }
    reportingTeamId = team.id;
  }

  const result =
    match.stage === "group" && season.groupBestOf === 2
      ? readBo2Result(match, formData)
      : readWinnerResult(match, formData);
  if (typeof result === "string") redirect(`/seasons/${slug}/matches/${matchId}?error=${result}`);
  const { winnerTeamId, homeScore, awayScore } = result;

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
  await logEvent("match.reported", {
    actorId: session.user.id,
    seasonId: season.id,
    data: {
      ...(await matchEventData(matchId)),
      score: homeScore !== null && awayScore !== null ? `${homeScore}–${awayScore}` : null,
    },
  });
  syncInBackground(`${slug} result reported`, () =>
    notifyMatchEvent(matchId, "reported", reportingTeamId),
  );

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/seasons/${slug}`);
  redirect(`/seasons/${slug}/matches/${matchId}?saved=1`);
}

export async function confirmMatch(slug: string, matchId: string) {
  const session = await requireAdmin();
  const season = await getSeasonOrFail(slug);

  // Fetch match before update so we know its stage
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) redirect(`/admin/seasons/${slug}/matches?error=not-found`);
  // A Bo2 group draw (1–1) is a result too; anything else needs a winner.
  if (!hasResult(match)) redirect(`/admin/seasons/${slug}/matches?error=no-winner`);

  await db
    .update(matches)
    .set({ state: "confirmed", confirmedAt: new Date() })
    .where(eq(matches.id, matchId));
  await logEvent("match.confirmed", {
    actorId: session.user.id,
    seasonId: season.id,
    data: await matchEventData(matchId),
  });

  // Final after both semis, champion on the final, Discord, revalidation.
  await applyConfirmEffects(season, { ...match, state: "confirmed" });
  redirect(`/admin/seasons/${slug}/matches?saved=confirmed`);
}

export async function disputeMatch(slug: string, matchId: string) {
  const session = await requireAdmin();
  const season = await getSeasonOrFail(slug);

  await db
    .update(matches)
    .set({ state: "disputed", winnerTeamId: null, homeScore: null, awayScore: null })
    .where(and(eq(matches.id, matchId), eq(matches.seasonId, season.id)));
  await clearChampionIfFinal(season.id, matchId);
  await logEvent("match.disputed", {
    actorId: session.user.id,
    seasonId: season.id,
    data: await matchEventData(matchId),
  });
  syncInBackground(`${slug} result disputed`, () => notifyMatchEvent(matchId, "disputed"));

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=disputed`);
}

export async function resetMatch(slug: string, matchId: string) {
  const session = await requireAdmin();
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
  await clearChampionIfFinal(season.id, matchId);
  await logEvent("match.reset", {
    actorId: session.user.id,
    seasonId: season.id,
    data: await matchEventData(matchId),
  });
  syncInBackground(`${slug} result reset`, () => notifyMatchEvent(matchId, "reset"));

  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  redirect(`/admin/seasons/${slug}/matches?saved=reset`);
}

/**
 * Admin Edit result (match page): set each match-day game's winner and the
 * series result, confirmed at once — whatever state the match was in. Re-runs
 * the confirm effects, so a changed semi updates an unplayed final and a
 * changed final re-crowns the champion. Also the fix for a wrong automatic
 * confirm or a flagged game.
 */
export async function adminEditResult(slug: string, matchId: string, formData: FormData) {
  const session = await requireAdmin();
  const season = await getSeasonOrFail(slug);
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) redirect(`/seasons/${slug}/matches?error=not-found`);

  const result =
    match.stage === "group" && season.groupBestOf === 2
      ? readBo2Result(match, formData)
      : readWinnerResult(match, formData);
  if (typeof result === "string") redirect(`/seasons/${slug}/matches/${matchId}?error=${result}`);

  const now = new Date();
  const games = await db.query.matchGames.findMany({ where: eq(matchGames.matchId, matchId) });
  for (const game of games) {
    const key = `game-${game.gameNumber}`;
    if (!formData.has(key)) continue;
    const v = formData.get(key)?.toString() ?? "";
    const winnerTeamId = v === match.homeTeamId || v === match.awayTeamId ? v : null;
    if (winnerTeamId === game.winnerTeamId) continue;
    await db
      .update(matchGames)
      .set({
        winnerTeamId,
        resultReportedBy: winnerTeamId ? session.user.id : null,
        resultReportedAt: winnerTeamId ? now : null,
        resultFlaggedBy: null,
        resultFlaggedAt: null,
      })
      .where(eq(matchGames.id, game.id));
  }

  await confirmWithResult({ season, matchId, ...result, actorId: session.user.id });
  await logEvent("match.result_edited", {
    actorId: session.user.id,
    seasonId: season.id,
    data: {
      ...(await matchEventData(matchId)),
      score:
        result.homeScore !== null && result.awayScore !== null
          ? `${result.homeScore}–${result.awayScore}`
          : null,
    },
  });
  redirect(`/seasons/${slug}/matches/${matchId}?saved=result-edited`);
}
