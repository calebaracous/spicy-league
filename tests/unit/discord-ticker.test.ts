import { describe, expect, it } from "vitest";

import { plainMessageText, tickerItems, type MentionNames } from "@/lib/discord-format";

const names: MentionNames = {
  users: new Map([["111", "Caleb"]]),
  roles: new Map([["222", "Signed up"]]),
  channels: new Map([["333", "matches"]]),
};

describe("plainMessageText", () => {
  it("resolves mentions and drops pings", () => {
    expect(plainMessageText("@everyone <@&222> check <#333>, thanks <@!111>", names)).toBe(
      "@Signed up check #matches, thanks @Caleb",
    );
    expect(plainMessageText("hi <@999> and <@&999>", names)).toBe("hi @someone and");
  });

  it("strips markdown, emoji, links and spoilers", () => {
    expect(
      plainMessageText(
        "# Season 12\n**Signups** are __open__ <:spicy:123> — [sign up](https://x.dev) ||secret||",
        names,
      ),
    ).toBe("Season 12 · Signups are open — sign up [spoiler]");
    expect(plainMessageText("> quoted\n- item one\n\n1. step `code`", names)).toBe(
      "quoted · item one · step code",
    );
    expect(plainMessageText("*italic* and snake_case_name", names)).toBe(
      "italic and snake_case_name",
    );
  });

  it("formats Discord timestamps in Eastern time", () => {
    // 2026-11-01T03:00:00Z is still Oct 31 in New York.
    expect(plainMessageText("Draft on <t:1793502000:F>", names)).toBe("Draft on Oct 31");
  });

  it("cuts long text on a word boundary", () => {
    const out = plainMessageText("word ".repeat(60), names, 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith("word…")).toBe(true);
  });
});

describe("tickerItems", () => {
  const msg = (
    id: string,
    content: string,
    extra: Partial<{ type: number; embeds: [] | [{ title?: string }] }> = {},
  ) => ({
    id,
    type: 0,
    content,
    timestamp: "2026-10-22T12:00:00.000Z",
    embeds: [],
    ...extra,
  });

  it("skips system and empty messages, uses embeds, and stops at count", () => {
    const items = tickerItems(
      [
        msg("1", "first"),
        msg("2", "pinned", { type: 6 }),
        msg("3", ""),
        msg("4", "", { embeds: [{ title: "Embed title" }] }),
        msg("5", "@everyone"),
        msg("6", "a reply", { type: 19 }),
        msg("7", "too many"),
      ],
      names,
      3,
    );
    expect(items.map((i) => [i.id, i.text])).toEqual([
      ["1", "first"],
      ["4", "Embed title"],
      ["6", "a reply"],
    ]);
  });
});
