import { describe, expect, it } from "vitest";

import { tallyMatchRecords, tallyTenManRecords } from "@/lib/player-stats";
import { bestRankPerUser, formatTier, rankScore } from "@/lib/rank";

const memberships = [
  { userId: "a1", teamId: "A" },
  { userId: "a2", teamId: "A" },
  { userId: "b1", teamId: "B" },
  { userId: "b2", teamId: "B" },
];

describe("tallyMatchRecords", () => {
  it("credits both rosters with the result", () => {
    const r = tallyMatchRecords(
      [
        { id: "m1", homeTeamId: "A", awayTeamId: "B", winnerTeamId: "A" },
        { id: "m2", homeTeamId: "B", awayTeamId: "A", winnerTeamId: "A" },
      ],
      memberships,
      [],
    );
    expect(r.get("a1")).toEqual({ wins: 2, draws: 0, losses: 0 });
    expect(r.get("b2")).toEqual({ wins: 0, draws: 0, losses: 2 });
  });

  it("swaps a sat-out roster player for the approved sub", () => {
    const r = tallyMatchRecords(
      [{ id: "m1", homeTeamId: "A", awayTeamId: "B", winnerTeamId: "B" }],
      memberships,
      [{ matchId: "m1", teamId: "B", subUserId: "s1", replacedUserId: "b2" }],
    );
    expect(r.get("s1")).toEqual({ wins: 1, draws: 0, losses: 0 });
    expect(r.get("b1")).toEqual({ wins: 1, draws: 0, losses: 0 });
    expect(r.has("b2")).toBe(false);
  });

  it("a sub filling an empty slot replaces nobody", () => {
    const r = tallyMatchRecords(
      [{ id: "m1", homeTeamId: "A", awayTeamId: "B", winnerTeamId: "A" }],
      memberships,
      [{ matchId: "m1", teamId: "A", subUserId: "s1", replacedUserId: null }],
    );
    expect(r.get("a1")).toEqual({ wins: 1, draws: 0, losses: 0 });
    expect(r.get("a2")).toEqual({ wins: 1, draws: 0, losses: 0 });
    expect(r.get("s1")).toEqual({ wins: 1, draws: 0, losses: 0 });
  });

  it("a sub only affects the match it was approved for", () => {
    const r = tallyMatchRecords(
      [
        { id: "m1", homeTeamId: "A", awayTeamId: "B", winnerTeamId: "A" },
        { id: "m2", homeTeamId: "A", awayTeamId: "B", winnerTeamId: "A" },
      ],
      memberships,
      [{ matchId: "m1", teamId: "A", subUserId: "s1", replacedUserId: "a1" }],
    );
    expect(r.get("a1")).toEqual({ wins: 1, draws: 0, losses: 0 });
    expect(r.get("s1")).toEqual({ wins: 1, draws: 0, losses: 0 });
  });

  it("counts a 1-1 Bo2 draw for both lineups", () => {
    const r = tallyMatchRecords(
      [
        {
          id: "m1",
          homeTeamId: "A",
          awayTeamId: "B",
          winnerTeamId: null,
          homeScore: 1,
          awayScore: 1,
        },
      ],
      memberships,
      [],
    );
    expect(r.get("a1")).toEqual({ wins: 0, draws: 1, losses: 0 });
    expect(r.get("b2")).toEqual({ wins: 0, draws: 1, losses: 0 });
  });

  it("skips matches without a result", () => {
    const r = tallyMatchRecords(
      [{ id: "m1", homeTeamId: "A", awayTeamId: "B", winnerTeamId: null }],
      memberships,
      [],
    );
    expect(r.size).toBe(0);
  });
});

describe("tallyTenManRecords", () => {
  it("credits captains and their picks; skips unknown winners", () => {
    const r = tallyTenManRecords(
      [
        { id: "t1", winnerCaptainUserId: "c1" },
        { id: "t2", winnerCaptainUserId: null },
      ],
      [
        { tenManId: "t1", userId: "c1" },
        { tenManId: "t1", userId: "c2" },
        { tenManId: "t2", userId: "c1" },
      ],
      [
        { tenManId: "t1", captainUserId: "c1", pickedUserId: "p1" },
        { tenManId: "t1", captainUserId: "c2", pickedUserId: "p2" },
      ],
    );
    expect(r.get("c1")).toEqual({ wins: 1, losses: 0 });
    expect(r.get("p1")).toEqual({ wins: 1, losses: 0 });
    expect(r.get("c2")).toEqual({ wins: 0, losses: 1 });
    expect(r.get("p2")).toEqual({ wins: 0, losses: 1 });
  });
});

describe("rank helpers", () => {
  it("orders tiers, divisions and LP (lower is better)", () => {
    expect(rankScore("GOLD", "I", 0)).toBeLessThan(rankScore("GOLD", "II", 99));
    expect(rankScore("PLATINUM", "IV", 0)).toBeLessThan(rankScore("GOLD", "I", 99));
    expect(rankScore("MASTER", null, 200)).toBeLessThan(rankScore("MASTER", null, 50));
    expect(rankScore(null, null, null)).toBeGreaterThan(rankScore("IRON", "IV", 0));
  });

  it("bestRankPerUser keeps each user's highest account, not the latest", () => {
    const row = (userId: string, tier: string | null, rankDivision: string | null, lp: number) => ({
      userId,
      tier,
      rankDivision,
      lp,
    });
    const best = bestRankPerUser([
      row("u1", "GOLD", "II", 50), // main
      row("u1", "PLATINUM", "IV", 0), // smurf, higher
      row("u1", null, null, 0), // unranked alt, linked last
      row("u2", "SILVER", "I", 10),
      row("u2", "SILVER", "I", 80),
    ]);
    expect(best.get("u1")?.tier).toBe("PLATINUM");
    expect(best.get("u2")?.lp).toBe(80);
  });

  it("formatTier", () => {
    expect(formatTier("GOLD", "II")).toBe("Gold II");
    expect(formatTier("GRANDMASTER", "I")).toBe("Grandmaster");
    expect(formatTier(null, null)).toBeNull();
  });
});
