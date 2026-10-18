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

export type DiscordConfig = { token: string; guildId: string; captainRoleId: string | null };

export function discordConfig(): DiscordConfig | null {
  if (!env.DISCORD_BOT_TOKEN || !env.DISCORD_GUILD_ID) return null;
  return {
    token: env.DISCORD_BOT_TOKEN,
    guildId: env.DISCORD_GUILD_ID,
    captainRoleId: env.DISCORD_CAPTAIN_ROLE_ID ?? null,
  };
}

/** Discord JSON error codes we react to. */
export const DISCORD_ERRORS = {
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

async function call<T>(
  cfg: DiscordConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  { body, reason }: { body?: unknown; reason?: string } = {},
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
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const data = (await res.json().catch(() => null)) as { retry_after?: number } | null;
      const waitMs = Math.ceil((data?.retry_after ?? 1) * 1000);
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
  await call(cfg, "PUT", `/guilds/${cfg.guildId}/members/${userId}/roles/${roleId}`, { reason });
}

export async function removeMemberRole(
  cfg: DiscordConfig,
  userId: string,
  roleId: string,
  reason: string,
) {
  await call(cfg, "DELETE", `/guilds/${cfg.guildId}/members/${userId}/roles/${roleId}`, {
    reason,
  });
}
