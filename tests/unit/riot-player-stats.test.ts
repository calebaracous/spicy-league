import { describe, expect, it } from "vitest";

import { kdaRatio, playerAverages, scoreboard, type PlayerLine } from "@/lib/riot-player-stats";

const line = (over: Partial<PlayerLine>): PlayerLine => ({
  userId: null,
  side: "blue",
  championKey: "Ahri",
  kills: 0,
  deaths: 0,
  assists: 0,
  cs: 0,
  gold: 0,
  damage: 0,
  visionScore: 0,
  win: false,
  ...over,
});

describe("scoreboard", () => {
  const lines = [
    line({ userId: "a", kills: 5, deaths: 1, assists: 3, gold: 10_000, win: true }),
    line({ userId: "b", championKey: "Garen", kills: 2, deaths: 2, assists: 4, win: true }),
    line({ userId: null, championKey: "Lux", side: "red", kills: 1, deaths: 7 }),
  ];

  it("hides numbers for players who haven't opted in, keeps their champion and team totals", () => {
    const [blue, red] = scoreboard(lines, (id) => id === "a");
    expect(blue.side).toBe("blue");
    expect(blue.win).toBe(true);
    expect(blue.rows[0].stats).toMatchObject({ kills: 5, deaths: 1, assists: 3, gold: 10_000 });
    expect(blue.rows[1]).toEqual({ userId: "b", championKey: "Garen", stats: null });
    expect(blue.totals).toMatchObject({ kills: 7, deaths: 3, assists: 7 });
    // Unlinked players never show their own numbers.
    expect(red.rows[0].stats).toBeNull();
    expect(red.win).toBe(false);
    expect(red.totals.deaths).toBe(7);
  });

  it("drops a side with no lines", () => {
    expect(scoreboard([lines[0]], () => true).map((s) => s.side)).toEqual(["blue"]);
  });
});

describe("kdaRatio", () => {
  it("floors deaths at 1", () => {
    expect(kdaRatio({ kills: 4, deaths: 0, assists: 2 })).toBe(6);
    expect(kdaRatio({ kills: 4, deaths: 2, assists: 2 })).toBe(3);
  });
});

describe("playerAverages", () => {
  it("averages per game and counts the record", () => {
    const a = playerAverages([
      line({ kills: 4, deaths: 2, assists: 6, cs: 200, win: true }),
      line({ kills: 2, deaths: 4, assists: 0, cs: 100 }),
    ]);
    expect(a).toMatchObject({ games: 2, wins: 1, losses: 1 });
    expect(a?.avg).toMatchObject({ kills: 3, deaths: 3, assists: 3, cs: 150 });
    expect(a?.kda).toBe(2);
  });

  it("null with no games", () => {
    expect(playerAverages([])).toBeNull();
  });
});
