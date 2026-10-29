"use server";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { matchGames, matchRps } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";
import { notifyGameResult, notifyMatchSides } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent, matchEventData } from "@/lib/events";
import {
  getMatchDaySnapshot,
  getMatchDayViewer,
  matchDayApplies,
  settleMatchDay,
  type MatchDaySnapshot,
} from "@/lib/match-day";
import { confirmWithResult } from "@/lib/match-results";
import { isRpsThrow, SIDE_PICK_MS } from "@/lib/rps";
import { getCaptainedTeamId } from "@/lib/schedule";
import { bestOfFor, loserOf, seriesScore } from "@/lib/series";

// Match day actions (docs/MATCH-DAY.md). Like the 10-man actions they return
// `{ error }` for expected failures — they're called from a client component,
// and a thrown server-action error would crash the card with its message
// stripped in production. Each mutation locks the match row first, then
// settles lapsed deadlines, so it acts on the same state the clock says.

// Every result carries the caller's fresh snapshot (also after an expected
// error, e.g. "Too late"), so the card updates at once instead of waiting
// for the stream's next poll — that lag ate into the 10s throw window. No
// revalidatePath: only the card shows this state, and a page refresh per
// click re-rendered the whole match page and re-ran every link prefetch.
export type MatchDayActionResult = { error?: string; snap?: MatchDaySnapshot | null };

class MatchDayError extends Error {}

async function run(matchId: string, fn: () => Promise<void>): Promise<MatchDayActionResult> {
  let error: string | undefined;
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof MatchDayError)) throw err;
    error = err.message;
  }
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  const snap = match ? await getMatchDaySnapshot(matchId, await getMatchDayViewer(match)) : null;
  return { error, snap };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Locks the match row. Only a scheduled match is open, unless `finished` is allowed. */
async function lockMatch(tx: Tx, slug: string, matchId: string, opts = { finished: false }) {
  const season = await tx.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) throw new MatchDayError("Season not found.");
  if (!matchDayApplies(season)) {
    throw new MatchDayError("Side selection is only for League of Legends seasons.");
  }
  const [match] = await tx
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.seasonId, season.id)))
    .for("update");
  if (!match) throw new MatchDayError("Match not found.");
  if (match.state !== "scheduled" && !opts.finished) {
    throw new MatchDayError("This match already has a result.");
  }
  return { season, match };
}

/** "home" / "away" when the user captains (either of a duo) one of the teams. */
async function captainSide(
  seasonId: string,
  match: { homeTeamId: string; awayTeamId: string },
  userId: string,
): Promise<"home" | "away" | null> {
  const teamId = await getCaptainedTeamId(seasonId, userId);
  return teamId === match.homeTeamId ? "home" : teamId === match.awayTeamId ? "away" : null;
}

async function displayName(tx: Tx, userId: string): Promise<string> {
  const [u] = await tx
    .select({ name: users.name, username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  return u?.name ?? u?.username ?? "Your co-captain";
}

/**
 * A captain takes their team's RPS seat. The first captain of a team to ready
 * up plays; a co-captain gets an error naming them. Both seats ready → round 1.
 */
export async function readyRps(slug: string, matchId: string): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    const now = new Date();
    await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId);
      const side = await captainSide(season.id, match, userId);
      if (!side) throw new MatchDayError("Only the two teams' captains can play RPS.");
      await settleMatchDay(tx, match, now);

      await tx.insert(matchRps).values({ matchId }).onConflictDoNothing();
      const [rps] = await tx.select().from(matchRps).where(eq(matchRps.matchId, matchId));
      if (rps.state !== "waiting") throw new MatchDayError("RPS has already started.");
      const seat = side === "home" ? rps.homeUserId : rps.awayUserId;
      if (seat === userId) return;
      if (seat) {
        throw new MatchDayError(`${await displayName(tx, seat)} is already playing for your team.`);
      }
      await tx
        .update(matchRps)
        .set(
          side === "home"
            ? { homeUserId: userId, homeReadyAt: now, updatedAt: now }
            : { awayUserId: userId, awayReadyAt: now, updatedAt: now },
        )
        .where(eq(matchRps.matchId, matchId));
      await settleMatchDay(tx, match, now);
    });
  });
}

