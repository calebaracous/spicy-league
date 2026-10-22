/**
 * Event catalogue and rendering for the admin events inbox. Pure — no DB —
 * so the sentences are unit-tested (tests/unit/event-format.test.ts). Writers
 * live in src/lib/events.ts; see docs/EVENTS.md.
 */

export const EVENT_CATEGORIES = {
  accounts: "Accounts",
  signups: "Signups",
  seasons: "Season admin",
  draft: "Draft",
  matches: "Matches",
  tenman: "10-man",
  moderation: "Moderation",
  discord: "Discord",
  system: "System",
} as const;

export type EventCategory = keyof typeof EVENT_CATEGORIES;

export const EVENT_TYPES = {
  "user.registered": "accounts",
  "user.email_verified": "accounts",
  "user.password_reset": "accounts",
  "profile.updated": "accounts",
  "profile.opgg_updated": "accounts",
  "profile.discord_updated": "accounts",
  "profile.ten_man_pings": "accounts",
  "riot.linked": "accounts",
  "riot.unlinked": "accounts",
  "cs2.linked": "accounts",
  "cs2.unlinked": "accounts",

  "signup.created": "signups",
  "signup.left_subs": "signups",
  "signup.removed": "signups",

  "season.created": "seasons",
  "season.updated": "seasons",
  "season.state_changed": "seasons",
  "captain.promoted": "seasons",
  "captain.demoted": "seasons",
  "captain.moved": "seasons",
  "captain.paired": "seasons",
  "captain.split": "seasons",

  "draft.started": "draft",
  "draft.paused": "draft",
  "draft.resumed": "draft",
  "draft.pick": "draft",
  "draft.undo": "draft",

  "schedule.generated": "matches",
  "playoffs.seeded": "matches",
  "tiebreakers.created": "matches",
  "match.reported": "matches",
  "match.confirmed": "matches",
  "match.disputed": "matches",
  "match.reset": "matches",
  "sub.requested": "matches",
  "sub.withdrawn": "matches",
  "sub.decided": "matches",
  "sub.pinged": "matches",
  "team.renamed": "matches",

  "tenman.started": "tenman",
  "tenman.cancelled": "tenman",
  "tenman.joined": "tenman",
  "tenman.left": "tenman",
  "tenman.pick": "tenman",
  "tenman.result": "tenman",

  "user.banned": "moderation",
  "user.unbanned": "moderation",

  "discord.synced": "discord",
  "discord.nicknames": "discord",
  "discord.channels_deleted": "discord",
  "discord.emailed_unmatched": "discord",

  "stats.refreshed": "system",
} as const satisfies Record<string, EventCategory>;

export type EventType = keyof typeof EVENT_TYPES;

export function isEventCategory(v: string | undefined): v is EventCategory {
  return !!v && v in EVENT_CATEGORIES;
}

export function eventTypesIn(category: EventCategory): EventType[] {
  return (Object.keys(EVENT_TYPES) as EventType[]).filter((t) => EVENT_TYPES[t] === category);
}

export function categoryOf(type: string): EventCategory | null {
  return (EVENT_TYPES as Record<string, EventCategory>)[type] ?? null;
}

/** `{ field: [before, after] }` — only fields that actually changed. */
export type Changes = Record<string, [unknown, unknown]>;

export function diffFields<T extends Record<string, unknown>>(before: T, after: T): Changes {
  const out: Changes = {};
  for (const key of Object.keys(after)) {
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (a !== b) out[key] = [a, b];
  }
  return out;
}

// ── Rendering ──────────────────────────────────────────────────────────────

export type Person = { username: string | null; name: string | null } | null;

/** One event joined with the names it mentions (see listEvents). */
export type EventView = {
  type: string;
  data: Record<string, unknown>;
  actor: Person;
  subject: Person;
  season: { name: string; slug: string } | null;
};

/** A sentence is text and links; the page turns links into <Link>. */
export type Segment = string | { text: string; href: string };

function person(p: Person, fallback = "a deleted user"): Segment {
  if (!p) return fallback;
  const label = p.name ?? p.username ?? fallback;
  return p.username ? { text: label, href: `/users/${p.username}` } : label;
}

