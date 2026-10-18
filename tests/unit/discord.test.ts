import { describe, expect, it } from "vitest";

import { normalizeDiscordUsername } from "@/lib/discord";

describe("normalizeDiscordUsername", () => {
  it("accepts current-style usernames", () => {
    expect(normalizeDiscordUsername("spicy_boy")).toBe("spicy_boy");
    expect(normalizeDiscordUsername("caleb.jones")).toBe("caleb.jones");
    expect(normalizeDiscordUsername("ab")).toBe("ab");
    expect(normalizeDiscordUsername("a".repeat(32))).toBe("a".repeat(32));
  });

  it("trims, drops a leading @ and lowercases", () => {
    expect(normalizeDiscordUsername("  @Spicy.Boy ")).toBe("spicy.boy");
  });

  it("rejects anything Discord wouldn't allow", () => {
    for (const bad of [
      "",
      "a",
      "a".repeat(33),
      "spicy boy",
      "spicy-boy",
      "spicy..boy",
      "name#1234",
      "@",
      null,
      undefined,
    ]) {
      expect(normalizeDiscordUsername(bad)).toBeNull();
    }
  });
});
