import "server-only";

import { env } from "@/lib/env";

/**
 * Minimal Discord REST client for the league bot. REST only — no gateway
 * connection — so it runs inside normal Vercel functions. Every call needs
 * DISCORD_BOT_TOKEN + DISCORD_GUILD_ID; without them `discordConfig()` is
 * null and callers skip Discord entirely. See docs/DISCORD.md.
 */

const API = "https://discord.com/api/v10";
const USER_AGENT = "DiscordBot (https://www.spicyleague.dev, 1)";
const MAX_RETRIES = 3;
/**
 * Longest rate-limit wait we sit through. Some limits are long (a channel can
 * be renamed only twice per 10 minutes); those fail fast instead, and the
 * admin re-runs the sync later.
 */
const MAX_WAIT_MS = 5_000;
/**
 * Member role adds/removes share a bucket that a bulk sync drains quickly;
 * Discord then asks for 6–10s. Short enough to sit through.
 */
const MEMBER_ROLE_MAX_WAIT_MS = 15_000;

export type DiscordConfig = {
  token: string;
  guildId: string;
  captainRoleId: string | null;
  /** Text channel for per-match threads; null → no match threads. */
  matchesChannelId: string | null;
  /** Channel for 10-man pings; null → no 10-man pings. */
  tenManChannelId: string | null;
};

export function discordConfig(): DiscordConfig | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return {
    token: env.DISCORD_BOT_TOKEN,
    guildId: env.DISCORD_GUILD_ID,
    captainRoleId: env.DISCORD_CAPTAIN_ROLE_ID ?? null,
    matchesChannelId: env.DISCORD_MATCHES_CHANNEL_ID ?? null,
    tenManChannelId: env.DISCORD_TEN_MAN_CHANNEL_ID ?? null,
  };
}

/** Discord JSON error codes we react to. */
export const DISCORD_ERRORS = {
  unknownChannel: 10003,
  unknownMember: 10007,
  unknownRole: 10011,
  missingPermissions: 50013,
} as const;

export class DiscordApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | null,
    message: string,
  ) {
    super(`Discord ${status}${code ? ` (${code})` : ""}: ${message}`);
  }
}

export type DiscordMember = { user: { id: string; username: string } };
export type DiscordRole = { id: string; name: string };
export type DiscordChannel = { id: string; name: string; type: number; parent_id: string | null };

/** Channel types we create. */
export const CHANNEL_TYPE = { text: 0, voice: 2, category: 4 } as const;

/** Permission bits used in team-channel overwrites (all below 2^31, so plain numbers). */
export const PERMISSIONS = {
  manageChannels: 1 << 4,
  viewChannel: 1 << 10,
  sendMessages: 1 << 11,
  readMessageHistory: 1 << 16,
  connect: 1 << 20,
  speak: 1 << 21,
} as const;

export type PermissionOverwrite = {
  id: string;
  /** 0 = role, 1 = member */
  type: 0 | 1;
  allow?: string;
  deny?: string;
};

