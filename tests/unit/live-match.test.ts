import { describe, expect, it } from "vitest";

import { liveMatchLabel, liveMatchStatus } from "@/lib/live-match";

const base = { matchState: "scheduled", homeTeamId: "H", awayTeamId: "A" };

describe("liveMatchStatus", () => {
  it("isn't live before RPS starts (readying up doesn't count)", () => {
    expect(liveMatchStatus({ ...base, rpsState: null, games: [] })).toBeNull();
    expect(liveMatchStatus({ ...base, rpsState: "waiting", games: [] })).toBeNull();
  });

  it("is live while RPS decides game 1's side", () => {
    expect(liveMatchStatus({ ...base, rpsState: "throwing", games: [] })).toEqual({
      gameNumber: null,
      homeWins: 0,
      awayWins: 0,
    });
  });

  it("points at the first game without a winner, with the running score", () => {
    const games = [
      { gameNumber: 2, winnerTeamId: null },
      { gameNumber: 1, winnerTeamId: "H" },
    ];
    expect(liveMatchStatus({ ...base, rpsState: "done", games })).toEqual({
      gameNumber: 2,
      homeWins: 1,
      awayWins: 0,
    });
  });

  it("is never live once the match has a result", () => {
    const games = [{ gameNumber: 1, winnerTeamId: "H" }];
    expect(liveMatchStatus({ ...base, matchState: "confirmed", rpsState: "done", games })).toBe(
      null,
    );
  });
});

describe("liveMatchLabel", () => {
  it("names the game and the home–away score", () => {
    expect(liveMatchLabel({ gameNumber: 2, homeWins: 1, awayWins: 0 })).toBe("Live · Game 2 · 1–0");
    expect(liveMatchLabel({ gameNumber: null, homeWins: 0, awayWins: 0 })).toBe(
      "Live · picking sides",
    );
  });
});
