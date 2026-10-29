import { describe, expect, it } from "vitest";

import { bestOfFor, loserOf, seriesScore } from "@/lib/series";

const TEAMS = { homeTeamId: "H", awayTeamId: "A" };
const games = (...winners: (string | null)[]) => winners.map((winnerTeamId) => ({ winnerTeamId }));

describe("bestOfFor", () => {
  const season = { groupBestOf: 2, playoffBestOf: 3, finalBestOf: 5 };
  it("reads the season per stage; tiebreakers are Bo1", () => {
    expect(bestOfFor(season, "group")).toBe(2);
    expect(bestOfFor(season, "tiebreaker")).toBe(1);
    expect(bestOfFor(season, "semis")).toBe(3);
    expect(bestOfFor(season, "final")).toBe(5);
  });
});

describe("seriesScore", () => {
  it("Bo1 ends on the first result", () => {
    expect(seriesScore(1, games(), TEAMS)).toMatchObject({ over: false, winnerTeamId: null });
    expect(seriesScore(1, games("A"), TEAMS)).toEqual({
      homeWins: 0,
      awayWins: 1,
      played: 1,
      over: true,
      winnerTeamId: "A",
    });
  });

  it("Bo2 always plays both and can end level", () => {
    expect(seriesScore(2, games("H"), TEAMS).over).toBe(false);
    expect(seriesScore(2, games("H", "H"), TEAMS)).toMatchObject({ over: true, winnerTeamId: "H" });
    expect(seriesScore(2, games("H", "A"), TEAMS)).toMatchObject({
      homeWins: 1,
      awayWins: 1,
      over: true,
      winnerTeamId: null,
    });
  });

  it("Bo3 stops at two wins", () => {
    expect(seriesScore(3, games("H", "H"), TEAMS)).toMatchObject({ over: true, winnerTeamId: "H" });
    expect(seriesScore(3, games("H", "A"), TEAMS).over).toBe(false);
    expect(seriesScore(3, games("H", "A", "A"), TEAMS)).toMatchObject({
      homeWins: 1,
      awayWins: 2,
      over: true,
      winnerTeamId: "A",
    });
  });

  it("Bo5 needs three", () => {
    expect(seriesScore(5, games("H", "H", "A", "A"), TEAMS).over).toBe(false);
    expect(seriesScore(5, games("H", "H", "A", "A", "H"), TEAMS)).toMatchObject({
      homeWins: 3,
      over: true,
      winnerTeamId: "H",
    });
  });

  it("ignores games without a result yet", () => {
    expect(seriesScore(3, games("H", null), TEAMS)).toMatchObject({ played: 1, over: false });
  });
});

describe("loserOf", () => {
  it("is the other team", () => {
    expect(loserOf("H", TEAMS)).toBe("A");
    expect(loserOf("A", TEAMS)).toBe("H");
  });
});
