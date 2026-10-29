// Series length and score from per-game results (docs/MATCH-DAY.md, phase 2).
// Pure: shared by the match-day actions, the card and the unit tests.

type Stage = "group" | "tiebreaker" | "semis" | "final";
type SeasonFormat = { groupBestOf: number; playoffBestOf: number; finalBestOf: number };
type MatchTeams = { homeTeamId: string; awayTeamId: string };

/** How many games a match's series is: per season for group/semis/final, tiebreakers are Bo1. */
export function bestOfFor(season: SeasonFormat, stage: Stage): number {
  switch (stage) {
    case "group":
      return season.groupBestOf;
    case "tiebreaker":
      return 1;
    case "semis":
      return season.playoffBestOf;
    case "final":
      return season.finalBestOf;
  }
}

export type SeriesScore = {
  homeWins: number;
  awayWins: number;
  /** Games with a recorded winner. */
  played: number;
  over: boolean;
  /** Set once over, unless it ended level (a Bo2 1–1 draw). */
  winnerTeamId: string | null;
};

/**
 * Even lengths (the Bo2 group) always play every game and can end level;
 * odd lengths stop as soon as a team has a majority.
 */
export function seriesScore(
  bestOf: number,
  games: readonly { winnerTeamId: string | null }[],
  teams: MatchTeams,
): SeriesScore {
  const homeWins = games.filter((g) => g.winnerTeamId === teams.homeTeamId).length;
  const awayWins = games.filter((g) => g.winnerTeamId === teams.awayTeamId).length;
  const played = homeWins + awayWins;
  const over = bestOf % 2 === 0 ? played >= bestOf : Math.max(homeWins, awayWins) > bestOf / 2;
  const winnerTeamId = !over
    ? null
    : homeWins > awayWins
      ? teams.homeTeamId
      : awayWins > homeWins
        ? teams.awayTeamId
        : null;
  return { homeWins, awayWins, played, over, winnerTeamId };
}

/** The loser of a game picks the next game's side. */
export function loserOf(winnerTeamId: string, teams: MatchTeams): string {
  return winnerTeamId === teams.homeTeamId ? teams.awayTeamId : teams.homeTeamId;
}
