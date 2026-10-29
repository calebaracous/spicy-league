// Rock-paper-scissors for game 1's side pick (docs/MATCH-DAY.md). Pure: no db
// or next imports, so the rules are unit-tested and the board can share the
// constants.

export type RpsThrow = "rock" | "paper" | "scissors";
export type RpsOutcome = "home" | "away" | "tie" | "void";
export type RpsRound = {
  round: number;
  home: RpsThrow | null;
  away: RpsThrow | null;
  outcome: RpsOutcome;
};

export const RPS_THROWS: readonly RpsThrow[] = ["rock", "paper", "scissors"];
export const RPS_THROW_MS = 10_000;
export const RPS_REVEAL_MS = 3_000;
/** The RPS winner's side pick for game 1. */
export const SIDE_PICK_MS = 60_000;
/** The loser of game N-1 picks game N's side: more time, they may want to talk it over. */
export const LOSER_SIDE_PICK_MS = 5 * 60_000;

/** How long game N's side pick lasts. */
export function sidePickMs(gameNumber: number): number {
  return gameNumber === 1 ? SIDE_PICK_MS : LOSER_SIDE_PICK_MS;
}
/** Both captains AFK this many rounds in a row → back to ready-up. */
export const RPS_MAX_DOUBLE_VOIDS = 3;

const BEATS: Record<RpsThrow, RpsThrow> = { rock: "scissors", paper: "rock", scissors: "paper" };

export function isRpsThrow(v: unknown): v is RpsThrow {
  return typeof v === "string" && (RPS_THROWS as readonly string[]).includes(v);
}

/** A missing throw voids the round (replayed); otherwise the usual rules. */
export function roundOutcome(home: RpsThrow | null, away: RpsThrow | null): RpsOutcome {
  if (!home || !away) return "void";
  if (home === away) return "tie";
  return BEATS[home] === away ? "home" : "away";
}

/** The match_rps fields the state machine reads and writes. */
export type RpsCore = {
  state: "waiting" | "throwing" | "revealed" | "done";
  homeUserId: string | null;
  awayUserId: string | null;
  homeReadyAt: Date | null;
  awayReadyAt: Date | null;
  round: number;
  throwDeadline: Date | null;
  revealUntil: Date | null;
  homeThrow: RpsThrow | null;
  awayThrow: RpsThrow | null;
  history: RpsRound[];
  winnerTeamId: string | null;
};

function startRound(row: RpsCore, now: Date): Partial<RpsCore> {
  return {
    state: "throwing",
    round: row.round + 1,
    throwDeadline: new Date(now.getTime() + RPS_THROW_MS),
    revealUntil: null,
    homeThrow: null,
    awayThrow: null,
  };
}

function doubleVoidStreak(history: RpsRound[]): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const r = history[i];
    if (r.outcome !== "void" || r.home || r.away) break;
    n++;
  }
  return n;
}

/**
 * One transition that is due at `now`, or null when nothing is. Callers apply
 * the patch and call again until null — deadlines are lazy (no cron), so a
 * late poll may owe more than one step. New deadlines count from `now`, not
 * from the lapsed one, so catching up never chains through phantom rounds.
 */
export function advanceRps(
  row: RpsCore,
  now: Date,
  teams: { homeTeamId: string; awayTeamId: string },
): Partial<RpsCore> | null {
  switch (row.state) {
    case "waiting":
      return row.homeReadyAt && row.awayReadyAt ? startRound(row, now) : null;
    case "throwing": {
      const bothIn = row.homeThrow !== null && row.awayThrow !== null;
      const lapsed = row.throwDeadline !== null && now >= row.throwDeadline;
      if (!bothIn && !lapsed) return null;
      const outcome = roundOutcome(row.homeThrow, row.awayThrow);
      return {
        state: "revealed",
        revealUntil: new Date(now.getTime() + RPS_REVEAL_MS),
        history: [
          ...row.history,
          { round: row.round, home: row.homeThrow, away: row.awayThrow, outcome },
        ],
        winnerTeamId:
          outcome === "home" ? teams.homeTeamId : outcome === "away" ? teams.awayTeamId : null,
      };
    }
    case "revealed": {
      if (row.revealUntil && now < row.revealUntil) return null;
      if (row.winnerTeamId) return { state: "done" };
      if (doubleVoidStreak(row.history) >= RPS_MAX_DOUBLE_VOIDS) {
        return {
          state: "waiting",
          homeUserId: null,
          awayUserId: null,
          homeReadyAt: null,
          awayReadyAt: null,
          throwDeadline: null,
          revealUntil: null,
          homeThrow: null,
          awayThrow: null,
        };
      }
      return startRound(row, now);
    }
    case "done":
      return null;
  }
}

/** Applies every due transition. */
export function settleRps(
  row: RpsCore,
  now: Date,
  teams: { homeTeamId: string; awayTeamId: string },
): { row: RpsCore; changed: boolean } {
  let cur = row;
  let changed = false;
  // A handful of steps at most (throwing → revealed → next round); the cap is
  // a guard against a rules bug looping forever inside a transaction.
  for (let i = 0; i < 8; i++) {
    const patch = advanceRps(cur, now, teams);
    if (!patch) break;
    cur = { ...cur, ...patch };
    changed = true;
  }
  return { row: cur, changed };
}

const GRIEF_LINES = [
  "{name} griefed RPS. Unbelievable.",
  "{name} forgot their hand at home. Griefer.",
  "{name} is AFK in rock paper scissors. Reported for griefing.",
  "{name} took the 10 seconds to tab out. Absolute griefer.",
  "{name} didn't throw. Somebody check their ping (and their heart).",
  "{name} went 0/0/0 in RPS. Griefer behaviour.",
];

/** The roast for a captain who let the clock run out; stable per round. */
export function griefLine(name: string, round: number): string {
  return GRIEF_LINES[round % GRIEF_LINES.length].replace("{name}", name);
}

export function randomSide(rng: () => number = Math.random): "blue" | "red" {
  return rng() < 0.5 ? "blue" : "red";
}
