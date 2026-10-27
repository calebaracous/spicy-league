import "server-only";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasonCaptains, seasons } from "@/db/schema/seasons";
import {
  addMemberRole,
  CHANNEL_TYPE,
  createChannel,
  createRole,
  deleteRole,
  DISCORD_ERRORS,
  DiscordApiError,
  discordConfig,
  getBotUserId,
  listChannels,
  listRoles,
  modifyRole,
  PERMISSIONS,
  removeMemberRole,
  renameChannel,
  searchMembers,
  type DiscordChannel,
  type DiscordConfig,
} from "@/lib/discord-api";
import { pickExactMember, roleHolderChanges, staleTeamRoles } from "@/lib/discord-plan";
import { teamTextChannelName } from "@/lib/team-name";

/**
 * Discord role + channel sync. Captains get the Captain role when a season
 * reaches `captains_selected`; once the draft finalizes each team gets a role
 * and private text/voice channels named after it, the role goes to its
 * roster, and the previous seasons' team roles are deleted. A team rename
 * renames its role and channels. All idempotent; admins re-run from the
 * admin season page.
 * See docs/DISCORD.md.
 */

export type DiscordSyncReport = {
  assigned: number;
  removed: number;
  rolesCreated: number;
  rolesDeleted: number;
  channelsCreated: number;
  /** Roles and channels renamed to match a team name. */
  renamed: number;
  /** People we couldn't give a role to, with why. */
  unmatched: string[];
  errors: string[];
};

/**
 * End-to-end test seasons (E2E_SLUG_PREFIX in tests/e2e/support/env.ts) never
 * touch Discord: a team sync for one would delete the real season's roles.
 */
export const isTestSeason = (slug: string) => slug.startsWith("e2e-");

export const emptyReport = (): DiscordSyncReport => ({
  assigned: 0,
  removed: 0,
  rolesCreated: 0,
  rolesDeleted: 0,
  channelsCreated: 0,
  renamed: 0,
  unmatched: [],
  errors: [],
});

export type Person = {
  id: string;
  label: string;
  discordUsername: string | null;
  discordUserId: string | null;
};

export async function loadPeople(userIds: string[]): Promise<Person[]> {
  if (userIds.length === 0) return [];
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      discordUsername: users.discordUsername,
      discordUserId: users.discordUserId,
    })
    .from(users)
    .where(inArray(users.id, userIds));
  return rows.map((r) => ({
    id: r.id,
    label: r.name ?? r.username ?? "?",
    discordUsername: r.discordUsername,
    discordUserId: r.discordUserId,
  }));
}

export function describe(err: unknown): string {
  if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.missingPermissions) {
    return "The bot is missing a permission. Check it has the permissions in docs/DISCORD.md and that its role sits above the league and team roles (Server Settings → Roles).";
  }
  if (err instanceof DiscordApiError && err.status === 429) {
    return `Discord rate limit (${err.message}); run Sync again later.`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Records why someone got no role, once per report (several roles hit the same people). */
export function noteUnmatched(report: DiscordSyncReport, line: string) {
  if (!report.unmatched.includes(line)) report.unmatched.push(line);
}

/** Discord user ID for `p`, searching the server by username the first time. */
export async function resolveDiscordId(
  cfg: DiscordConfig,
  p: Person,
  report: DiscordSyncReport,
): Promise<string | null> {
  if (!p.discordUsername) {
    noteUnmatched(report, `${p.label}: no Discord username on their profile`);
    return null;
  }
  if (p.discordUserId) return p.discordUserId;
  const member = pickExactMember(await searchMembers(cfg, p.discordUsername), p.discordUsername);
  if (!member) {
    noteUnmatched(report, `${p.label}: ${p.discordUsername} isn't in the Discord server`);
    return null;
  }
  await db.update(users).set({ discordUserId: member.user.id }).where(eq(users.id, p.id));
  p.discordUserId = member.user.id;
  return member.user.id;
}

export async function grant(
  cfg: DiscordConfig,
  p: Person,
  roleId: string,
  reason: string,
  report: DiscordSyncReport,
) {
  try {
    const discordId = await resolveDiscordId(cfg, p, report);
    if (!discordId) return;
    await addMemberRole(cfg, discordId, roleId, reason);
    report.assigned++;
  } catch (err) {
    if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.unknownMember) {
      // Left the server since we matched them: forget the ID so the next sync searches again.
      await db.update(users).set({ discordUserId: null }).where(eq(users.id, p.id));
      noteUnmatched(report, `${p.label}: ${p.discordUsername} isn't in the Discord server`);
      return;
    }
    report.errors.push(`${p.label}: ${describe(err)}`);
  }
}

