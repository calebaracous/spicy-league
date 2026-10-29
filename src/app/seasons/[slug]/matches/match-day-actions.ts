"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { matchGames, matchRps } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";
import { notifyMatchSides } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent } from "@/lib/events";
import { matchDayApplies, settleMatchDay } from "@/lib/match-day";
import { isRpsThrow } from "@/lib/rps";
import { getCaptainedTeamId } from "@/lib/schedule";

// Match day actions (docs/MATCH-DAY.md). Like the 10-man actions they return
// `{ error }` for expected failures — they're called from a client component,
// and a thrown server-action error would crash the card with its message
// stripped in production. Each mutation locks the match row first, then
// settles lapsed deadlines, so it acts on the same state the clock says.

export type MatchDayActionResult = { error?: string };

class MatchDayError extends Error {}

async function run(fn: () => Promise<void>): Promise<MatchDayActionResult> {
  try {
    await fn();
    return {};
  } catch (err) {
    if (err instanceof MatchDayError) return { error: err.message };
    throw err;
  }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function lockMatch(tx: Tx, slug: string, matchId: string) {
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
  if (match.state !== "scheduled") throw new MatchDayError("This match already has a result.");
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

function revalidate(slug: string, matchId: string) {
  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
}

/**
 * A captain takes their team's RPS seat. The first captain of a team to ready
 * up plays; a co-captain gets an error naming them. Both seats ready → round 1.
 */
export async function readyRps(slug: string, matchId: string): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(async () => {
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
    revalidate(slug, matchId);
  });
}

/** The seat holder steps back before both teams are in; frees the seat. */
export async function unreadyRps(slug: string, matchId: string): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(async () => {
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
    revalidate(slug, matchId);
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
  return run(async () => {
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
    revalidate(slug, matchId);
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
  return run(async () => {
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
    revalidate(slug, matchId);
  });
}

/** Admin escape hatch: wipe RPS and every game's side so it can be replayed. */
export async function adminResetMatchDay(
  slug: string,
  matchId: string,
): Promise<MatchDayActionResult> {
  const session = await requireAdmin();
  return run(async () => {
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
    revalidate(slug, matchId);
  });
}