function seasonLink(e: EventView, path = ""): Segment {
  if (!e.season) return "a deleted season";
  return { text: e.season.name, href: `/admin/seasons/${e.season.slug}${path}` };
}

function str(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

const FIELD_LABELS: Record<string, string> = {
  name: "Display name",
  bio: "Bio",
  pronouns: "Pronouns",
  opggUrl: "OP.GG URL",
  discordUsername: "Discord username",
  slug: "Slug",
  game: "Game",
  description: "Description",
  rules: "Rules",
  signupOpensAt: "Signups open",
  signupClosesAt: "Signups close",
  draftAt: "Draft",
  seasonStartAt: "Season start",
  groupStageEndsAt: "Group stage ends",
  semisAt: "Semis",
  finalAt: "Final",
  groupBestOf: "Group best-of",
};

/** Before → after lines shown under an edit. */
export function describeChanges(data: Record<string, unknown>): string[] {
  const changes = data.changes as Changes | undefined;
  if (!changes) return [];
  return Object.entries(changes).map(
    ([field, [a, b]]) => `${FIELD_LABELS[field] ?? field}: ${str(a)} → ${str(b)}`,
  );
}

export function describeEvent(e: EventView): Segment[] {
  const d = e.data;
  const actor = person(e.actor, e.type === "stats.refreshed" ? "System" : "a deleted user");
  const subject = person(e.subject);
  const tenMan: Segment = d.tenManId
    ? { text: "a 10-man", href: `/10-man/${String(d.tenManId)}` }
    : "a 10-man";
  const match = (verb: string): Segment[] => {
    const href = e.season && d.matchId ? `/seasons/${e.season.slug}/matches/${d.matchId}` : null;
    const label = d.matchLabel ? String(d.matchLabel) : "a match";
    return [actor, ` ${verb} `, href ? { text: label, href } : label, " in ", seasonLink(e)];
  };

  switch (e.type as EventType) {
    case "user.registered":
      return [actor, " created an account"];
    case "user.email_verified":
      return [actor, " verified their email"];
    case "user.password_reset":
      return [actor, " reset their password"];
    case "profile.updated":
      return [actor, " edited their profile"];
    case "profile.opgg_updated":
      return [actor, " changed their OP.GG link"];
    case "profile.discord_updated":
      return [actor, " changed their Discord username"];
    case "profile.ten_man_pings":
      return [actor, d.enabled ? " turned on 10-man pings" : " turned off 10-man pings"];
    case "riot.linked":
      return [actor, " linked Riot account ", str(d.riotId)];
    case "riot.unlinked":
      return [actor, " unlinked Riot account ", str(d.riotId)];
    case "cs2.linked":
      return [actor, " linked Steam account ", str(d.steamId)];
    case "cs2.unlinked":
      return [actor, " unlinked their Steam account"];

    case "signup.created":
      return [
        actor,
        d.kind === "sub" ? " joined the sub list for " : " signed up for ",
        seasonLink(e, "/signups"),
      ];
    case "signup.left_subs":
      return [actor, " left the sub list for ", seasonLink(e, "/signups")];
    case "signup.removed":
      return [actor, " removed ", subject, " from ", seasonLink(e, "/signups")];

    case "season.created":
      return [actor, " created ", seasonLink(e)];
    case "season.updated":
      return [actor, " edited ", seasonLink(e)];
    case "season.state_changed":
      return [actor, " moved ", seasonLink(e), ` from ${str(d.from)} to ${str(d.to)}`];
    case "captain.promoted":
      return [actor, " made ", subject, " a captain in ", seasonLink(e, "/signups")];
    case "captain.demoted":
      return [actor, " removed ", subject, " as captain in ", seasonLink(e, "/signups")];
    case "captain.moved":
      return [
        actor,
        ` moved captain slot ${str(d.order)} ${str(d.direction)} in `,
        seasonLink(e, "/signups"),
      ];
    case "captain.paired":
      return [
        actor,
        " paired ",
        subject,
        ` with ${str(d.partner)} as duo captains in `,
        seasonLink(e, "/signups"),
      ];
    case "captain.split":
      return [actor, " split ", subject, " from their duo in ", seasonLink(e, "/signups")];

    case "draft.started":
      return [actor, " started the draft for ", seasonLink(e, "/draft")];
    case "draft.paused":
      return [actor, " paused the draft for ", seasonLink(e, "/draft")];
    case "draft.resumed":
      return [actor, " resumed the draft for ", seasonLink(e, "/draft")];
    case "draft.pick":
      return [
        actor,
        ` drafted `,
        subject,
        ` (pick ${str(d.pickNumber)}) in `,
        seasonLink(e, "/draft"),
      ];
    case "draft.undo":
      return [actor, ` undid pick ${str(d.pickNumber)} in `, seasonLink(e, "/draft")];

    case "schedule.generated":
      return [actor, ` generated ${str(d.count)} matches for `, seasonLink(e, "/matches")];
    case "playoffs.seeded":
      return [actor, " seeded the playoffs for ", seasonLink(e, "/matches")];
    case "tiebreakers.created":
      return [actor, ` created ${str(d.count)} tiebreakers in `, seasonLink(e, "/matches")];
    case "match.reported":
      return match("reported a result for");
    case "match.confirmed":
      return match("confirmed the result of");
    case "match.disputed":
      return match("disputed the result of");
    case "match.reset":
      return match("reset");
    case "sub.requested":
      return [...match("requested a sub for"), " (", subject, ")"];
    case "sub.withdrawn":
      return match("withdrew a sub request for");
    case "sub.decided": {
      const verb =
        d.decision === "approve" ? "approved" : d.decision === "reject" ? "declined" : "revoked";
      return [...match(`${verb} a sub for`), " (", subject, ")"];
    }
    case "sub.pinged":
      return match("pinged the sub list for");
    case "team.renamed":
      return [
        actor,
        ` renamed ${str(d.from)} to ${str(d.to)} in `,
        e.season ? { text: e.season.name, href: `/seasons/${e.season.slug}/teams` } : "a season",
      ];

    case "tenman.started":
      return [actor, " started ", tenMan];
    case "tenman.cancelled":
      return [actor, " cancelled ", tenMan];
    case "tenman.joined":
      return [actor, " joined ", tenMan];
    case "tenman.left":
      return [actor, " left ", tenMan];
    case "tenman.pick":
      return [actor, " picked ", subject, " in ", tenMan];
    case "tenman.result":
      return [actor, " reported ", tenMan, ": ", subject, "'s team won"];

    case "user.banned":
      return [
        actor,
        " banned ",
        subject,
        d.expiresAt
          ? ` until ${new Date(String(d.expiresAt)).toLocaleDateString()}`
          : " permanently",
      ];
    case "user.unbanned":
      return [actor, " unbanned ", subject];

    case "discord.synced":
      return [actor, " ran Discord sync for ", seasonLink(e)];
    case "discord.nicknames":
      return [actor, " set Discord nicknames for ", seasonLink(e)];
    case "discord.channels_deleted":
      return [actor, " deleted old Discord team channels"];
    case "discord.emailed_unmatched":
      return [actor, " emailed unmatched players in ", seasonLink(e)];

    case "stats.refreshed":
      return [`Daily stat refresh updated ${str(d.count)} Riot accounts`];
  }
  return [actor, ` ${e.type}`];
}

/** Extra lines under the sentence: diffs, ban reasons, scores. */
export function describeDetails(e: EventView): string[] {
  const d = e.data;
  const lines = describeChanges(d);
  if (e.type === "user.banned" && d.reason) lines.push(`Reason: ${String(d.reason)}`);
  if (e.type === "match.reported" && d.score) lines.push(`Score: ${String(d.score)}`);
  if (e.type === "sub.requested" && d.reason) lines.push(`Reason: ${String(d.reason)}`);
  if (e.type.startsWith("discord.") && d.note) lines.push(String(d.note));
  if (e.type === "discord.synced") {
    lines.push(
      `${str(d.assigned)} role changes, ${str(d.unmatched)} unmatched, ${str(d.errors)} errors`,
    );
  }
  return lines;
}
