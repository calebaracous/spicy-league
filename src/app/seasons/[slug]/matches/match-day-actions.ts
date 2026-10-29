"use server";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { matchDraftActions, matchGames, matchRps } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireAuth } from "@/lib/auth-helpers";
import { notifyDraftRecap, notifyLobbyCode, notifyMatchSides } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent, matchEventData } from "@/lib/events";
import { afterStep, deadlineFor } from "@/lib/draft-clock";
import { nextStep, stepAt } from "@/lib/draft-room";
import {
  draftAvailability,
  getMatchDaySnapshot,
  getMatchDayViewer,
  inMatchLineup,
  loadDraftActions,
  matchDayApplies,
  settleMatchDay,
  type MatchDaySnapshot,
} from "@/lib/match-day";
import { GameResultError, recordGameWinner } from "@/lib/match-day-results";
import { isRpsThrow } from "@/lib/rps";
import { getCaptainedTeamId } from "@/lib/schedule";
import { getMatchLineups } from "@/lib/substitutions";
import { createLobbyCode, lobbyCodesEnabled, registerTournament } from "@/lib/riot-tournament";

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
    const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
    const match = season
      ? await db.query.matches.findFirst({
          where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
        })
      : null;
    if (!season || !match) throw new MatchDayError("Match not found.");
    if (!isAdmin && !(await captainSide(season.id, match, userId))) {
      throw new MatchDayError("Only the two teams' captains can record results.");
    }
    try {
      await recordGameWinner({
        matchId,
        gameNumber,
        winnerTeamId,
        actorId: userId,
        privileged: isAdmin,
      });
    } catch (err) {
      if (err instanceof GameResultError) throw new MatchDayError(err.message);
      throw err;
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

// ── Draft room ───────────────────────────────────────────────────────────────

type Side = "blue" | "red";

/** Locks the match, settles the clock, and loads the game plus every game's actions. */
async function lockGame(tx: Tx, slug: string, matchId: string, gameNumber: number, now: Date) {
  const { season, match } = await lockMatch(tx, slug, matchId);
  await settleMatchDay(tx, match, now);
  const games = await tx
    .select()
    .from(matchGames)
    .where(eq(matchGames.matchId, matchId))
    .orderBy(asc(matchGames.gameNumber));
  const game = games.find((g) => g.gameNumber === gameNumber);
  if (!game?.blueTeamId || !game.redTeamId) {
    throw new MatchDayError("That game's sides aren't set yet.");
  }
  const actionsByGame = await loadDraftActions(
    tx,
    games.map((g) => g.id),
  );
  return { season, match, games, game, actionsByGame, actions: actionsByGame.get(game.id) ?? [] };
}

/** Which side of `game` the user captains, if either. */
async function captainDraftSide(
  seasonId: string,
  game: { blueTeamId: string | null; redTeamId: string | null },
  userId: string,
): Promise<Side | null> {
  const teamId = await getCaptainedTeamId(seasonId, userId);
  return teamId === game.blueTeamId ? "blue" : teamId === game.redTeamId ? "red" : null;
}

/**
 * A captain readies (or un-readies) their side for the draft; an admin can do
 * either side. Both ready → a 3s countdown, then step 1's clock.
 */
export async function readyDraft(
  slug: string,
  matchId: string,
  gameNumber: number,
  side: string,
  ready = true,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  return run(matchId, async () => {
    if (side !== "blue" && side !== "red") throw new MatchDayError("Pick a side.");
    const now = new Date();
    await db.transaction(async (tx) => {
      const { season, match, game } = await lockGame(tx, slug, matchId, gameNumber, now);
      const mine = await captainDraftSide(season.id, game, userId);
      if (mine !== side && !isAdmin) throw new MatchDayError("You can only ready your own side.");
      if (game.draftState !== "waiting") throw new MatchDayError("The draft has already started.");
      const stamp = ready ? now : null;
      await tx
        .update(matchGames)
        .set(side === "blue" ? { blueReadyAt: stamp } : { redReadyAt: stamp })
        .where(eq(matchGames.id, game.id));
      await settleMatchDay(tx, match, now);
    });
  });
}

/** Shared checks for hover / lock: the draft is running, `step` is current, the user may act for it. */
async function onTheClock(
  tx: Tx,
  slug: string,
  matchId: string,
  gameNumber: number,
  step: number,
  userId: string,
  isAdmin: boolean,
  now: Date,
) {
  const ctx = await lockGame(tx, slug, matchId, gameNumber, now);
  if (ctx.game.draftState !== "drafting") throw new MatchDayError("The draft isn't running.");
  if (step !== nextStep(ctx.actions)) throw new MatchDayError("Too late, that step is done.");
  const current = stepAt(step)!;
  const mine = await captainDraftSide(ctx.season.id, ctx.game, userId);
  if (mine !== current.side && !isAdmin) throw new MatchDayError("It's not your turn.");
  const available = await draftAvailability(
    tx,
    ctx.match,
    ctx.games,
    ctx.actionsByGame,
    gameNumber,
  );
  if (!available) throw new MatchDayError("Couldn't load the champion list. Try again.");
  return { ...ctx, current, available: available(ctx.actions) };
}

/** Shows the side's current choice to everyone; null clears it. It locks on timeout. */
export async function hoverChampion(
  slug: string,
  matchId: string,
  gameNumber: number,
  step: number,
  championKey: string | null,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  return run(matchId, async () => {
    const now = new Date();
    await db.transaction(async (tx) => {
      const { game, current, available } = await onTheClock(
        tx,
        slug,
        matchId,
        gameNumber,
        step,
        session.user.id,
        session.user.role === "admin",
        now,
      );
      if (championKey && !available.includes(championKey)) {
        throw new MatchDayError("That champion isn't available.");
      }
      await tx
        .update(matchGames)
        .set(current.side === "blue" ? { blueHover: championKey } : { redHover: championKey })
        .where(eq(matchGames.id, game.id));
    });
  });
}

/** Locks a champion for the current step; null skips a ban. */
export async function lockChampion(
  slug: string,
  matchId: string,
  gameNumber: number,
  step: number,
  championKey: string | null,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    const now = new Date();
    const completed = await db.transaction(async (tx) => {
      const { game, actions, current, available } = await onTheClock(
        tx,
        slug,
        matchId,
        gameNumber,
        step,
        userId,
        session.user.role === "admin",
        now,
      );
      if (championKey === null && current.kind === "pick") {
        throw new MatchDayError("Pick a champion.");
      }
      if (championKey !== null && !available.includes(championKey)) {
        throw new MatchDayError("That champion isn't available.");
      }
      const action = { ...current, championKey };
      await tx.insert(matchDraftActions).values({ ...action, gameId: game.id, actedBy: userId });
      const clock = afterStep(current.side, [...actions, action], now);
      await tx.update(matchGames).set(clock).where(eq(matchGames.id, game.id));
      return clock.draftState === "complete";
    });
    if (completed) {
      syncInBackground("draft recap", () => notifyDraftRecap(matchId, gameNumber));
    }
  });
}