async function call<T>(
  cfg: DiscordConfig,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  {
    body,
    reason,
    maxWaitMs = MAX_WAIT_MS,
  }: { body?: unknown; reason?: string; maxWaitMs?: number } = {},
): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bot ${cfg.token}`,
        "User-Agent": USER_AGENT,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason) } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });

    // Rate limited: wait as long as Discord asks, a few times at most.
    if (res.status === 429) {
      const data = (await res.json().catch(() => null)) as { retry_after?: number } | null;
      const waitMs = Math.ceil((data?.retry_after ?? 1) * 1000);
      if (attempt >= MAX_RETRIES || waitMs > maxWaitMs) {
        throw new DiscordApiError(429, null, `rate limited, retry in ${Math.ceil(waitMs / 1000)}s`);
      }
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    if (res.status === 204) return null;
    const data = (await res.json().catch(() => null)) as
      | (T & { code?: number; message?: string })
      | null;
    if (!res.ok) {
      throw new DiscordApiError(res.status, data?.code ?? null, data?.message ?? res.statusText);
    }
    return data;
  }
}

/** Members whose username or nickname starts with `query` (Discord's prefix search). */
export async function searchMembers(cfg: DiscordConfig, query: string): Promise<DiscordMember[]> {
  const q = new URLSearchParams({ query, limit: "100" });
  return (
    (await call<DiscordMember[]>(cfg, "GET", `/guilds/${cfg.guildId}/members/search?${q}`)) ?? []
  );
}

export async function listRoles(cfg: DiscordConfig): Promise<DiscordRole[]> {
  return (await call<DiscordRole[]>(cfg, "GET", `/guilds/${cfg.guildId}/roles`)) ?? [];
}

export async function createRole(
  cfg: DiscordConfig,
  name: string,
  reason: string,
): Promise<DiscordRole> {
  const role = await call<DiscordRole>(cfg, "POST", `/guilds/${cfg.guildId}/roles`, {
    // Shown separately in the member list and @-mentionable; no permissions.
    body: { name: name.slice(0, 100), hoist: true, mentionable: true, permissions: "0" },
    reason,
  });
  return role!;
}

export async function deleteRole(cfg: DiscordConfig, roleId: string, reason: string) {
  await call(cfg, "DELETE", `/guilds/${cfg.guildId}/roles/${roleId}`, { reason });
}

export async function addMemberRole(
  cfg: DiscordConfig,
  userId: string,
  roleId: string,
  reason: string,
) {
  await call(cfg, "PUT", `/guilds/${cfg.guildId}/members/${userId}/roles/${roleId}`, {
    reason,
    maxWaitMs: MEMBER_ROLE_MAX_WAIT_MS,
  });
}

export async function removeMemberRole(
  cfg: DiscordConfig,
  userId: string,
  roleId: string,
  reason: string,
) {
  await call(cfg, "DELETE", `/guilds/${cfg.guildId}/members/${userId}/roles/${roleId}`, {
    reason,
    maxWaitMs: MEMBER_ROLE_MAX_WAIT_MS,
  });
}

export async function modifyRole(
  cfg: DiscordConfig,
  roleId: string,
  name: string,
  reason: string,
): Promise<void> {
  await call(cfg, "PATCH", `/guilds/${cfg.guildId}/roles/${roleId}`, {
    body: { name: name.slice(0, 100) },
    reason,
  });
}

let botUserId: string | null = null;

/** The bot's own user ID (for channel overwrites), cached per instance. */
export async function getBotUserId(cfg: DiscordConfig): Promise<string> {
  botUserId ??= (await call<{ id: string }>(cfg, "GET", "/users/@me"))!.id;
  return botUserId;
}

export async function listChannels(cfg: DiscordConfig): Promise<DiscordChannel[]> {
  return (await call<DiscordChannel[]>(cfg, "GET", `/guilds/${cfg.guildId}/channels`)) ?? [];
}

export async function createChannel(
  cfg: DiscordConfig,
  channel: {
    name: string;
    type: number;
    parent_id?: string | null;
    permission_overwrites?: PermissionOverwrite[];
  },
  reason: string,
): Promise<DiscordChannel> {
  const created = await call<DiscordChannel>(cfg, "POST", `/guilds/${cfg.guildId}/channels`, {
    body: { ...channel, name: channel.name.slice(0, 100) },
    reason,
  });
  return created!;
}

/** Rename a channel. Discord allows only 2 renames per channel per 10 minutes. */
export async function renameChannel(
  cfg: DiscordConfig,
  channelId: string,
  name: string,
  reason: string,
): Promise<void> {
  await call(cfg, "PATCH", `/channels/${channelId}`, {
    body: { name: name.slice(0, 100) },
    reason,
  });
}

/**
 * Posts a message. Only the roles in `mentionRoleIds` are actually pinged
 * (allowed_mentions), whatever else the text contains; link previews are off.
 */
export async function postMessage(
  cfg: DiscordConfig,
  channelId: string,
  content: string,
  mentionRoleIds: string[] = [],
): Promise<void> {
  await call(cfg, "POST", `/channels/${channelId}/messages`, {
    body: {
      content: content.slice(0, 2000),
      allowed_mentions: { parse: [], roles: mentionRoleIds },
      flags: 4, // SUPPRESS_EMBEDS
    },
  });
}

/** A public thread (not attached to a message) that stays open for a week of quiet. */
export async function startThread(
  cfg: DiscordConfig,
  channelId: string,
  name: string,
  reason: string,
): Promise<DiscordChannel> {
  const thread = await call<DiscordChannel>(cfg, "POST", `/channels/${channelId}/threads`, {
    body: { name: name.slice(0, 100), type: 11, auto_archive_duration: 10080 },
    reason,
  });
  return thread!;
}

export async function deleteChannel(cfg: DiscordConfig, channelId: string, reason: string) {
  await call(cfg, "DELETE", `/channels/${channelId}`, { reason });
}

/** Server nickname (max 32 chars). Fails for the server owner and members ranked above the bot. */
export async function setNickname(
  cfg: DiscordConfig,
  userId: string,
  nick: string,
  reason: string,
): Promise<void> {
  await call(cfg, "PATCH", `/guilds/${cfg.guildId}/members/${userId}`, {
    body: { nick: nick.slice(0, 32) },
    reason,
  });
}
