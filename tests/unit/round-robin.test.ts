import { describe, expect, it } from "vitest";

import { buildRoundRobin } from "@/lib/schedule";

describe("buildRoundRobin (circle method)", () => {
  it.each([2, 3, 4, 5, 6, 7, 8])("%i teams: every pair plays exactly once", (n) => {
    const pairings = buildRoundRobin(n);
    const seen = new Set<string>();
    for (const { home, away } of pairings) {
      expect(home).not.toBe(away);
      const key = [home, away].sort((a, b) => a - b).join("-");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(pairings).toHaveLength((n * (n - 1)) / 2);
  });

  it.each([4, 6, 8])("%i teams (even): n-1 rounds, every team plays once per round", (n) => {
    const pairings = buildRoundRobin(n);
    const rounds = new Set(pairings.map((p) => p.round));
    expect(rounds.size).toBe(n - 1);
    for (const r of rounds) {
      const teams = pairings.filter((p) => p.round === r).flatMap((p) => [p.home, p.away]);
      expect(new Set(teams).size).toBe(n);
    }
  });

  it("5 teams (odd): each team sits out exactly one round", () => {
    const pairings = buildRoundRobin(5);
    const rounds = [...new Set(pairings.map((p) => p.round))];
    expect(rounds).toHaveLength(5);
    const byes = new Map<number, number>();
    for (const r of rounds) {
      const playing = new Set(
        pairings.filter((p) => p.round === r).flatMap((p) => [p.home, p.away]),
      );
      for (let t = 0; t < 5; t++) if (!playing.has(t)) byes.set(t, (byes.get(t) ?? 0) + 1);
    }
    expect([...byes.values()]).toEqual([1, 1, 1, 1, 1]);
  });
});