/** Admin: take back the last step (that side gets a fresh clock; unpauses too). */
export async function adminUndoDraftStep(
  slug: string,
  matchId: string,
  gameNumber: number,
): Promise<MatchDayActionResult> {
  await requireAdmin();
  return run(matchId, async () => {
    const now = new Date();
    await db.transaction(async (tx) => {
      const { game, actions } = await lockGame(tx, slug, matchId, gameNumber, now);
      if (game.winnerTeamId) throw new MatchDayError("That game already has a result.");
      const last = actions.at(-1);
      if (!last) throw new MatchDayError("Nothing to undo.");
      await tx
        .delete(matchDraftActions)
        .where(and(eq(matchDraftActions.gameId, game.id), eq(matchDraftActions.step, last.step)));
      await tx
        .update(matchGames)
        .set({
          draftState: "drafting",
          stepDeadline: deadlineFor(last.step, now),
          draftCompletedAt: null,
          blueHover: null,
          redHover: null,
        })
        .where(eq(matchGames.id, game.id));
    });
  });
}

/** Admin: let the game go ahead without a draft here, or start its draft over. */
export async function adminSetDraft(
  slug: string,
  matchId: string,
  gameNumber: number,
  to: "skipped" | "restart",
): Promise<MatchDayActionResult> {
  await requireAdmin();
  return run(matchId, async () => {
    const now = new Date();
    await db.transaction(async (tx) => {
      const { game } = await lockGame(tx, slug, matchId, gameNumber, now);
      if (game.winnerTeamId) throw new MatchDayError("That game already has a result.");
      if (to === "skipped") {
        await tx
          .update(matchGames)
          .set({ draftState: "skipped", stepDeadline: null, blueHover: null, redHover: null })
          .where(eq(matchGames.id, game.id));
        return;
      }
      await tx.delete(matchDraftActions).where(eq(matchDraftActions.gameId, game.id));
      await tx
        .update(matchGames)
        .set({
          draftState: "waiting",
          blueReadyAt: null,
          redReadyAt: null,
          draftStartsAt: null,
          stepDeadline: null,
          blueHover: null,
          redHover: null,
          draftCompletedAt: null,
        })
        .where(eq(matchGames.id, game.id));
    });
  });
}

