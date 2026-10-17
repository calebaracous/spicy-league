import { describe, expect, it } from "vitest";

import {
  groupCaptainTeams,
  PICKS_PER_TEAM,
  picksForTeam,
  snakeOrder,
  teamForPick,
  TEAM_SIZE,
  totalPicks,
} from "@/lib/draft";

/** Full pick order for `n` solo-captain teams, as 1-indexed captain orders. */
function order(n: number): number[] {
  return snakeOrder(Array(n).fill(PICKS_PER_TEAM)).map((i) => i + 1);
}

describe("snakeOrder, solo captains", () => {
  it("4 captains: forward, reverse, forward, reverse", () => {
    expect(order(4)).toEqual([1, 2, 3, 4, 4, 3, 2, 1, 1, 2, 3, 4, 4, 3, 2, 1]);
  });

  it("2 captains", () => {
    expect(order(2)).toEqual([1, 2, 2, 1, 1, 2, 2, 1]);
  });

  it("3 captains", () => {
    expect(order(3)).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 2, 1]);
  });

  it.each([2, 3, 4, 5, 6, 8])(
    "%i captains: every captain gets exactly PICKS_PER_TEAM picks",
    (n) => {
      const counts = new Map<number, number>();
      for (const c of order(n)) counts.set(c, (counts.get(c) ?? 0) + 1);
      expect([...counts.keys()].sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i + 1),
      );
      for (const count of counts.values()) expect(count).toBe(PICKS_PER_TEAM);
    },
  );

  it.each([2, 3, 4, 6])("%i captains: the same captain picks back-to-back at each turn", (n) => {
    const o = order(n);
    for (let round = 1; round < PICKS_PER_TEAM; round++) {
      const lastOfRound = round * n - 1; // 0-indexed
      expect(o[lastOfRound]).toBe(o[lastOfRound + 1]);
    }
  });
});

describe("snakeOrder, duo captains", () => {
  it("6 duo teams (Season 11): 3 rounds, 18 picks", () => {
    const o = snakeOrder(Array(6).fill(picksForTeam(2)));
    expect(o).toHaveLength(18);
    expect(o.map((i) => i + 1)).toEqual([1, 2, 3, 4, 5, 6, 6, 5, 4, 3, 2, 1, 1, 2, 3, 4, 5, 6]);
  });

  it("mixed solo and duo: full teams sit out the last round", () => {
    // Teams 1 and 3 are solo (4 picks), team 2 is a duo (3 picks).
    expect(snakeOrder([4, 3, 4]).map((i) => i + 1)).toEqual([1, 2, 3, 3, 2, 1, 1, 2, 3, 3, 1]);
  });

  it("every team ends up with TEAM_SIZE players", () => {
    const sizes = [1, 2, 2, 1, 2];
    const o = snakeOrder(sizes.map(picksForTeam));
    sizes.forEach((captains, i) => {
      expect(captains + o.filter((t) => t === i).length).toBe(TEAM_SIZE);
    });
  });
});

describe("groupCaptainTeams", () => {
  const rows = [
    { userId: "raze", displayName: "RAZE", captainOrder: 1 },
    { userId: "jamileo", displayName: "JAMILEO", captainOrder: 1 },
    { userId: "egor", displayName: "EGOR", captainOrder: 2 },
  ];

  it("pairs captains that share a captainOrder; the first row is primary", () => {
    const teams = groupCaptainTeams(rows);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toMatchObject({
      captainOrder: 1,
      primaryUserId: "raze",
      displayName: "RAZE & JAMILEO",
      picks: 3,
    });
    expect(teams[1]).toMatchObject({ primaryUserId: "egor", displayName: "EGOR", picks: 4 });
  });

  it("totals and on-the-clock follow the grouped teams", () => {
    const teams = groupCaptainTeams(rows);
    expect(totalPicks(teams)).toBe(7);
    expect(teamForPick(teams, 1)?.primaryUserId).toBe("raze");
    expect(teamForPick(teams, 2)?.primaryUserId).toBe("egor");
    expect(teamForPick(teams, 3)?.primaryUserId).toBe("egor");
    expect(teamForPick(teams, 7)?.primaryUserId).toBe("egor");
    expect(teamForPick(teams, 8)).toBeNull();
  });
});
