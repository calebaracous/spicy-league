import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { notifyGameResult } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent, matchEventData } from "@/lib/events";
import { settleMatchDay } from "@/lib/match-day";
import { confirmWithResult } from "@/lib/match-results";
import { LOSER_SIDE_PICK_MS } from "@/lib/rps";
import { bestOfFor, loserOf, seriesScore } from "@/lib/series";

// Recording a game's winner (docs/MATCH-DAY.md, phase 2) — shared by the
// captains' "X won" buttons (reportGameWinner) and Riot's tournament callback
// (phase 6), so both open the next side pick and auto-confirm the same way.

/** An expected refusal; the action turns it into `{ error }`. */
export class GameResultError extends Error {}

/**
 * Not over → the loser gets the next game's side pick (5 minutes). Over → the match
 * is reported and confirmed with the series score. `privileged` (admins, and
 * Riot's callback) may record before the draft is done and correct a game
 * after the next one started. Returns false when nothing changed.
 */
export async function recordGameWinner(opts: {
  matchId: string;
  gameNumber: number;
  winnerTeamId: string;
  /** Null for Riot's callback. */
  actorId: string | null;
  privileged: boolean;
}): Promise<boolean> {
  const { matchId, gameNumber, winnerTeamId, actorId, privileged } = opts;
  const now = new Date();
  const finished = await db.transaction(async (tx) => {
    const [match] = await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!match) throw new GameResultError("Match not found.");
    if (match.state !== "scheduled") throw new GameResultError("This match already has a result.");
    const season = await tx.query.seasons.findFirst({ where: eq(seasons.id, match.seasonId) });
    if (!season) throw new GameResultError("Season not found.");
    if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
      throw new GameResultError("Pick one of the two teams.");
    }
    await settleMatchDay(tx, match, now);
    const games = await tx
      .select()
      .from(matchGames)
      .where(eq(matchGames.matchId, matchId))
      .orderBy(asc(matchGames.gameNumber));
    const game = games.find((g) => g.gameNumber === gameNumber);
    if (!game?.blueTeamId) throw new GameResultError("That game's sides aren't set yet.");
    if (!privileged && game.draftState !== "complete" && game.draftState !== "skipped") {
      throw new GameResultError(`Finish game ${gameNumber}'s draft first.`);
    }
    if (game.winnerTeamId === winnerTeamId) return null;
    const next = games.find((g) => g.gameNumber === gameNumber + 1);
    if (game.winnerTeamId && next?.blueTeamId && !privileged) {
      throw new GameResultError(
        `Game ${gameNumber + 1} has started, so ask an admin to correct game ${gameNumber}.`,
      );
    }
    // A corrected result moves the next side pick to the new loser.
    if (next && !next.blueTeamId) await tx.delete(matchGames).where(eq(matchGames.id, next.id));

    await tx
      .update(matchGames)
      .set({
        winnerTeamId,
        resultReportedBy: actorId,
        resultReportedAt: now,
        resultFlaggedBy: null,
        resultFlaggedAt: null,
      })
      .where(and(eq(matchGames.id, game.id)));
    const results = games.map((g) => (g.id === game.id ? { ...g, winnerTeamId } : g));
    const score = seriesScore(bestOfFor(season, match.stage), results, match);
    if (!score.over && !(next && next.blueTeamId)) {
      await tx.insert(matchGames).values({
        matchId,
        gameNumber: gameNumber + 1,
        sideChooserTeamId: loserOf(winnerTeamId, match),
        sideDeadline: new Date(now.getTime() + LOSER_SIDE_PICK_MS),
      });
    }
    return { season, score };
  });
  if (!finished) return false;
  const { season, score } = finished;
  await logEvent("match.game_result", {
    actorId,
    seasonId: season.id,
    data: { ...(await matchEventData(matchId)), gameNumber, ...(actorId ? {} : { riot: true }) },
  });
  syncInBackground("game result", () => notifyGameResult(matchId, gameNumber));
  if (score.over) {
    // The series is decided: report + confirm it with the game count.
    await confirmWithResult({
      season,
      matchId,
      winnerTeamId: score.winnerTeamId,
      homeScore: score.homeWins,
      awayScore: score.awayWins,
      actorId,
    });
    await logEvent("match.confirmed", {
      actorId,
      seasonId: season.id,
      data: { ...(await matchEventData(matchId)), auto: true },
    });
  }
  return true;
}