/**
 * After a completed draft, a captain says which lineup player played each of
 * their team's picks (an admin can do either team). Optional; per-player
 * champion stats read it. `assignments` maps pick step → user id (or null to
 * clear). Works after the match is confirmed too.
 */
export async function assignPicks(
  slug: string,
  matchId: string,
  gameNumber: number,
  side: string,
  assignments: Record<number, string | null>,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  return run(matchId, async () => {
    if (side !== "blue" && side !== "red") throw new MatchDayError("Pick a side.");
    await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId, { finished: true });
      const [game] = await tx
        .select()
        .from(matchGames)
        .where(and(eq(matchGames.matchId, matchId), eq(matchGames.gameNumber, gameNumber)));
      if (!game?.blueTeamId || !game.redTeamId || game.draftState !== "complete") {
        throw new MatchDayError("That game's draft isn't complete.");
      }
      const teamId = side === "blue" ? game.blueTeamId : game.redTeamId;
      if (!isAdmin && (await getCaptainedTeamId(season.id, userId)) !== teamId) {
        throw new MatchDayError("Only that team's captains can assign its picks.");
      }
      // Who actually played: the match lineup (approved subs in, sat-out players out).
      const lineups = await getMatchLineups(match);
      const lineup = (teamId === match.homeTeamId ? lineups.home : lineups.away)
        .filter((p) => !p.satOut)
        .map((p) => p.userId);
      const chosen = Object.values(assignments).filter((v): v is string => !!v);
      if (chosen.some((id) => !lineup.includes(id))) {
        throw new MatchDayError("Pick players from this match's lineup.");
      }
      if (new Set(chosen).size !== chosen.length) {
        throw new MatchDayError("Each player can only play one champion.");
      }
      const picks = await tx
        .select()
        .from(matchDraftActions)
        .where(
          and(
            eq(matchDraftActions.gameId, game.id),
            eq(matchDraftActions.side, side),
            eq(matchDraftActions.kind, "pick"),
          ),
        );
      for (const pick of picks) {
        if (!(pick.step in assignments)) continue;
        await tx
          .update(matchDraftActions)
          .set({ assignedUserId: assignments[pick.step] ?? null })
          .where(eq(matchDraftActions.id, pick.id));
      }
    });
  });
}

/**
 * A lineup player says which of their team's picks they played (null: none).
 * They can take a pick nobody's on yet or move off their own; captains fix
 * anything else with `assignPicks`. Works after the match is confirmed too.
 */
