import { describe, expect, it } from "vitest";

import { normalizeTeamName, teamTextChannelName } from "@/lib/team-name";

describe("normalizeTeamName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTeamName("  Gucci   Gang ")).toBe("Gucci Gang");
  });

  it("accepts letters, numbers and simple punctuation", () => {
    for (const ok of ["T1G", "Rock & Roll", "Cloud9.5", "Árvíztűrő", "We're Back!", "Who? Me_-"]) {
      expect(normalizeTeamName(ok)).toBe(ok);
    }
    expect(normalizeTeamName(["Two", "Lines"].join("\n"))).toBe("Two Lines");
  });

  it("rejects bad lengths and markup", () => {
    for (const bad of ["", "ab", "x".repeat(33), "@everyone", "#general", "<script>", null]) {
      expect(normalizeTeamName(bad)).toBeNull();
    }
  });
});

describe("teamTextChannelName", () => {
  it("slugs names the way Discord text channels look", () => {
    expect(teamTextChannelName("Gucci Gang!")).toBe("gucci-gang");
    expect(teamTextChannelName("Rock & Roll")).toBe("rock-roll");
    expect(teamTextChannelName("Árvíztűrő Team")).toBe("arvizturo-team");
    expect(teamTextChannelName("!!!")).toBe("team");
  });
});
