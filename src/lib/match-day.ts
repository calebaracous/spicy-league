import "server-only";

import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teams } from "@/db/schema/drafts";
import {
  matchDraftActions,
  matchGames,
  matchRps,
  type MatchGame,
  type MatchRps,
} from "@/db/schema/match-day";
import { matches, type Match } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { getChampionCatalog } from "@/lib/champions";
import { logEvent, matchEventData } from "@/lib/events";
import { notifyDraftRecap, notifyMatchSides } from "@/lib/discord-notify";
import { syncInBackground } from "@/lib/discord-roles";
import { settleDraft, type DraftClock, type DraftState } from "@/lib/draft-clock";
import { availableChampions, type DraftAction } from "@/lib/draft-room";
import { fearlessApplies } from "@/lib/match-format";
import { lobbyCodesEnabled } from "@/lib/riot-tournament";
import { getCaptainedTeamId } from "@/lib/schedule";
import { getMatchLineups } from "@/lib/substitutions";
import { bestOfFor, seriesScore, type SeriesScore } from "@/lib/series";
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
type MatchTeams = Pick<Match, "id" | "homeTeamId" | "awayTeamId" | "seasonId" | "stage">;

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
): Promise<{ autoSides: number[]; draftsDone: number[] }> {
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
  const draftsDone = await settleDrafts(tx, match, now);
  return { autoSides: lapsed.map((g) => g.gameNumber), draftsDone };
}

// ── Draft room ───────────────────────────────────────────────────────────────

export function draftClock(g: MatchGame): DraftClock {
  return {
    draftState: g.draftState,
    blueReadyAt: g.blueReadyAt,
    redReadyAt: g.redReadyAt,
    draftStartsAt: g.draftStartsAt,
    stepDeadline: g.stepDeadline,
    blueHover: g.blueHover,
    redHover: g.redHover,
    draftCompletedAt: g.draftCompletedAt,
  };
}

/** Is a draft clock transition due? Cheap: needs no actions or champion list. */
function draftDue(g: MatchGame, now: Date): boolean {
  if (!g.blueTeamId) return false;
  switch (g.draftState) {
    case "waiting":
      return !!g.blueReadyAt && !!g.redReadyAt;
    case "countdown":
      return !!g.draftStartsAt && now >= g.draftStartsAt;
    case "drafting":
      return !!g.stepDeadline && now >= g.stepDeadline;
    default:
      return false;
  }
}

/** A stored draft step: the rules' shape plus who played a pick (phase 4). */
export type StoredDraftAction = DraftAction & { assignedUserId: string | null };

/** Every game's draft actions in step order, keyed by game id. */
export async function loadDraftActions(
  q: Pick<Tx, "select">,
  gameIds: string[],
): Promise<Map<string, StoredDraftAction[]>> {
  const byGame = new Map<string, StoredDraftAction[]>();
  if (gameIds.length === 0) return byGame;
  const rows = await q
    .select()
    .from(matchDraftActions)
    .where(inArray(matchDraftActions.gameId, gameIds))
    .orderBy(asc(matchDraftActions.step));
  for (const r of rows) {
    const list = byGame.get(r.gameId) ?? [];
    list.push({
      step: r.step,
      side: r.side,
      kind: r.kind,
      championKey: r.championKey,
      assignedUserId: r.assignedUserId,
    });
    byGame.set(r.gameId, list);
  }
  return byGame;
}

/**
 * What game `gameNumber` may still ban or pick: the catalogue minus this
 * game's actions, the season's disabled champions and — fearless — every
 * champion picked in an earlier game of the match. Null without a catalogue.
 */
