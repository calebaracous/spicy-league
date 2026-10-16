import { describe, expect, it } from "vitest";

import { openSignupKind } from "@/lib/seasons";

const now = new Date("2026-10-16T12:00:00Z");
const before = new Date("2026-10-15T12:00:00Z");
const after = new Date("2026-10-17T12:00:00Z");

const season = (
  state: Parameters<typeof openSignupKind>[0]["state"],
  signupOpensAt: Date | null = null,
  signupClosesAt: Date | null = null,
) => ({ state, signupOpensAt, signupClosesAt });

describe("openSignupKind", () => {
  it("takes regular signups inside the window", () => {
    expect(openSignupKind(season("signups_open", before, after), now)).toBe("player");
    expect(openSignupKind(season("signups_open"), now)).toBe("player");
  });

  it("takes nothing before the window opens", () => {
    expect(openSignupKind(season("signups_open", after, null), now)).toBeNull();
  });

  it("treats a passed window as sub-only until an admin closes signups", () => {
    expect(openSignupKind(season("signups_open", null, before), now)).toBe("sub");
  });

  it.each(["signups_closed", "captains_selected", "drafting", "group_stage", "playoffs"] as const)(
    "takes sub signups during %s",
    (state) => {
      expect(openSignupKind(season(state), now)).toBe("sub");
    },
  );

  it.each(["draft", "complete"] as const)("takes no signups during %s", (state) => {
    expect(openSignupKind(season(state), now)).toBeNull();
  });
});
