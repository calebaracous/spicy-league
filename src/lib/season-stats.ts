import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { matchDraftActions, matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import type { StatsGame } from "@/lib/champion-stats";

// Loads match-day drafts for the stats pages (docs/MATCH-DAY.md, phase 5):
// completed drafts in confirmed matches only, like standings — a disputed or
// unconfirmed result doesn't move the numbers.

type GameRow = typeof matchGames.$inferSelect;

async function withActions(games: GameRow[]): Promise<StatsGame[]> {
  if (games.length === 0) return [];
  const actions = await db
    .select()
    .from(matchDraftActions)
    .where(
      inArray(
        matchDraftActions.gameId,
        games.map((g) => g.id),
      ),
    );
  return games
    .filter((g) => g.blueTeamId && g.redTeamId)
    .map((g) => ({
      blueTeamId: g.blueTeamId!,
      redTeamId: g.redTeamId!,
      winnerTeamId: g.winnerTeamId,
      gameNumber: g.gameNumber,
      sideChosenVia: g.sideChosenVia,
      sideChooserTeamId: g.sideChooserTeamId,
      actions: actions
        .filter((a) => a.gameId === g.id)
        .sort((a, b) => a.step - b.step)
        .map((a) => ({
          side: a.side,
          kind: a.kind,
          championKey: a.championKey,
          assignedUserId: a.assignedUserId,
        })),
    }));
}

/** Every drafted game of the season's confirmed matches. */
export async function loadSeasonDraftGames(seasonId: string): Promise<StatsGame[]> {
  const rows = await db
    .select({ game: matchGames })
    .from(matchGames)
    .innerJoin(matches, eq(matches.id, matchGames.matchId))
    .where(
      and(
        eq(matches.seasonId, seasonId),
        eq(matches.state, "confirmed"),
        eq(matchGames.draftState, "complete"),
      ),
    );
  return withActions(rows.map((r) => r.game));
}

/** Drafted games (confirmed matches, any season) where `userId` was assigned a pick. */
export async function loadPlayerDraftGames(userId: string): Promise<StatsGame[]> {
  const mine = await db
    .selectDistinct({ gameId: matchDraftActions.gameId })
    .from(matchDraftActions)
    .where(eq(matchDraftActions.assignedUserId, userId));
  if (mine.length === 0) return [];
  const rows = await db
    .select({ game: matchGames })
    .from(matchGames)
    .innerJoin(matches, eq(matches.id, matchGames.matchId))
    .where(
      and(
        inArray(
          matchGames.id,
          mine.map((m) => m.gameId),
        ),
        eq(matches.state, "confirmed"),
      ),
    );
  return withActions(rows.map((r) => r.game));
}