/** The seat holder steps back before both teams are in; frees the seat. */
export async function unreadyRps(slug: string, matchId: string): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    const now = new Date();
    await db.transaction(async (tx) => {
      await lockMatch(tx, slug, matchId);
      const [rps] = await tx.select().from(matchRps).where(eq(matchRps.matchId, matchId));
      if (!rps || rps.state !== "waiting") throw new MatchDayError("RPS has already started.");
      if (rps.homeUserId === userId) {
        await tx
          .update(matchRps)
          .set({ homeUserId: null, homeReadyAt: null, updatedAt: now })
          .where(eq(matchRps.matchId, matchId));
      } else if (rps.awayUserId === userId) {
        await tx
          .update(matchRps)
          .set({ awayUserId: null, awayReadyAt: null, updatedAt: now })
          .where(eq(matchRps.matchId, matchId));
      }
    });
  });
}

/**
 * The seat holder throws for `round`. The round number makes a late click
 * fail instead of landing in the next round. Locked once thrown.
 */
export async function throwRps(
  slug: string,
  matchId: string,
  round: number,
  choice: string,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    if (!isRpsThrow(choice)) throw new MatchDayError("Pick rock, paper or scissors.");
    const now = new Date();
    await db.transaction(async (tx) => {
      const { match } = await lockMatch(tx, slug, matchId);
      await settleMatchDay(tx, match, now);
      const [rps] = await tx.select().from(matchRps).where(eq(matchRps.matchId, matchId));
      if (!rps || rps.state !== "throwing" || rps.round !== round) {
        throw new MatchDayError("Too late, that round is over.");
      }
      const side = rps.homeUserId === userId ? "home" : rps.awayUserId === userId ? "away" : null;
      if (!side) throw new MatchDayError("You're not playing this RPS.");
      if ((side === "home" ? rps.homeThrow : rps.awayThrow) !== null) {
        throw new MatchDayError("You already threw.");
      }
      await tx
        .update(matchRps)
        .set(
          side === "home"
            ? { homeThrow: choice, updatedAt: now }
            : { awayThrow: choice, updatedAt: now },
        )
        .where(eq(matchRps.matchId, matchId));
      // Both in → reveal now rather than waiting out the clock.
      await settleMatchDay(tx, match, now);
    });
  });
}

/** The side chooser's captain picks blue or red for a game. */
export async function pickSide(
  slug: string,
  matchId: string,
  gameNumber: number,
  side: string,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    if (side !== "blue" && side !== "red") throw new MatchDayError("Pick blue or red.");
    const now = new Date();
    await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId);
      await settleMatchDay(tx, match, now);
      const [game] = await tx
        .select()
        .from(matchGames)
        .where(and(eq(matchGames.matchId, matchId), eq(matchGames.gameNumber, gameNumber)));
      if (!game) throw new MatchDayError("There's no side pick open for that game.");
      if (game.blueTeamId) throw new MatchDayError("Sides are already set for that game.");
      const mySide = await captainSide(season.id, match, userId);
      const myTeamId =
        mySide === "home" ? match.homeTeamId : mySide === "away" ? match.awayTeamId : null;
      if (!myTeamId || myTeamId !== game.sideChooserTeamId) {
        throw new MatchDayError("It's not your team's pick.");
      }
      const other = myTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      await tx
        .update(matchGames)
        .set({
          blueTeamId: side === "blue" ? myTeamId : other,
          redTeamId: side === "blue" ? other : myTeamId,
          sideChosenVia: gameNumber === 1 ? "rps" : "loser",
          sideChosenBy: userId,
          sideChosenAt: now,
        })
        .where(eq(matchGames.id, game.id));
    });
    syncInBackground("match sides", () => notifyMatchSides(matchId, gameNumber));
  });
}

/**
 * A captain of either team (or an admin) records who won a game. Not over →
 * the loser gets the next game's side pick (60s). Over → the match is
 * reported and confirmed with the series score, running every confirm effect.
 * Captains can correct a winner until the next game's sides are set; after
 * that only an admin can (Edit result on the match page).
 */
