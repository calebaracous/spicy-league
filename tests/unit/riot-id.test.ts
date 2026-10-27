import { describe, expect, it } from "vitest";

import { parseRiotId } from "@/lib/riot-id";

describe("parseRiotId", () => {
  it("splits GameName#TAG, trimmed", () => {
    expect(parseRiotId("  Spicy Boy#NA1 ")).toEqual({ gameName: "Spicy Boy", tagLine: "NA1" });
  });

  it("rejects missing or extra parts", () => {
    for (const bad of ["", null, undefined, "SpicyBoy", "#NA1", "SpicyBoy#", "a#b#c"]) {
      expect(parseRiotId(bad)).toBeNull();
    }
  });
});