export async function draftAvailability(
  q: Pick<Tx, "select" | "query">,
  match: MatchTeams,
  games: MatchGame[],
  actionsByGame: Map<string, StoredDraftAction[]>,
  gameNumber: number,
): Promise<((actions: readonly DraftAction[]) => string[]) | null> {
  const [catalog, season] = await Promise.all([
    getChampionCatalog(),
    q.query.seasons.findFirst({ where: eq(seasons.id, match.seasonId) }),
  ]);
  if (!catalog || !season) return null;
  const catalogKeys = catalog.champions.map((c) => c.key);
  const priorGamePicks = games
    .filter((g) => g.gameNumber < gameNumber)
    .flatMap((g) => actionsByGame.get(g.id) ?? [])
    .filter((a) => a.kind === "pick" && a.championKey)
    .map((a) => a.championKey!);
  const fearless = fearlessApplies(season, match.stage);
  return (actions) =>
    availableChampions({
      catalogKeys,
      actions,
      priorGamePicks,
      disabled: season.disabledChampions,
      fearless,
    });
}

/**
 * Draft clocks that have lapsed: countdown → drafting, and timed-out steps
 * (hover locks, else a skipped ban / a paused pick, which tells admins).
 * Without the champion list a timed-out step waits for the next tick rather
 * than guessing. Returns the game numbers whose draft the clock just completed.
 */
async function settleDrafts(tx: Tx, match: MatchTeams, now: Date): Promise<number[]> {
  const games = await tx
    .select()
    .from(matchGames)
    .where(eq(matchGames.matchId, match.id))
    .orderBy(asc(matchGames.gameNumber));
  const due = games.filter((g) => draftDue(g, now));
  const done: number[] = [];
  if (due.length === 0) return done;
  const actionsByGame = await loadDraftActions(
    tx,
    games.map((g) => g.id),
  );
  for (const g of due) {
    const actions = actionsByGame.get(g.id) ?? [];
    let available: (a: readonly DraftAction[]) => readonly string[] = () => [];
    if (g.draftState === "drafting") {
      const fn = await draftAvailability(tx, match, games, actionsByGame, g.gameNumber);
      if (!fn) continue;
      available = fn;
    }
    const { clock, taken, paused } = settleDraft(draftClock(g), actions, now, available);
    await tx.update(matchGames).set(clock).where(eq(matchGames.id, g.id));
    if (paused) {
      await logEvent("match.draft_paused", {
        seasonId: match.seasonId,
        data: { ...(await matchEventData(match.id)), gameNumber: g.gameNumber },
      });
    }
    if (clock.draftState === "complete") done.push(g.gameNumber);
    if (taken.length) {
      await tx
        .insert(matchDraftActions)
        .values(taken.map((a) => ({ ...a, gameId: g.id, auto: true })));
      actionsByGame.set(g.id, [...actions, ...taken.map((a) => ({ ...a, assignedUserId: null }))]);
    }
  }
  return done;
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
  const draftIsDue = games.some((g) => draftDue(g, now));
  if (!rpsDue && !sideDue && !draftIsDue) return;

  const settled = await db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: matches.id, state: matches.state })
      .from(matches)
      .where(eq(matches.id, match.id))
      .for("update", { skipLocked: true });
    if (!locked || locked.state !== "scheduled") return null;
    return settleMatchDay(tx, match, now);
  });
  for (const gameNumber of settled?.autoSides ?? []) {
    syncInBackground("match sides", () => notifyMatchSides(match.id, gameNumber));
  }
  for (const gameNumber of settled?.draftsDone ?? []) {
    syncInBackground("draft recap", () => notifyDraftRecap(match.id, gameNumber));
  }
}

// ── Snapshot ─────────────────────────────────────────────────────────────────

