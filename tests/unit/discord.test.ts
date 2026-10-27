import { describe, expect, it } from "vitest";

import { normalizeDiscordUserId, normalizeDiscordUsername } from "@/lib/discord";

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

describe("normalizeDiscordUserId", () => {
  it("accepts 17–20 digit snowflakes, trimmed", () => {
    expect(normalizeDiscordUserId("80351110224678912")).toBe("80351110224678912");
    expect(normalizeDiscordUserId(" 1234567890123456789 ")).toBe("1234567890123456789");
    expect(normalizeDiscordUserId("1".repeat(20))).toBe("1".repeat(20));
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "1".repeat(16),
      "1".repeat(21),
      "spicy_boy",
      "<@80351110224678912>",
    ]) {
      expect(normalizeDiscordUserId(bad)).toBeNull();
    }
  });
});
