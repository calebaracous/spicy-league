import "server-only";

import { and, eq, inArray, isNull, lte } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teams } from "@/db/schema/drafts";
import { matchGames, matchRps, type MatchRps } from "@/db/schema/match-day";
import { matches, type Match } from "@/db/schema/matches";
import { notifyMatchSides } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { getCaptainedTeamId } from "@/lib/schedule";
import {
  advanceRps,
  randomSide,
  settleRps,
  SIDE_PICK_MS,
  type RpsCore,
  type RpsRound,
  type RpsThrow,
} from "@/lib/rps";

// Match day state (docs/MATCH-DAY.md): RPS for game 1's side, then a
// match_games row per game. Deadlines are lazy — whoever reads or acts next
// applies what has lapsed (settleMatchDay), so the 1s SSE poll is the clock.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type MatchTeams = Pick<Match, "id" | "homeTeamId" | "awayTeamId">;

/** Side selection exists for LoL seasons only. */
export function matchDayApplies(season: { game: string }): boolean {
  return season.game === "lol";
}

function rpsCore(row: MatchRps): RpsCore {
  return {
    state: row.state,
    homeUserId: row.homeUserId,
    awayUserId: row.awayUserId,
    homeReadyAt: row.homeReadyAt,
    awayReadyAt: row.awayReadyAt,
    round: row.round,
    throwDeadline: row.throwDeadline,
    revealUntil: row.revealUntil,
    homeThrow: row.homeThrow,
    awayThrow: row.awayThrow,
    history: row.history,
    winnerTeamId: row.winnerTeamId,
  };
}

/**
 * Applies every lapsed deadline for one match: RPS rounds, and side picks that
 * ran out (random side). The caller must hold the match row lock.
 */
export async function settleMatchDay(
  tx: Tx,
  match: MatchTeams,
  now: Date,
): Promise<{ autoSides: number[] }> {
  const [rps] = await tx.select().from(matchRps).where(eq(matchRps.matchId, match.id));
  if (rps) {
    const { row, changed } = settleRps(rpsCore(rps), now, {
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    });
    if (changed) {
      await tx
        .update(matchRps)
        .set({ ...row, updatedAt: now })
        .where(eq(matchRps.matchId, match.id));
      // The winner's side pick opens once the reveal is over.
      if (row.state === "done" && row.winnerTeamId) {
        await tx
          .insert(matchGames)
          .values({
            matchId: match.id,
            gameNumber: 1,
            sideChooserTeamId: row.winnerTeamId,
            sideDeadline: new Date(now.getTime() + SIDE_PICK_MS),
          })
          .onConflictDoNothing();
      }
    }
  }

  const lapsed = await tx
    .select()
    .from(matchGames)
    .where(
      and(
        eq(matchGames.matchId, match.id),
        isNull(matchGames.blueTeamId),
        lte(matchGames.sideDeadline, now),
      ),
    );
  for (const game of lapsed) {
    const chooser = game.sideChooserTeamId ?? match.homeTeamId;
    const other = chooser === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
    const chooserBlue = randomSide() === "blue";
    await tx
      .update(matchGames)
      .set({
        blueTeamId: chooserBlue ? chooser : other,
        redTeamId: chooserBlue ? other : chooser,
        sideChosenVia: "auto",
        sideChosenAt: now,
      })
      .where(eq(matchGames.id, game.id));
  }
  return { autoSides: lapsed.map((g) => g.gameNumber) };
}

/**
 * Settles lapsed deadlines if any are due. A cheap unlocked read decides; the
 * write path takes the match row with SKIP LOCKED so concurrent pollers (one
 * stream per viewer) don't queue behind each other — whoever holds the lock
 * is already doing the work.
 */
export async function resolveExpired(match: MatchTeams, now = new Date()): Promise<void> {
  const [rps, games] = await Promise.all([
    db.query.matchRps.findFirst({ where: eq(matchRps.matchId, match.id) }),
    db.query.matchGames.findMany({ where: eq(matchGames.matchId, match.id) }),
  ]);
  const rpsDue =
    rps &&
    advanceRps(rpsCore(rps), now, {
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
    }) !== null;
  const sideDue = games.some((g) => !g.blueTeamId && g.sideDeadline && g.sideDeadline <= now);
  if (!rpsDue && !sideDue) return;

  const autoSides = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: matches.id, state: matches.state })
      .from(matches)
      .where(eq(matches.id, match.id))
      .for("update", { skipLocked: true });
    if (!locked || locked.state !== "scheduled") return [];
    return (await settleMatchDay(tx, match, now)).autoSides;
  });
  for (const gameNumber of autoSides) {
    syncInBackground("match sides", () => notifyMatchSides(match.id, gameNumber));
  }
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

export type MatchDayViewer = {
  userId: string | null;
  /** The match team this viewer captains (either of a duo), if any. */
  teamId: string | null;
  isAdmin: boolean;
};

type Seat = { userId: string; name: string } | null;