export type MatchDayViewer = {
  userId: string | null;
  /** The match team this viewer captains (either of a duo), if any. */
  teamId: string | null;
  isAdmin: boolean;
  /** In either team's lineup for this match (subs included): sees lobby codes. */
  inLineup: boolean;
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
    winnerTeamId: string | null;
    /** Who recorded the winner (display name). */
    resultReportedBy: string | null;
    resultFlagged: boolean;
    /** Riot lobby code; only sent to lineup players and admins (decision 17). */
    tournamentCode: string | null;
    draft: {
      state: DraftState;
      blueReady: boolean;
      redReady: boolean;
      startsAt: string | null;
      stepDeadline: string | null;
      blueHover: string | null;
      redHover: string | null;
      actions: StoredDraftAction[];
    };
  }[];
  /** Draft room rules: fearless across this match's games, season-disabled champions. */
  fearless: boolean;
  disabledChampions: string[];
  /** Riot Tournament API lobby codes are on (a provider is configured). */
  lobbyCodes: boolean;
  /** Series length and the running score from game results. */
  bestOf: number;
  series: SeriesScore;
  viewer: MatchDayViewer & { myThrow: RpsThrow | null };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The signed-in viewer's role in this match's side selection. */
/** Whether `userId` plays in this match (roster minus sat-out, plus approved subs). */
export function inMatchLineup(
  lineups: {
    home: { userId: string; satOut: boolean }[];
    away: { userId: string; satOut: boolean }[];
  },
  userId: string | null,
): boolean {
  return [...lineups.home, ...lineups.away].some((p) => p.userId === userId && !p.satOut);
}

export async function getMatchDayViewer(match: Match): Promise<MatchDayViewer> {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const [captained, lineups] = userId
    ? await Promise.all([getCaptainedTeamId(match.seasonId, userId), getMatchLineups(match)])
    : [null, null];
  return {
    userId,
    teamId: captained === match.homeTeamId || captained === match.awayTeamId ? captained : null,
    isAdmin: session?.user?.role === "admin",
    inLineup: !!lineups && inMatchLineup(lineups, userId),
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

  const [season, teamRows, rps, games] = await Promise.all([
    db.query.seasons.findFirst({ where: eq(seasons.id, match.seasonId) }),
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
  const actionsByGame = await loadDraftActions(
    db,
    games.map((g) => g.id),
  );

  // Seat holders and game-result reporters, for display names.
  const seatIds = [
    rps?.homeUserId,
    rps?.awayUserId,
    ...games.map((g) => g.resultReportedBy),
  ].filter((id): id is string => !!id);
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

  const bestOf = season ? bestOfFor(season, match.stage) : 1;
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
      winnerTeamId: g.winnerTeamId,
      resultReportedBy: seat(g.resultReportedBy)?.name ?? null,
      resultFlagged: g.resultFlaggedAt !== null,
      tournamentCode: viewer.inLineup || viewer.isAdmin ? g.tournamentCode : null,
      draft: {
        state: g.draftState,
        blueReady: !!g.blueReadyAt,
        redReady: !!g.redReadyAt,
        startsAt: iso(g.draftStartsAt),
        stepDeadline: iso(g.stepDeadline),
        blueHover: g.blueHover,
        redHover: g.redHover,
        actions: actionsByGame.get(g.id) ?? [],
      },
    })),
    fearless: season ? fearlessApplies(season, match.stage) : false,
    disabledChampions: season?.disabledChampions ?? [],
    lobbyCodes: lobbyCodesEnabled(),
    bestOf,
    series: seriesScore(bestOf, games, match),
    viewer: { ...viewer, myThrow },
  };
}

/** True while something on the card is ticking — the stream polls faster. */
export function matchDayIsHot(snap: MatchDaySnapshot): boolean {
  if (!snap.open) return false;
  const r = snap.rps;
  if (r && (r.state === "throwing" || r.state === "revealed")) return true;
  if (r && r.state === "waiting" && (r.home.ready || r.away.ready)) return true;
  return snap.games.some(
    (g) =>
      !g.blueTeamId ||
      g.draft.state === "countdown" ||
      g.draft.state === "drafting" ||
      (g.draft.state === "waiting" && (g.draft.blueReady || g.draft.redReady)),
  );
}
