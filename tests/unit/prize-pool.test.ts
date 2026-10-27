import { describe, expect, it } from "vitest";

import { describePayouts, formatUsd, parsePrizeSplit, prizePayouts } from "@/lib/prize-pool";

describe("parsePrizeSplit", () => {
  it("accepts slashes, commas, spaces and percent signs", () => {
    expect(parsePrizeSplit("75/25")).toEqual([75, 25]);
    expect(parsePrizeSplit("60, 30, 10")).toEqual([60, 30, 10]);
    expect(parsePrizeSplit("75% 25%")).toEqual([75, 25]);
    expect(parsePrizeSplit("100")).toEqual([100]);
  });

  it("rejects splits that don't sum to 100 or have bad parts", () => {
    expect(parsePrizeSplit("")).toBeNull();
    expect(parsePrizeSplit("75/20")).toBeNull();
    expect(parsePrizeSplit("50/50/0")).toBeNull();
    expect(parsePrizeSplit("70.5/29.5")).toBeNull();
    expect(parsePrizeSplit("abc")).toBeNull();
  });
});

describe("prizePayouts", () => {
  it("splits the pool per place, to the cent", () => {
    const payouts = prizePayouts({ prizePool: 250, prizeSplit: [75, 25] });
    expect(payouts).toEqual([
      { place: "1st", percent: 75, amount: 187.5 },
      { place: "2nd", percent: 25, amount: 62.5 },
    ]);
    expect(describePayouts(payouts)).toBe("1st $187.50 · 2nd $62.50");
  });

  it("is empty without a pool or split", () => {
    expect(prizePayouts({ prizePool: null, prizeSplit: [100] })).toEqual([]);
    expect(prizePayouts({ prizePool: 250, prizeSplit: null })).toEqual([]);
  });
});

describe("formatUsd", () => {
  it("shows cents only when there are any", () => {
    expect(formatUsd(250)).toBe("$250");
    expect(formatUsd(1000)).toBe("$1,000");
    expect(formatUsd(62.5)).toBe("$62.50");
  });
});
