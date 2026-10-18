import "server-only";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { after } from "next/server";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasonCaptains, seasons } from "@/db/schema/seasons";
import {
  addMemberRole,
  createRole,
  deleteRole,
  DISCORD_ERRORS,
  DiscordApiError,
  discordConfig,
  listRoles,
  removeMemberRole,
  searchMembers,
  type DiscordConfig,
} from "@/lib/discord-api";
import { captainRoleChanges, pickExactMember, staleTeamRoles } from "@/lib/discord-plan";

/**
 * Discord role sync (bot v1). Captains get the Captain role when a season
 * reaches `captains_selected`; once the draft finalizes every rostered player
 * gets their team's role, and the previous seasons' team roles are deleted.
 * Both syncs are idempotent; admins re-run them from the admin season page.
 * See docs/DISCORD.md.
 */

export type DiscordSyncReport = {
  assigned: number;
  removed: number;
  rolesCreated: number;
  rolesDeleted: number;
  /** People we couldn't give a role to, with why. */
  unmatched: string[];
  errors: string[];
};

/**
 * End-to-end test seasons (E2E_SLUG_PREFIX in tests/e2e/support/env.ts) never
 * touch Discord: a team sync for one would delete the real season's roles.
 */
const isTestSeason = (slug: string) => slug.startsWith("e2e-");

const emptyReport = (): DiscordSyncReport => ({
  assigned: 0,
  removed: 0,
  rolesCreated: 0,
  rolesDeleted: 0,
  unmatched: [],
  errors: [],
});

type Person = {
  id: string;
  label: string;
  discordUsername: string | null;
  discordUserId: string | null;
};

async function loadPeople(userIds: string[]): Promise<Person[]> {
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

function describe(err: unknown): string {
  if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.missingPermissions) {
    return "The bot can't manage that role. In Server Settings → Roles, drag the bot's role above Captain and the team roles.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** Discord user ID for `p`, searching the server by username the first time. */
async function resolveDiscordId(
  cfg: DiscordConfig,
  p: Person,
  report: DiscordSyncReport,
): Promise<string | null> {
  if (!p.discordUsername) {
    report.unmatched.push(`${p.label}: no Discord username on their profile`);
    return null;
  }
  if (p.discordUserId) return p.discordUserId;
  const member = pickExactMember(await searchMembers(cfg, p.discordUsername), p.discordUsername);
  if (!member) {
    report.unmatched.push(`${p.label}: ${p.discordUsername} isn't in the Discord server`);
    return null;
  }
  await db.update(users).set({ discordUserId: member.user.id }).where(eq(users.id, p.id));
  p.discordUserId = member.user.id;
  return member.user.id;
}

async function grant(
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
      report.unmatched.push(`${p.label}: ${p.discordUsername} isn't in the Discord server`);
      return;
    }
    report.errors.push(`${p.label}: ${describe(err)}`);
  }
}

async function captainRoleId(cfg: DiscordConfig, report: DiscordSyncReport): Promise<string> {
  if (cfg.captainRoleId) return cfg.captainRoleId;
  const existing = (await listRoles(cfg)).find((r) => r.name.toLowerCase() === "captain");
  if (existing) return existing.id;
  const role = await createRole(cfg, "Captain", "Spicy League: captain role");
  report.rolesCreated++;
  return role.id;
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
  const { add, remove } = captainRoleChanges(
    current.map((c) => c.userId),
    others.map((c) => c.userId),
  );

  try {
    const roleId = await captainRoleId(cfg, report);
    const reason = `Spicy League: ${season.name} captains`;
    for (const p of await loadPeople(remove)) {
      if (!p.discordUserId) continue;
      try {
        await removeMemberRole(cfg, p.discordUserId, roleId, reason);
        report.removed++;
      } catch (err) {
        if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.unknownMember) continue;
        report.errors.push(`${p.label}: ${describe(err)}`);
      }
    }
    for (const p of await loadPeople(add)) await grant(cfg, p, roleId, reason, report);
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/**
 * One role per team (named after it), given to its whole roster. Deletes the
 * bot's team roles from earlier seasons first. Safe to re-run: existing roles
 * are reused, and recreated if someone deleted them in Discord.
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

    const existingRoles = new Set((await listRoles(cfg)).map((r) => r.id));
    const reason = `Spicy League: ${season.name} teams`;
    for (const team of seasonTeams) {
      let roleId = team.discordRoleId;
      if (!roleId || !existingRoles.has(roleId)) {
        roleId = (await createRole(cfg, team.name, reason)).id;
        report.rolesCreated++;
        await db.update(teams).set({ discordRoleId: roleId }).where(eq(teams.id, team.id));
      }
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

/** Both syncs, for the admin "Sync Discord roles" button. */
export async function syncSeasonDiscordRoles(seasonId: string): Promise<DiscordSyncReport> {
  const a = await syncCaptainRole(seasonId);
  const b = await syncTeamRoles(seasonId);
  return {
    assigned: a.assigned + b.assigned,
    removed: a.removed + b.removed,
    rolesCreated: a.rolesCreated + b.rolesCreated,
    rolesDeleted: a.rolesDeleted + b.rolesDeleted,
    unmatched: [...new Set([...a.unmatched, ...b.unmatched])],
    errors: [...a.errors, ...b.errors],
  };
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

/** Who the season's Discord roles cover, for the admin Discord card. DB only — no API calls. */
export async function getDiscordRoster(seasonId: string) {
  const [captainRows, memberRows] = await Promise.all([
    db
      .select({ userId: seasonCaptains.userId })
      .from(seasonCaptains)
      .where(eq(seasonCaptains.seasonId, seasonId)),
    db
      .select({ userId: teamMembers.userId, teamName: teams.name })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teams.seasonId, seasonId)),
  ]);
  const captains = new Set(captainRows.map((c) => c.userId));
  const teamOf = new Map(memberRows.map((m) => [m.userId, m.teamName]));
  const people = await loadPeople([...new Set([...captains, ...teamOf.keys()])]);
  return people
    .map((p) => ({
      ...p,
      captain: captains.has(p.id),
      teamName: teamOf.get(p.id) ?? null,
    }))
    .sort(
      (a, b) =>
        (a.teamName ?? "").localeCompare(b.teamName ?? "") ||
        Number(b.captain) - Number(a.captain) ||
        a.label.localeCompare(b.label),
    );
}