/** League-wide roles the bot keeps on exactly the right people (looked up by name). */
export const LEAGUE_ROLES = {
  captain: "Captain",
  signedUp: "Signed up",
  subList: "Sub list",
  tenMan: "10-man",
  champion: "Champion",
} as const;

/** A league role's ID: the env override, else the role with that name, else a new one. */
export async function leagueRoleId(
  cfg: DiscordConfig,
  name: string,
  report: DiscordSyncReport,
  override: string | null = null,
): Promise<string> {
  if (override) return override;
  const existing = (await listRoles(cfg)).find((r) => r.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const role = await createRole(cfg, name, `Spicy League: ${name} role`);
  report.rolesCreated++;
  return role.id;
}

/** Takes a role off someone we've matched before. Not in the server any more → nothing to do. */
export async function revoke(
  cfg: DiscordConfig,
  p: Person,
  roleId: string,
  reason: string,
  report: DiscordSyncReport,
) {
  if (!p.discordUserId) return;
  try {
    await removeMemberRole(cfg, p.discordUserId, roleId, reason);
    report.removed++;
  } catch (err) {
    if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.unknownMember) return;
    report.errors.push(`${p.label}: ${describe(err)}`);
  }
}

/**
 * Makes `holderIds` the role's holders: grants it to them and removes it from
 * `formerIds` who aren't holders (e.g. the same role's holders from other
 * seasons). Users the app never matched to Discord are skipped on removal.
 */
export async function syncExclusiveRole(
  cfg: DiscordConfig,
  roleName: string,
  holderIds: string[],
  formerIds: string[],
  reason: string,
  report: DiscordSyncReport,
  override: string | null = null,
) {
  const { add, remove } = roleHolderChanges(holderIds, formerIds);
  try {
    const roleId = await leagueRoleId(cfg, roleName, report, override);
    for (const p of await loadPeople(remove)) await revoke(cfg, p, roleId, reason, report);
    for (const p of await loadPeople(add)) await grant(cfg, p, roleId, reason, report);
  } catch (err) {
    report.errors.push(`${roleName}: ${describe(err)}`);
  }
}

/** Captain role = this season's captains (both of a duo); past captains lose it. */
export async function syncCaptainRole(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;
  const [current, others] = await Promise.all([
    db
      .select({ userId: seasonCaptains.userId })
      .from(seasonCaptains)
      .where(eq(seasonCaptains.seasonId, seasonId)),
    db
      .select({ userId: seasonCaptains.userId })
      .from(seasonCaptains)
      .where(ne(seasonCaptains.seasonId, seasonId)),
  ]);
  await syncExclusiveRole(
    cfg,
    LEAGUE_ROLES.captain,
    current.map((c) => c.userId),
    others.map((c) => c.userId),
    `Spicy League: ${season.name} captains`,
    report,
    cfg.captainRoleId,
  );
  return report;
}

type Season = typeof seasons.$inferSelect;
type Team = typeof teams.$inferSelect;

/** Live Discord state a team sync works against, fetched once per sync. */
type GuildState = {
  roles: Map<string, string>;
  channels: Map<string, DiscordChannel>;
  categoryId: string;
  botUserId: string;
};