export async function reportGameWinner(
  slug: string,
  matchId: string,
  gameNumber: number,
  winnerTeamId: string,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  return run(matchId, async () => {
    const now = new Date();
    const finished = await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId);
      if (!isAdmin && !(await captainSide(season.id, match, userId))) {
        throw new MatchDayError("Only the two teams' captains can record results.");
      }
      if (winnerTeamId !== match.homeTeamId && winnerTeamId !== match.awayTeamId) {
        throw new MatchDayError("Pick one of the two teams.");
      }
      await settleMatchDay(tx, match, now);
      const games = await tx
        .select()
        .from(matchGames)
        .where(eq(matchGames.matchId, matchId))
        .orderBy(asc(matchGames.gameNumber));
      const game = games.find((g) => g.gameNumber === gameNumber);
      if (!game?.blueTeamId) throw new MatchDayError("That game's sides aren't set yet.");
      if (game.winnerTeamId === winnerTeamId) return null;
      const next = games.find((g) => g.gameNumber === gameNumber + 1);
      if (game.winnerTeamId && next?.blueTeamId && !isAdmin) {
        throw new MatchDayError(
          `Game ${gameNumber + 1} has started, so ask an admin to correct game ${gameNumber}.`,
        );
      }
      // A corrected result moves the next side pick to the new loser.
      if (next && !next.blueTeamId) await tx.delete(matchGames).where(eq(matchGames.id, next.id));

      await tx
        .update(matchGames)
        .set({
          winnerTeamId,
          resultReportedBy: userId,
          resultReportedAt: now,
          resultFlaggedBy: null,
          resultFlaggedAt: null,
        })
        .where(eq(matchGames.id, game.id));
      const results = games.map((g) => (g.id === game.id ? { ...g, winnerTeamId } : g));
      const score = seriesScore(bestOfFor(season, match.stage), results, match);
      if (!score.over && !(next && next.blueTeamId)) {
        await tx.insert(matchGames).values({
          matchId,
          gameNumber: gameNumber + 1,
          sideChooserTeamId: loserOf(winnerTeamId, match),
          sideDeadline: new Date(now.getTime() + SIDE_PICK_MS),
        });
      }
      return { season, score };
    });
    if (!finished) return;
    const { season, score } = finished;
    await logEvent("match.game_result", {
      actorId: userId,
      seasonId: season.id,
      data: { ...(await matchEventData(matchId)), gameNumber },
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
        actorId: userId,
      });
      await logEvent("match.confirmed", {
        actorId: userId,
        seasonId: season.id,
        data: { ...(await matchEventData(matchId)), auto: true },
      });
    }
  });
}

/**
 * A captain disputes a recorded game result. It stays in place; admins see
 * the flag (events inbox, match page) and fix it with Edit result. Works after
 * the match was confirmed too — that's when it matters most.
 */
export async function flagGameResult(
  slug: string,
  matchId: string,
  gameNumber: number,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    const seasonId = await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId, { finished: true });
      if (!(await captainSide(season.id, match, userId))) {
        throw new MatchDayError("Only the two teams' captains can flag a result.");
      }
      const [game] = await tx
        .select()
        .from(matchGames)
        .where(and(eq(matchGames.matchId, matchId), eq(matchGames.gameNumber, gameNumber)));
      if (!game?.winnerTeamId) throw new MatchDayError("That game has no result to flag.");
      if (game.resultFlaggedAt) return null;
      await tx
        .update(matchGames)
        .set({ resultFlaggedBy: userId, resultFlaggedAt: new Date() })
        .where(eq(matchGames.id, game.id));
      return season.id;
    });
    if (!seasonId) return;
    await logEvent("match.game_result_flagged", {
      actorId: userId,
      seasonId,
      data: { ...(await matchEventData(matchId)), gameNumber },
    });
  });
}

/** Admin escape hatch: wipe RPS and every game's side so it can be replayed. */
export async function adminResetMatchDay(
  slug: string,
  matchId: string,
): Promise<MatchDayActionResult> {
  const session = await requireAdmin();
  return run(matchId, async () => {
    const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
    const match = season
      ? await db.query.matches.findFirst({
          where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
        })
      : null;
    if (!season || !match) throw new MatchDayError("Match not found.");
    await db.transaction(async (tx) => {
      await tx.select().from(matches).where(eq(matches.id, matchId)).for("update");
      await tx.delete(matchGames).where(eq(matchGames.matchId, matchId));
      await tx.delete(matchRps).where(eq(matchRps.matchId, matchId));
    });
    await logEvent("match.side_select_reset", {
      actorId: session.user.id,
      seasonId: season.id,
      data: { matchId },
    });
  });
}
