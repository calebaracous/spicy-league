import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { matchDraftActions, matchGamePlayerStats, matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import type { StatsGame } from "@/lib/champion-stats";
import type { PlayerLine } from "@/lib/riot-player-stats";

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

// ── Riot per-player stats (phase 6) ──────────────────────────────────────────

const lineColumns = {
  userId: matchGamePlayerStats.userId,
  side: matchGamePlayerStats.side,
  championKey: matchGamePlayerStats.championKey,
  kills: matchGamePlayerStats.kills,
  deaths: matchGamePlayerStats.deaths,
  assists: matchGamePlayerStats.assists,
  cs: matchGamePlayerStats.cs,
  gold: matchGamePlayerStats.gold,
  damage: matchGamePlayerStats.damage,
  visionScore: matchGamePlayerStats.visionScore,
  win: matchGamePlayerStats.win,
};

export type GameRiotStats = {
  gameNumber: number;
  lines: PlayerLine[];
};

/**
 * A match's Riot game lines, by game, plus the names and opt-ins of the
 * players in them (`optedIn` gates their own numbers on the page).
 */
export async function loadMatchRiotStats(matchId: string): Promise<{
  games: GameRiotStats[];
  players: Map<string, { name: string; optedIn: boolean }>;
}> {
  const rows = await db
    .select({
      ...lineColumns,
      gameNumber: matchGames.gameNumber,
      name: users.name,
      username: users.username,
      statsOptInAt: users.statsOptInAt,
    })
    .from(matchGamePlayerStats)
    .innerJoin(matchGames, eq(matchGames.id, matchGamePlayerStats.gameId))
    .leftJoin(users, eq(users.id, matchGamePlayerStats.userId))
    .where(eq(matchGames.matchId, matchId));
  const players = new Map<string, { name: string; optedIn: boolean }>();
  const byGame = new Map<number, PlayerLine[]>();
  for (const { gameNumber, name, username, statsOptInAt, ...line } of rows) {
    if (line.userId) {
      players.set(line.userId, { name: name || username || "?", optedIn: !!statsOptInAt });
    }
    byGame.set(gameNumber, [...(byGame.get(gameNumber) ?? []), line]);
  }
  const games = [...byGame.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gameNumber, lines]) => ({ gameNumber, lines }));
  return { games, players };
}

export type SeasonRiotLines = {
  season: { name: string; slug: string };
  lines: PlayerLine[];
};

/**
 * A player's Riot game lines in confirmed matches, newest season first. Only
 * call it for a player who opted in (decision 20).
 */
export async function loadPlayerRiotLines(userId: string): Promise<SeasonRiotLines[]> {
  const rows = await db
    .select({
      ...lineColumns,
      seasonId: seasons.id,
      seasonName: seasons.name,
      seasonSlug: seasons.slug,
    })
    .from(matchGamePlayerStats)
    .innerJoin(matchGames, eq(matchGames.id, matchGamePlayerStats.gameId))
    .innerJoin(matches, eq(matches.id, matchGames.matchId))
    .innerJoin(seasons, eq(seasons.id, matches.seasonId))
    .where(and(eq(matchGamePlayerStats.userId, userId), eq(matches.state, "confirmed")))
    .orderBy(desc(seasons.createdAt));
  const out = new Map<string, SeasonRiotLines>();
  for (const { seasonId, seasonName, seasonSlug, ...line } of rows) {
    const entry = out.get(seasonId) ?? {
      season: { name: seasonName, slug: seasonSlug },
      lines: [],
    };
    entry.lines.push(line);
    out.set(seasonId, entry);
  }
  return [...out.values()];
}