export type MatchDaySnapshot = {
  /** For the client's clock offset; excluded from the stream's change hash. */
  serverNow: string;
  matchId: string;
  /** Actions are open only while the match is scheduled. */
  open: boolean;
  home: { teamId: string; name: string };
  away: { teamId: string; name: string };
  rps: {
    state: RpsCore["state"];
    round: number;
    throwDeadline: string | null;
    revealUntil: string | null;
    home: { seat: Seat; ready: boolean; thrown: boolean; throw: RpsThrow | null };
    away: { seat: Seat; ready: boolean; thrown: boolean; throw: RpsThrow | null };
    history: RpsRound[];
    winnerTeamId: string | null;
  } | null;
  games: {
    gameNumber: number;
    sideChooserTeamId: string | null;
    sideDeadline: string | null;
    sideChosenVia: "rps" | "loser" | "auto" | "admin" | null;
    blueTeamId: string | null;
    redTeamId: string | null;
  }[];
  viewer: MatchDayViewer & { myThrow: RpsThrow | null };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The signed-in viewer's role in this match's side selection. */
export async function getMatchDayViewer(
  match: Pick<Match, "seasonId" | "homeTeamId" | "awayTeamId">,
): Promise<MatchDayViewer> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const captained = userId ? await getCaptainedTeamId(match.seasonId, userId) : null;
  return {
    userId,
    teamId: captained === match.homeTeamId || captained === match.awayTeamId ? captained : null,
    isAdmin: session?.user?.role === "admin",
  };
}

/**
 * Everything the match-day card renders, after settling lapsed deadlines.
 * Throws stay hidden until the round is revealed — only the viewer's own
 * comes back (`viewer.myThrow`), so the stream can't leak the opponent's.
 */
export async function getMatchDaySnapshot(
  matchId: string,
  viewer: MatchDayViewer,
): Promise<MatchDaySnapshot | null> {
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match) return null;
  if (match.state === "scheduled") await resolveExpired(match);

  const [teamRows, rps, games] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, [match.homeTeamId, match.awayTeamId])),
    db.query.matchRps.findFirst({ where: eq(matchRps.matchId, matchId) }),
    db.query.matchGames.findMany({
      where: eq(matchGames.matchId, matchId),
      orderBy: (g, { asc }) => [asc(g.gameNumber)],
    }),
  ]);
  const teamName = (id: string) => teamRows.find((t) => t.id === id)?.name ?? "?";

  const seatIds = [rps?.homeUserId, rps?.awayUserId].filter((id): id is string => !!id);
  const seatUsers = seatIds.length
    ? await db
        .select({ id: users.id, name: users.name, username: users.username })
        .from(users)
        .where(inArray(users.id, seatIds))
    : [];
  const seat = (id: string | null): Seat => {
    if (!id) return null;
    const u = seatUsers.find((s) => s.id === id);
    return { userId: id, name: u?.name ?? u?.username ?? "?" };
  };

  const revealed = rps?.state === "revealed" || rps?.state === "done";
  const myThrow =
    rps && viewer.userId
      ? viewer.userId === rps.homeUserId
        ? rps.homeThrow
        : viewer.userId === rps.awayUserId
          ? rps.awayThrow
          : null
      : null;

  return {
    serverNow: new Date().toISOString(),
    matchId,
    open: match.state === "scheduled",
    home: { teamId: match.homeTeamId, name: teamName(match.homeTeamId) },
    away: { teamId: match.awayTeamId, name: teamName(match.awayTeamId) },
    rps: rps
      ? {
          state: rps.state,
          round: rps.round,
          throwDeadline: iso(rps.throwDeadline),
          revealUntil: iso(rps.revealUntil),
          home: {
            seat: seat(rps.homeUserId),
            ready: !!rps.homeReadyAt,
            thrown: rps.homeThrow !== null,
            throw: revealed ? rps.homeThrow : null,
          },
          away: {
            seat: seat(rps.awayUserId),
            ready: !!rps.awayReadyAt,
            thrown: rps.awayThrow !== null,
            throw: revealed ? rps.awayThrow : null,
          },
          history: rps.history,
          winnerTeamId: rps.winnerTeamId,
        }
      : null,
    games: games.map((g) => ({
      gameNumber: g.gameNumber,
      sideChooserTeamId: g.sideChooserTeamId,
      sideDeadline: iso(g.sideDeadline),
      sideChosenVia: g.sideChosenVia,
      blueTeamId: g.blueTeamId,
      redTeamId: g.redTeamId,
    })),
    viewer: { ...viewer, myThrow },
  };
}

/** True while something on the card is ticking — the stream polls faster. */
export function matchDayIsHot(snap: MatchDaySnapshot): boolean {
  if (!snap.open) return false;
  const r = snap.rps;
  if (r && (r.state === "throwing" || r.state === "revealed")) return true;
  if (r && r.state === "waiting" && (r.home.ready || r.away.ready)) return true;
  return snap.games.some((g) => !g.blueTeamId);
}
