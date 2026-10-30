// Whether a scheduled match is being played right now (match day underway),
// for the "Live · Game 2 · 1–0" badges on the match page, schedule, season
// page and home page. Pure; the loader is `loadLiveMatches` in match-day.ts.

export type LiveMatch = {
  /** The game being played or having its side picked; null while RPS decides game 1's side. */
  gameNumber: number | null;
  homeWins: number;
  awayWins: number;
};

type RpsState = "waiting" | "throwing" | "revealed" | "done";

/**
 * Live once rock paper scissors has a round going (or any game exists), and
 * only while the match is still scheduled — a decided series confirms itself.
 * Captains readying up for RPS doesn't count yet.
 */
export function liveMatchStatus({
  matchState,
  rpsState,
  games,
  homeTeamId,
  awayTeamId,
}: {
  matchState: string;
  rpsState: RpsState | null | undefined;
  games: readonly { gameNumber: number; winnerTeamId: string | null }[];
  homeTeamId: string;
  awayTeamId: string;
}): LiveMatch | null {
  if (matchState !== "scheduled") return null;
  const homeWins = games.filter((g) => g.winnerTeamId === homeTeamId).length;
  const awayWins = games.filter((g) => g.winnerTeamId === awayTeamId).length;
  if (games.length > 0) {
    const ordered = [...games].sort((a, b) => a.gameNumber - b.gameNumber);
    const current = ordered.find((g) => !g.winnerTeamId) ?? ordered.at(-1)!;
    return { gameNumber: current.gameNumber, homeWins, awayWins };
  }
  if (rpsState && rpsState !== "waiting") return { gameNumber: null, homeWins, awayWins };
  return null;
}

/** "Live · Game 2 · 1–0" (home–away), or "Live · picking sides" before game 1. */
export function liveMatchLabel(live: LiveMatch): string {
  return live.gameNumber === null
    ? "Live · picking sides"
    : `Live · Game ${live.gameNumber} · ${live.homeWins}–${live.awayWins}`;
}