async function loadGuildState(
  cfg: DiscordConfig,
  season: Season,
  report: DiscordSyncReport,
): Promise<GuildState> {
  const [roles, channels, botUserId] = await Promise.all([
    listRoles(cfg),
    listChannels(cfg),
    getBotUserId(cfg),
  ]);
  const channelMap = new Map(channels.map((c) => [c.id, c]));
  // One category per season holds its team channels.
  let categoryId = season.discordCategoryId;
  if (!categoryId || !channelMap.has(categoryId)) {
    const category = await createChannel(
      cfg,
      { name: season.name, type: CHANNEL_TYPE.category },
      `Spicy League: ${season.name} team channels`,
    );
    categoryId = category.id;
    report.channelsCreated++;
    await db
      .update(seasons)
      .set({ discordCategoryId: categoryId })
      .where(eq(seasons.id, season.id));
  }
  return {
    roles: new Map(roles.map((r) => [r.id, r.name])),
    channels: channelMap,
    categoryId,
    botUserId,
  };
}

/** Team channels are private: hidden from @everyone, open to the team role and the bot. */
function teamOverwrites(cfg: DiscordConfig, roleId: string, botUserId: string) {
  const P = PERMISSIONS;
  return [
    // @everyone's role ID is the guild ID.
    { id: cfg.guildId, type: 0 as const, deny: String(P.viewChannel) },
    {
      id: roleId,
      type: 0 as const,
      allow: String(P.viewChannel | P.sendMessages | P.readMessageHistory | P.connect | P.speak),
    },
    // So the bot can still see (and rename) the channel.
    {
      id: botUserId,
      type: 1 as const,
      allow: String(P.viewChannel | P.manageChannels | P.sendMessages | P.connect),
    },
  ];
}

/**
 * Makes the team's role, text channel and voice channel exist and carry the
 * team's current name: creates what's missing (or was deleted in Discord),
 * renames what's out of date. Returns the role ID. Rename failures (Discord
 * allows 2 channel renames per 10 minutes) are reported, not thrown.
 */
async function ensureTeamDiscord(
  cfg: DiscordConfig,
  team: Team,
  guild: GuildState,
  reason: string,
  report: DiscordSyncReport,
): Promise<string> {
  let roleId = team.discordRoleId;
  if (!roleId || !guild.roles.has(roleId)) {
    roleId = (await createRole(cfg, team.name, reason)).id;
    guild.roles.set(roleId, team.name);
    report.rolesCreated++;
    await db.update(teams).set({ discordRoleId: roleId }).where(eq(teams.id, team.id));
  } else if (guild.roles.get(roleId) !== team.name) {
    try {
      await modifyRole(cfg, roleId, team.name, reason);
      guild.roles.set(roleId, team.name);
      report.renamed++;
    } catch (err) {
      report.errors.push(`${team.name} role: ${describe(err)}`);
    }
  }

  for (const kind of ["text", "voice"] as const) {
    const column = kind === "text" ? "discordTextChannelId" : "discordVoiceChannelId";
    const name = kind === "text" ? teamTextChannelName(team.name) : team.name;
    const currentId = team[column];
    const existing = currentId ? guild.channels.get(currentId) : undefined;
    if (!existing) {
      const created = await createChannel(
        cfg,
        {
          name,
          type: CHANNEL_TYPE[kind],
          parent_id: guild.categoryId,
          permission_overwrites: teamOverwrites(cfg, roleId, guild.botUserId),
        },
        reason,
      );
      guild.channels.set(created.id, created);
      report.channelsCreated++;
      await db
        .update(teams)
        .set(
          kind === "text"
            ? { discordTextChannelId: created.id }
            : { discordVoiceChannelId: created.id },
        )
        .where(eq(teams.id, team.id));
    } else if (existing.name !== name) {
      try {
        await renameChannel(cfg, existing.id, name, reason);
        existing.name = name;
        report.renamed++;
      } catch (err) {
        const note =
          err instanceof DiscordApiError && err.status === 429
            ? " Channels can only be renamed twice per 10 minutes."
            : "";
        report.errors.push(`${team.name} ${kind} channel: ${describe(err)}${note}`);
      }
    }
  }
  return roleId;
}

