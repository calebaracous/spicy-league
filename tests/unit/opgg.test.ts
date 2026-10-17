import { describe, expect, it } from "vitest";

import { opggUrlForRiotId } from "@/lib/opgg";

describe("opggUrlForRiotId", () => {
  it("builds an NA summoner URL from gameName#tagLine", () => {
    expect(opggUrlForRiotId("Faker#NA1")).toBe("https://op.gg/lol/summoners/na/Faker-NA1");
  });

  it("encodes spaces and non-ASCII characters", () => {
    expect(opggUrlForRiotId("Big Dog#Woof")).toBe("https://op.gg/lol/summoners/na/Big%20Dog-Woof");
    expect(opggUrlForRiotId("Ñandú#ES1")).toBe(
      "https://op.gg/lol/summoners/na/%C3%91and%C3%BA-ES1",
    );
  });

  it("returns null for malformed handles", () => {
    expect(opggUrlForRiotId(null)).toBeNull();
    expect(opggUrlForRiotId("")).toBeNull();
    expect(opggUrlForRiotId("NoTag")).toBeNull();
    expect(opggUrlForRiotId("#NA1")).toBeNull();
    expect(opggUrlForRiotId("a#b#c")).toBeNull();
  });
});
