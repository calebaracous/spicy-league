/**
 * Pure helpers for match results and labels, shared by the match pages,
 * standings, player stats and match history.
 *
 * A Bo2 group match (`seasons.groupBestOf = 2`) can end 1–1. A draw is stored
 * as `winnerTeamId = null` with equal, non-null scores; a match with no winner
 * and no scores simply hasn't been reported.
 */
import type { MatchStage } from "@/db/schema/matches";

type ResultFields = {
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
};

export type MatchResult = "win" | "draw" | "loss";

export function isDraw(m: Omit<ResultFields, "homeTeamId" | "awayTeamId">): boolean {
  return (
    m.winnerTeamId === null &&
    m.homeScore !== null &&
    m.awayScore !== null &&
    m.homeScore === m.awayScore
  );
}

/** True once a match has a winner or is a draw. */
export function hasResult(m: Omit<ResultFields, "homeTeamId" | "awayTeamId">): boolean {
  return m.winnerTeamId !== null || isDraw(m);
}

/** The result from one team's side, or null if there isn't one yet. */
export function resultFor(m: ResultFields, teamId: string): MatchResult | null {
  if (m.winnerTeamId) return m.winnerTeamId === teamId ? "win" : "loss";
  return isDraw(m) ? "draw" : null;
}

/** Bo2 group reporting: the three possible series scores (home–away). */
export const BO2_RESULTS = {
  "home-2-0": { homeScore: 2, awayScore: 0 },
  "draw-1-1": { homeScore: 1, awayScore: 1 },
  "away-0-2": { homeScore: 0, awayScore: 2 },
} as const;
export type Bo2Result = keyof typeof BO2_RESULTS;

/** Admin season form options for `seasons.groupBestOf`. */
export const GROUP_BEST_OF_OPTIONS = [
  { value: 1, label: "Best of 1 (report the winner)" },
  { value: 2, label: "Best of 2 (2–0, 1–1 draw or 0–2)" },
] as const;

/** "Best of 3". */
export function bestOfLabel(n: number): string {
  return `Best of ${n}`;
}

/**
 * Admin season form options for `seasons.playoffBestOf` (semis) and
 * `seasons.finalBestOf`. Odd only: a playoff series needs a winner.
 */
export const PLAYOFF_BEST_OF_OPTIONS = [1, 3, 5].map((value) => ({
  value,
  label: bestOfLabel(value),
}));

type SeasonFormat = { groupBestOf: number; playoffBestOf: number; finalBestOf: number };

/** One-line season format, for the home page and season page. */
export function formatStructure(season: SeasonFormat): string {
  const group =
    season.groupBestOf === 2
      ? "Round-robin group stage of best-of-2 series (1–1 draws count)"
      : "Round-robin group stage";
  const playoffs =
    season.playoffBestOf === season.finalBestOf
      ? `best-of-${season.finalBestOf} semifinals and final`
      : `best-of-${season.playoffBestOf} semifinals, best-of-${season.finalBestOf} final`;
  return `${group}, then the top 4 play single-elimination playoffs (${playoffs})`;
}

/**
 * `seasons.fearlessDraft`, explained once for every page and Discord post
 * that shows it. Lowercase, no full stop: callers write "Fearless draft: …".
 */
export const FEARLESS_DRAFT_RULE =
  "once a champion is picked in a series, neither team can pick it again in that series";

/**
 * Whether a match's series is long enough for fearless draft to matter.
 * Tiebreakers are a single game, so it never applies to them.
 */
export function fearlessApplies(season: { fearlessDraft: boolean }, stage: MatchStage): boolean {
  return season.fearlessDraft && stage !== "tiebreaker";
}

export function roundLabel(stage: MatchStage, round: number): string {
  if (stage === "final") return "Final";
  if (stage === "semis") return "Semifinal";
  if (stage === "tiebreaker") return "Tiebreaker";
  return `Round ${round}`;
}