export async function claimPick(
  slug: string,
  matchId: string,
  gameNumber: number,
  step: number | null,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  return run(matchId, async () => {
    await db.transaction(async (tx) => {
      const { match } = await lockMatch(tx, slug, matchId, { finished: true });
      const [game] = await tx
        .select()
        .from(matchGames)
        .where(and(eq(matchGames.matchId, matchId), eq(matchGames.gameNumber, gameNumber)));
      if (!game?.blueTeamId || !game.redTeamId || game.draftState !== "complete") {
        throw new MatchDayError("That game's draft isn't complete.");
      }
      const lineups = await getMatchLineups(match);
      const on = (players: typeof lineups.home) =>
        players.some((p) => p.userId === userId && !p.satOut);
      const teamId = on(lineups.home)
        ? match.homeTeamId
        : on(lineups.away)
          ? match.awayTeamId
          : null;
      if (!teamId) throw new MatchDayError("Only players in this match can claim a pick.");
      const side = teamId === game.blueTeamId ? "blue" : "red";
      const picks = await tx
        .select()
        .from(matchDraftActions)
        .where(
          and(
            eq(matchDraftActions.gameId, game.id),
            eq(matchDraftActions.side, side),
            eq(matchDraftActions.kind, "pick"),
          ),
        );
      const target = step === null ? null : picks.find((p) => p.step === step);
      if (step !== null && !target) throw new MatchDayError("That isn't one of your team's picks.");
      if (target?.assignedUserId && target.assignedUserId !== userId) {
        throw new MatchDayError("A teammate already has that pick. Ask a captain to fix it.");
      }
      for (const pick of picks) {
        const next =
          pick.id === target?.id ? userId : pick.assignedUserId === userId ? null : undefined;
        if (next === undefined || next === pick.assignedUserId) continue;
        await tx
          .update(matchDraftActions)
          .set({ assignedUserId: next })
          .where(eq(matchDraftActions.id, pick.id));
      }
    });
  });
}

/**
 * A Riot lobby code for a game (phase 6): created on first ask — the season's
 * tournament too — and then reused. Lineup players (subs included) and admins
 * only (decision 17); each team's private Discord channel gets it as well.
 */
export async function getLobbyCode(
  slug: string,
  matchId: string,
  gameNumber: number,
): Promise<MatchDayActionResult> {
  const session = await requireAuth();
  const userId = session.user.id;
  const isAdmin = session.user.role === "admin";
  return run(matchId, async () => {
    if (!lobbyCodesEnabled()) throw new MatchDayError("Lobby codes aren't set up.");
    const created = await db.transaction(async (tx) => {
      const { season, match } = await lockMatch(tx, slug, matchId);
      if (!isAdmin && !inMatchLineup(await getMatchLineups(match), userId)) {
        throw new MatchDayError("Only this match's players can get the lobby code.");
      }
      const [game] = await tx
        .select()
        .from(matchGames)
        .where(and(eq(matchGames.matchId, matchId), eq(matchGames.gameNumber, gameNumber)));
      if (!game?.blueTeamId) throw new MatchDayError("That game's sides aren't set yet.");
      if (game.winnerTeamId) throw new MatchDayError("That game is already over.");
      if (game.tournamentCode) return false;

      let tournamentId = season.riotTournamentId;
      if (!tournamentId) {
        const t = await registerTournament(season.name);
        if (!t.ok) throw new MatchDayError("Riot didn't create the tournament. Try again.");
        tournamentId = t.data;
        await tx
          .update(seasons)
          .set({ riotTournamentId: tournamentId })
          .where(eq(seasons.id, season.id));
      }
      const code = await createLobbyCode(tournamentId, { matchId, gameNumber });
      if (!code.ok) throw new MatchDayError("Riot didn't create a lobby code. Try again.");
      await tx
        .update(matchGames)
        .set({ tournamentCode: code.data })
        .where(eq(matchGames.id, game.id));
      return true;
    });
    if (created) {
      syncInBackground("lobby code", () => notifyLobbyCode(matchId, gameNumber));
    }
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
