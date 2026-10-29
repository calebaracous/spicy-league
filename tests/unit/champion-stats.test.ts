import { describe, expect, it } from "vitest";

import {
  championStats,
  percent,
  playerChampions,
  sideStats,
  type StatsGame,
} from "@/lib/champion-stats";

const pick = (side: "blue" | "red", championKey: string, assignedUserId: string | null = null) => ({
  side,
  kind: "pick" as const,
  championKey,
  assignedUserId,
});
const ban = (side: "blue" | "red", championKey: string | null) => ({
  side,
  kind: "ban" as const,
  championKey,
  assignedUserId: null,
});

// A blue, B red, A wins; then B blue, A red, B wins (A won RPS in game 1).
const GAMES: StatsGame[] = [
  {
    blueTeamId: "A",
    redTeamId: "B",
    winnerTeamId: "A",
    gameNumber: 1,
    sideChosenVia: "rps",
    sideChooserTeamId: "A",
    actions: [ban("blue", "Zed"), ban("red", null), pick("blue", "Ahri", "u1"), pick("red", "Lux")],
  },
  {
    blueTeamId: "B",
    redTeamId: "A",
    winnerTeamId: "B",
    gameNumber: 2,
    sideChosenVia: "loser",
    sideChooserTeamId: "B",
    actions: [ban("blue", "Ahri"), pick("blue", "Zed"), pick("red", "Lux", "u1")],
  },
  // Result not recorded yet: counts picks/bans, no record.
  {
    blueTeamId: "A",
    redTeamId: "C",
    winnerTeamId: null,
    gameNumber: 1,
    sideChosenVia: "auto",
    sideChooserTeamId: "C",
    actions: [pick("blue", "Lux")],
  },
];

describe("championStats", () => {
  it("counts picks, bans, presence and record across the season", () => {
    const { games, rows } = championStats(GAMES);
    expect(games).toBe(3);
    const lux = rows.find((r) => r.key === "Lux")!;
    // Lux lost both decided games (picked by the losing side each time).
    expect(lux).toMatchObject({
      picks: 3,
      bans: 0,
      presence: 3,
      wins: 0,
      losses: 2,
      bluePicks: 1,
      redPicks: 2,
    });
    const ahri = rows.find((r) => r.key === "Ahri")!;
    expect(ahri).toMatchObject({ picks: 1, bans: 1, presence: 2, wins: 1, losses: 0 });
    // Most present first; skipped bans don't create rows.
    expect(rows[0].key).toBe("Lux");
    expect(rows.some((r) => r.key === "")).toBe(false);
  });

  it("filters to one team's picks and bans, and lists bans against them", () => {
    const { games, rows, bannedAgainst } = championStats(GAMES, { teamId: "B" });
    expect(games).toBe(2);
    expect(rows.map((r) => r.key).sort()).toEqual(["Ahri", "Lux", "Zed"]);
    expect(rows.find((r) => r.key === "Zed")).toMatchObject({ picks: 1, wins: 1 });
    expect(rows.find((r) => r.key === "Ahri")).toMatchObject({ bans: 1, picks: 0 });
    expect(bannedAgainst).toEqual([{ key: "Zed", bans: 1 }]);
  });
});

describe("sideStats", () => {
  it("counts only games with a result", () => {
    expect(sideStats(GAMES)).toEqual({
      played: 2,
      blueWins: 2,
      redWins: 0,
      rpsGames: 1,
      rpsWins: 1,
    });
  });
});

describe("playerChampions", () => {
  it("lists a player's assigned picks with their record", () => {
    expect(playerChampions(GAMES, "u1")).toEqual([
      { key: "Ahri", games: 1, wins: 1, losses: 0 },
      { key: "Lux", games: 1, wins: 0, losses: 1 },
    ]);
  });
});

describe("percent", () => {
  it("rounds, and dashes an empty denominator", () => {
    expect(percent(2, 3)).toBe("67%");
    expect(percent(0, 0)).toBe("—");
  });
});