/**
 * Per team: a role, a private text channel and a private voice channel (in a
 * category for the season), all named after the team, with the role given to
 * the whole roster. Deletes the bot's team roles from earlier seasons first;
 * their channels stay, now visible only to admins. Safe to re-run: existing
 * roles/channels are reused and renamed, missing ones recreated.
 */
export async function syncTeamRoles(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;
  const seasonTeams = await db.select().from(teams).where(eq(teams.seasonId, seasonId));
  if (seasonTeams.length === 0) return report;

  try {
    // Earlier seasons' team roles go first.
    const otherTeams = await db
      .select({
        id: teams.id,
        discordRoleId: teams.discordRoleId,
        seasonCreatedAt: seasons.createdAt,
      })
      .from(teams)
      .innerJoin(seasons, eq(teams.seasonId, seasons.id))
      .where(and(ne(teams.seasonId, seasonId), isNotNull(teams.discordRoleId)));
    for (const t of staleTeamRoles(otherTeams, season.createdAt)) {
      try {
        await deleteRole(cfg, t.discordRoleId!, `Spicy League: replaced by ${season.name} teams`);
        report.rolesDeleted++;
      } catch (err) {
        if (!(err instanceof DiscordApiError && err.code === DISCORD_ERRORS.unknownRole)) {
          report.errors.push(describe(err));
          continue;
        }
      }
      await db.update(teams).set({ discordRoleId: null }).where(eq(teams.id, t.id));
    }

    const guild = await loadGuildState(cfg, season, report);
    const reason = `Spicy League: ${season.name} teams`;
    for (const team of seasonTeams) {
      const roleId = await ensureTeamDiscord(cfg, team, guild, reason, report);
      const roster = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, team.id));
      for (const p of await loadPeople(roster.map((r) => r.userId))) {
        await grant(cfg, p, roleId, reason, report);
      }
    }
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/**
 * After a captain renames their team: rename its Discord role and channels.
 * Does nothing until the team's Discord setup exists (the draft-finish or
 * admin sync creates it, already using the current name).
 */
export async function renameTeamInDiscord(teamId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;

  const team = await db.query.teams.findFirst({ where: eq(teams.id, teamId) });
  if (!team?.discordRoleId) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, team.seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  try {
    const guild = await loadGuildState(cfg, season, report);
    await ensureTeamDiscord(cfg, team, guild, `Spicy League: team renamed to ${team.name}`, report);
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/** Adds reports together (for syncs that run several steps). */
export function mergeReports(...reports: DiscordSyncReport[]): DiscordSyncReport {
  const total = emptyReport();
  for (const r of reports) {
    total.assigned += r.assigned;
    total.removed += r.removed;
    total.rolesCreated += r.rolesCreated;
    total.rolesDeleted += r.rolesDeleted;
    total.channelsCreated += r.channelsCreated;
    total.renamed += r.renamed;
    for (const u of r.unmatched) noteUnmatched(total, u);
    total.errors.push(...r.errors);
  }
  return total;
}

/**
 * Runs a sync after the response is sent (Next's `after`, which also runs when
 * the action redirects), so Discord never slows down or breaks the request.
 * Results go to the function logs; admins can re-run from the season page.
 */
export function syncInBackground(label: string, sync: () => Promise<DiscordSyncReport>) {
  if (!discordConfig()) return;
  after(async () => {
    try {
      const report = await sync();
      const log = report.errors.length ? console.error : console.info;
      log(`[discord] ${label}`, JSON.stringify(report));
    } catch (err) {
      console.error(`[discord] ${label} failed`, err);
    }
  });
}
