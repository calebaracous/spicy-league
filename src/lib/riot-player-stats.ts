import type { DraftSide } from "@/lib/draft-room";

// Riot per-player stats from tournament games (docs/MATCH-DAY.md, phase 6),
// shaped for display. Pure. Decision 20: a player's own numbers are public
// only if they opted in (users.statsOptInAt); team totals and the champion
// they played are public either way.

export type PlayerLine = {
  userId: string | null;
  side: DraftSide;
  championKey: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  visionScore: number;
  win: boolean;
};

export type StatNumbers = Pick<
  PlayerLine,
  "kills" | "deaths" | "assists" | "cs" | "gold" | "damage" | "visionScore"
>;

export type ScoreboardRow = {
  userId: string | null;
  championKey: string;
  /** Null when the player hasn't opted in (or isn't linked to anyone). */
  stats: StatNumbers | null;
};

export type ScoreboardSide = {
  side: DraftSide;
  win: boolean;
  rows: ScoreboardRow[];
  totals: StatNumbers;
};

const NUMBERS = ["kills", "deaths", "assists", "cs", "gold", "damage", "visionScore"] as const;

function sum(lines: readonly StatNumbers[]): StatNumbers {
  const out = { kills: 0, deaths: 0, assists: 0, cs: 0, gold: 0, damage: 0, visionScore: 0 };
  for (const l of lines) for (const k of NUMBERS) out[k] += l[k];
  return out;
}

function numbers(l: StatNumbers): StatNumbers {
  return Object.fromEntries(NUMBERS.map((k) => [k, l[k]])) as StatNumbers;
}

/** One game's scoreboard: blue then red, players' own numbers only if `visible`. */
export function scoreboard(
  lines: readonly PlayerLine[],
  visible: (userId: string) => boolean,
): ScoreboardSide[] {
  return (["blue", "red"] as const)
    .map((side) => {
      const mine = lines.filter((l) => l.side === side);
      return {
        side,
        win: mine.some((l) => l.win),
        rows: mine.map((l) => ({
          userId: l.userId,
          championKey: l.championKey,
          stats: l.userId && visible(l.userId) ? numbers(l) : null,
        })),
        totals: sum(mine),
      };
    })
    .filter((s) => s.rows.length > 0);
}

/** (K + A) / D, with deaths floored at 1 like most stat sites. */
export function kdaRatio(s: Pick<StatNumbers, "kills" | "deaths" | "assists">): number {
  return (s.kills + s.assists) / Math.max(1, s.deaths);
}

export type PlayerAverages = {
  games: number;
  wins: number;
  losses: number;
  /** Per-game averages. */
  avg: StatNumbers;
  kda: number;
};

/** A player's averages over their games, or null with none. */
export function playerAverages(lines: readonly PlayerLine[]): PlayerAverages | null {
  if (lines.length === 0) return null;
  const total = sum(lines);
  const n = lines.length;
  const avg = Object.fromEntries(NUMBERS.map((k) => [k, total[k] / n])) as StatNumbers;
  const wins = lines.filter((l) => l.win).length;
  return { games: n, wins, losses: n - wins, avg, kda: kdaRatio(total) };
}
