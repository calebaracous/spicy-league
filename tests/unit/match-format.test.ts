import { describe, expect, it } from "vitest";

import { bestOfLabel, formatStructure, PLAYOFF_BEST_OF_OPTIONS } from "@/lib/match-format";

describe("bestOfLabel", () => {
  it("names the series length", () => {
    expect(bestOfLabel(1)).toBe("Best of 1");
    expect(bestOfLabel(5)).toBe("Best of 5");
  });
});

describe("PLAYOFF_BEST_OF_OPTIONS", () => {
  it("offers odd lengths only", () => {
    expect(PLAYOFF_BEST_OF_OPTIONS).toEqual([
      { value: 1, label: "Best of 1" },
      { value: 3, label: "Best of 3" },
      { value: 5, label: "Best of 5" },
    ]);
  });
});

describe("formatStructure", () => {
  it("describes a Bo1 group with the default playoff lengths", () => {
    expect(formatStructure({ groupBestOf: 1, playoffBestOf: 3, finalBestOf: 5 })).toBe(
      "Round-robin group stage, then the top 4 play single-elimination playoffs (best-of-3 semifinals, best-of-5 final)",
    );
  });

  it("describes a Bo2 group and its draws", () => {
    expect(formatStructure({ groupBestOf: 2, playoffBestOf: 1, finalBestOf: 3 })).toBe(
      "Round-robin group stage of best-of-2 series (1–1 draws count), then the top 4 play single-elimination playoffs (best-of-1 semifinals, best-of-3 final)",
    );
  });

  it("merges equal semifinal and final lengths", () => {
    expect(formatStructure({ groupBestOf: 1, playoffBestOf: 3, finalBestOf: 3 })).toBe(
      "Round-robin group stage, then the top 4 play single-elimination playoffs (best-of-3 semifinals and final)",
    );
  });
});
