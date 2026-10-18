import { describe, expect, it } from "vitest";

import { discordTime, matchThreadName, resultLine, standingsTable } from "@/lib/discord-format";

describe("discord-format", () => {
  it("discordTime uses unix seconds", () => {
    expect(discordTime(new Date("2026-12-12T00:00:00Z"))).toBe("<t:1797033600:F>");
    expect(discordTime(new Date("2026-12-12T00:00:00Z"), "R")).toBe("<t:1797033600:R>");
  });

  it("matchThreadName caps at 100 chars", () => {
    expect(matchThreadName("Round 1", "A", "B")).toBe("Round 1 · A vs B");
    expect(matchThreadName("Round 1", "x".repeat(80), "y".repeat(80))).toHaveLength(100);
  });

  it("resultLine covers wins, draws and score-less results", () => {
    const base = { home: "Gucci", away: "Cash" };
    expect(resultLine({ ...base, homeScore: 2, awayScore: 0, winner: "Gucci" })).toBe(
      "Gucci 2–0 Cash",
    );
    expect(resultLine({ ...base, homeScore: 1, awayScore: 1, winner: null })).toBe(
      "Gucci 1–1 Cash (draw)",
    );
    expect(resultLine({ ...base, homeScore: null, awayScore: null, winner: "Cash" })).toBe(
      "Cash won",
    );
  });

  it("standingsTable lines up Bo2 and Bo1 tables", () => {
    const rows = [
      {
        rank: 1,
        tied: false,
        teamName: "Gucci",
        wins: 2,
        draws: 1,
        losses: 0,
        gamesWon: 5,
        gamesLost: 1,
      },
      {
        rank: 2,
        tied: true,
        teamName: "Cash",
        wins: 0,
        draws: 1,
        losses: 2,
        gamesWon: 1,
        gamesLost: 5,
      },
    ];
    expect(standingsTable(rows, true).split("\n")).toEqual([
      "#   Team    W  D  L  Maps",
      "1   Gucci   2  1  0  5–1",
      "2=  Cash    0  1  2  1–5",
    ]);
    expect(standingsTable(rows, false).split("\n")[1]).toBe("1   Gucci   2  0    +4");
  });
});
