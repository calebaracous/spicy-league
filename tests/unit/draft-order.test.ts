import { describe, expect, it } from "vitest";

import { captainOrderForPick, PICKS_PER_TEAM, totalPicks } from "@/lib/draft";

/** Full pick order for a draft, as a list of 1-indexed captain orders. */
function order(captains: number): number[] {
  return Array.from({ length: totalPicks(captains) }, (_, i) =>
    captainOrderForPick(i + 1, captains),
  );
}

describe("captainOrderForPick (snake)", () => {
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

describe("totalPicks", () => {
  it("is PICKS_PER_TEAM per captain (teams of 5)", () => {
    expect(PICKS_PER_TEAM).toBe(4);
    expect(totalPicks(4)).toBe(16);
    expect(totalPicks(6)).toBe(24);
  });
});
