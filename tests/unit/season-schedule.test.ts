import { describe, expect, it } from "vitest";

import { seasonSchedule } from "@/lib/seasons";

const empty = {
  signupOpensAt: null,
  signupClosesAt: null,
  draftAt: null,
  seasonStartAt: null,
  groupStageEndsAt: null,
  semisAt: null,
  finalAt: null,
};

describe("seasonSchedule", () => {
  it("is empty when no dates are set", () => {
    expect(seasonSchedule(empty)).toEqual([]);
  });

  it("lists set dates in order and skips the rest", () => {
    const draftAt = new Date("2026-11-22T01:00:00Z");
    const finalAt = new Date("2026-12-21T00:00:00Z");
    expect(seasonSchedule({ ...empty, draftAt, finalAt }).map((e) => e.label)).toEqual([
      "Draft",
      "Final",
    ]);
  });

  it("gives the group stage a range when it has an end date", () => {
    const seasonStartAt = new Date("2026-12-12T00:00:00Z");
    const groupStageEndsAt = new Date("2026-12-14T00:00:00Z");
    expect(seasonSchedule({ ...empty, seasonStartAt, groupStageEndsAt })).toEqual([
      { label: "Group stage", at: seasonStartAt, until: groupStageEndsAt },
    ]);
    expect(seasonSchedule({ ...empty, seasonStartAt })[0].until).toBeUndefined();
  });
});
