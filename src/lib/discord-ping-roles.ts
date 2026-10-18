import "server-only";

import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasonSignups, seasons } from "@/db/schema/seasons";
import { discordConfig } from "@/lib/discord-api";
import {
  emptyReport,
  grant,
  isTestSeason,
  LEAGUE_ROLES,
  leagueRoleId,
  loadPeople,
  revoke,
  syncExclusiveRole,
  describe,
  type DiscordSyncReport,
} from "@/lib/discord-roles";
import { getAvailableSubs } from "@/lib/substitutions";

/**
 * Ping roles: Discord roles that exist so people can be @-mentioned as a
 * group. All kept in step with the site (see docs/DISCORD.md):
 *   - Signed up — this season's player signups
 *   - Sub list  — this season's available subs (sub signups + undrafted players)
 *   - Champion  — the most recent champion team's roster
 *   - 10-man    — players who opted in on /profile
 */

async function signupHolders(seasonId: string) {
  const [players, subs] = await Promise.all([
    db
      .select({ userId: seasonSignups.userId })
      .from(seasonSignups)
      .where(and(eq(seasonSignups.seasonId, seasonId), eq(seasonSignups.kind, "player"))),
    getAvailableSubs(seasonId),
  ]);
  return { signedUp: players.map((p) => p.userId), subList: subs.map((s) => s.userId) };
}

/**
 * Full sync of Signed up + Sub list for a season: holders get them, everyone
 * else who signed up for any season loses them. Run when signups open, when
 * the draft finishes (undrafted players join the sub list) and by admin Sync.
 */
export async function syncSignupRoles(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  const [{ signedUp, subList }, everyone] = await Promise.all([
    signupHolders(seasonId),
    db.selectDistinct({ userId: seasonSignups.userId }).from(seasonSignups),
  ]);
  const all = everyone.map((e) => e.userId);
  const reason = `Spicy League: ${season.name} signups`;
  await syncExclusiveRole(cfg, LEAGUE_ROLES.signedUp, signedUp, all, reason, report);
  await syncExclusiveRole(cfg, LEAGUE_ROLES.subList, subList, all, reason, report);
  return report;
}

/** One user's Signed up / Sub list roles after they sign up, leave, or are removed. */
export async function updateSignupRolesForUser(
  seasonId: string,
  userId: string,
): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  const [person] = await loadPeople([userId]);
  if (!person) return report;
  const { signedUp, subList } = await signupHolders(seasonId);
  const reason = `Spicy League: ${season.name} signups`;
  try {
    for (const [name, holds] of [
      [LEAGUE_ROLES.signedUp, signedUp.includes(userId)],
      [LEAGUE_ROLES.subList, subList.includes(userId)],
    ] as const) {
      const roleId = await leagueRoleId(cfg, name, report);
      if (holds) await grant(cfg, person, roleId, reason, report);
      else await revoke(cfg, person, roleId, reason, report);
    }
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/**
 * Champion = the roster of the season's champion team (none if the final was
 * reset). Removed from every other team that ever won, and from this season's
 * other teams, so it always means "current champions".
 */
export async function syncChampionRole(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  const championTeamIds = (
    await db
      .select({ teamId: seasons.championTeamId })
      .from(seasons)
      .where(and(ne(seasons.id, seasonId), isNotNull(seasons.championTeamId)))
  ).map((r) => r.teamId!);
  const thisSeasonTeams = (
    await db.select({ id: teams.id }).from(teams).where(eq(teams.seasonId, seasonId))
  ).map((t) => t.id);
  const formerTeamIds = [...championTeamIds, ...thisSeasonTeams];

  const [holders, formers] = await Promise.all([
    season.championTeamId
      ? db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(eq(teamMembers.teamId, season.championTeamId))
      : Promise.resolve([]),
    formerTeamIds.length
      ? db
          .select({ userId: teamMembers.userId })
          .from(teamMembers)
          .where(inArray(teamMembers.teamId, formerTeamIds))
      : Promise.resolve([]),
  ]);
  await syncExclusiveRole(
    cfg,
    LEAGUE_ROLES.champion,
    holders.map((h) => h.userId),
    formers.map((f) => f.userId),
    `Spicy League: ${season.name} champions`,
    report,
  );
  return report;
}

/** After someone toggles "ping me for 10-mans" on their profile. */
export async function setTenManRole(userId: string, on: boolean): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const [person] = await loadPeople([userId]);
  if (!person) return report;
  try {
    const roleId = await leagueRoleId(cfg, LEAGUE_ROLES.tenMan, report);
    const reason = "Spicy League: 10-man pings";
    if (on) await grant(cfg, person, roleId, reason, report);
    else await revoke(cfg, person, roleId, reason, report);
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/** Admin Sync: everyone opted in to 10-man pings gets the role (opt-outs are handled on toggle). */
export async function syncTenManRole(): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const optedIn = await db.select({ id: users.id }).from(users).where(eq(users.tenManPings, true));
  if (optedIn.length === 0) return report;
  try {
    const roleId = await leagueRoleId(cfg, LEAGUE_ROLES.tenMan, report);
    for (const p of await loadPeople(optedIn.map((u) => u.id))) {
      await grant(cfg, p, roleId, "Spicy League: 10-man pings", report);
    }
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}
