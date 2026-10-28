import { describe, expect, it } from "vitest";

import {
  EVENT_CATEGORIES,
  EVENT_TYPES,
  categoryOf,
  describeDetails,
  describeEvent,
  diffFields,
  eventTypesIn,
  type EventView,
  type Segment,
} from "@/lib/event-format";

const admin = { username: "captain1", name: "Captain One" };
const player = { username: "botplayer3", name: "Bot 3" };
const season = { name: "Season 12", slug: "s12" };

function view(type: string, over: Partial<EventView> = {}): EventView {
  return { type, data: {}, actor: admin, subject: player, season, ...over };
}

/** The sentence as plain text, links flattened. */
function text(segments: Segment[]): string {
  return segments.map((s) => (typeof s === "string" ? s : s.text)).join("");
}

describe("event catalogue", () => {
  it("puts every type in a known category", () => {
    for (const type of Object.keys(EVENT_TYPES)) {
      expect(EVENT_CATEGORIES).toHaveProperty(categoryOf(type)!);
    }
    expect(categoryOf("nope.nope")).toBeNull();
  });

  it("lists a category's types", () => {
    expect(eventTypesIn("moderation")).toEqual(["user.banned", "user.unbanned"]);
  });

  it("has a sentence for every type (no raw type fallback)", () => {
    for (const type of Object.keys(EVENT_TYPES)) {
      expect(text(describeEvent(view(type)))).not.toContain(type);
    }
  });
});

describe("describeEvent", () => {
  it("names a deleted account from the event data", () => {
    const self = { username: "jahwn1", self: true, anonymized: false };
    expect(text(describeEvent(view("user.deleted", { actor: null, data: self })))).toBe(
      "jahwn1 deleted their account",
    );
    const byAdmin = view("user.deleted", {
      subject: { username: null, name: "Deleted player" },
      data: { username: "jahwn1", self: false, anonymized: true },
    });
    expect(text(describeEvent(byAdmin))).toBe("Captain One deleted the account of jahwn1");
    expect(describeDetails(byAdmin)).toEqual([
      'Kept as "Deleted player" on past rosters and results',
    ]);
  });

  it("names the player when an admin edits their accounts", () => {
    expect(text(describeEvent(view("riot.linked", { data: { riotId: "Bot#NA1" } })))).toBe(
      "Captain One linked Riot account Bot#NA1 to Bot 3",
    );
    expect(
      text(describeEvent(view("riot.unlinked", { subject: null, data: { riotId: "Bot#NA1" } }))),
    ).toBe("Captain One unlinked Riot account Bot#NA1");
    expect(text(describeEvent(view("profile.discord_updated")))).toBe(
      "Captain One changed the Discord details of Bot 3",
    );
    expect(text(describeEvent(view("profile.discord_updated", { subject: null })))).toBe(
      "Captain One changed their Discord username",
    );
  });

  it("links people to their profile and seasons to admin pages", () => {
    const segs = describeEvent(view("captain.promoted"));
    expect(segs).toContainEqual({ text: "Captain One", href: "/users/captain1" });
    expect(segs).toContainEqual({ text: "Bot 3", href: "/users/botplayer3" });
    expect(segs).toContainEqual({ text: "Season 12", href: "/admin/seasons/s12/signups" });
    expect(text(segs)).toBe("Captain One made Bot 3 a captain in Season 12");
  });

  it("separates draft-pool and sub-only signups", () => {
    expect(text(describeEvent(view("signup.created", { data: { kind: "sub" } })))).toBe(
      "Captain One joined the sub list for Season 12",
    );
    expect(text(describeEvent(view("signup.created", { data: { kind: "player" } })))).toBe(
      "Captain One signed up for Season 12",
    );
  });

  it("names deleted users and seasons instead of crashing", () => {
    const segs = describeEvent(
      view("signup.removed", { actor: null, subject: null, season: null }),
    );
    expect(text(segs)).toBe("a deleted user removed a deleted user from a deleted season");
  });

  it("links match events to the match page", () => {
    const segs = describeEvent(
      view("match.reported", { data: { matchId: "m1", matchLabel: "Reds vs Blues" } }),
    );
    expect(segs).toContainEqual({ text: "Reds vs Blues", href: "/seasons/s12/matches/m1" });
  });

  it("words sub decisions", () => {
    const sentence = (decision: string) =>
      text(describeEvent(view("sub.decided", { data: { decision } })));
    expect(sentence("approve")).toContain("approved a sub");
    expect(sentence("reject")).toContain("declined a sub");
    expect(sentence("revoke")).toContain("revoked a sub");
  });

  it("credits the system for cron events", () => {
    expect(text(describeEvent(view("stats.refreshed", { actor: null, data: { count: 7 } })))).toBe(
      "Daily stat refresh updated 7 Riot accounts",
    );
  });
});

describe("diffFields / describeDetails", () => {
  it("keeps only changed fields, treating undefined as null", () => {
    expect(
      diffFields(
        { name: "A", bio: null, pronouns: undefined },
        { name: "B", bio: null, pronouns: null },
      ),
    ).toEqual({ name: ["A", "B"] });
  });

  it("renders before → after lines with labels", () => {
    const lines = describeDetails(
      view("profile.updated", { data: { changes: { name: ["A", "B"], bio: [null, "hi"] } } }),
    );
    expect(lines).toEqual(["Display name: A → B", "Bio: — → hi"]);
  });

  it("shows ban reasons", () => {
    expect(describeDetails(view("user.banned", { data: { reason: "toxicity" } }))).toEqual([
      "Reason: toxicity",
    ]);
  });
});
