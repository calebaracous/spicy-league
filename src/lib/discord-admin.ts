import "server-only";

import { and, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { Resend } from "resend";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasonCaptains, seasonSignups, seasons } from "@/db/schema/seasons";
import {
  deleteChannel,
  DISCORD_ERRORS,
  DiscordApiError,
  discordConfig,
  setNickname,
} from "@/lib/discord-api";
import {
  describe,
  emptyReport,
  isTestSeason,
  loadPeople,
  resolveDiscordId,
  type DiscordSyncReport,
} from "@/lib/discord-roles";
import { env } from "@/lib/env";

/**
 * Admin Discord tools on /admin/seasons/[slug] (see docs/DISCORD.md):
 * the season's people and their match status, emailing the unmatched,
 * setting server nicknames, and deleting older seasons' team channels.
 */

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** Everyone the season's Discord roles cover — signups, captains, rosters. DB only. */
export async function getDiscordRoster(seasonId: string) {
  const [signupRows, captainRows, memberRows] = await Promise.all([
    db
      .select({ userId: seasonSignups.userId, kind: seasonSignups.kind })
      .from(seasonSignups)
      .where(eq(seasonSignups.seasonId, seasonId)),
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
  const kindOf = new Map(signupRows.map((s) => [s.userId, s.kind]));
  const captains = new Set(captainRows.map((c) => c.userId));
  const teamOf = new Map(memberRows.map((m) => [m.userId, m.teamName]));
  const people = await loadPeople([...new Set([...kindOf.keys(), ...captains, ...teamOf.keys()])]);
  return people
    .map((p) => ({
      ...p,
      captain: captains.has(p.id),
      teamName: teamOf.get(p.id) ?? null,
      sub: kindOf.get(p.id) === "sub",
    }))
    .sort(
      (a, b) =>
        Number(!a.teamName) - Number(!b.teamName) ||
        (a.teamName ?? "").localeCompare(b.teamName ?? "") ||
        Number(b.captain) - Number(a.captain) ||
        a.label.localeCompare(b.label),
    );
}

/** Server nickname = site display name, for everyone in the season we can match. */
export async function syncNicknames(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  for (const p of await getDiscordRoster(seasonId)) {
    try {
      const discordId = await resolveDiscordId(cfg, p, report);
      if (!discordId) continue;
      await setNickname(cfg, discordId, p.label, "Spicy League: match site name");
      report.renamed++;
    } catch (err) {
      if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.missingPermissions) {
        // The owner and anyone ranked above the bot can't be renamed by it.
        report.errors.push(
          `${p.label}: can't change their nickname (server owner or ranked above the bot)`,
        );
      } else {
        report.errors.push(`${p.label}: ${describe(err)}`);
      }
    }
  }
  return report;
}

/**
 * Deletes the team text/voice channels (and season category) of every season
 * created before this one. Irreversible: their message history goes too.
 */
export async function deleteOldTeamChannels(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || isTestSeason(season.slug)) return report;

  const older = await db
    .select({ id: seasons.id, discordCategoryId: seasons.discordCategoryId })
    .from(seasons)
    .where(lt(seasons.createdAt, season.createdAt));
  const olderIds = older.map((s) => s.id);
  if (olderIds.length === 0) return report;

  const oldTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      text: teams.discordTextChannelId,
      voice: teams.discordVoiceChannelId,
    })
    .from(teams)
    .where(
      and(
        inArray(teams.seasonId, olderIds),
        or(isNotNull(teams.discordTextChannelId), isNotNull(teams.discordVoiceChannelId)),
      ),
    );

  const reason = `Spicy League: cleanup before ${season.name}`;
  const remove = async (channelId: string, label: string) => {
    try {
      await deleteChannel(cfg, channelId, reason);
      report.rolesDeleted++;
      return true;
    } catch (err) {
      if (err instanceof DiscordApiError && err.code === DISCORD_ERRORS.unknownChannel) return true;
      report.errors.push(`${label}: ${describe(err)}`);
      return false;
    }
  };

  for (const t of oldTeams) {
    const textGone = t.text ? await remove(t.text, `${t.name} text channel`) : true;
    const voiceGone = t.voice ? await remove(t.voice, `${t.name} voice channel`) : true;
    await db
      .update(teams)
      .set({
        ...(textGone ? { discordTextChannelId: null } : {}),
        ...(voiceGone ? { discordVoiceChannelId: null } : {}),
      })
      .where(eq(teams.id, t.id));
  }
  for (const s of older) {
    if (s.discordCategoryId && (await remove(s.discordCategoryId, "season category"))) {
      await db.update(seasons).set({ discordCategoryId: null }).where(eq(seasons.id, s.id));
    }
  }
  return report;
}

/**
 * Emails everyone in the season who can't get Discord roles yet: no Discord
 * username, or a username nobody in the server has (as of the last sync).
 * Returns how many emails went out.
 */
export async function emailUnmatchedPlayers(
  seasonId: string,
): Promise<{ sent: number; failed: number }> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  if (!season || !env.AUTH_RESEND_KEY) return { sent: 0, failed: 0 };
  const targets = (await getDiscordRoster(seasonId)).filter(
    (p) => !p.discordUsername || !p.discordUserId,
  );
  if (targets.length === 0) return { sent: 0, failed: 0 };

  const emails = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      inArray(
        users.id,
        targets.map((t) => t.id),
      ),
    );
  const emailOf = new Map(emails.map((e) => [e.id, e.email]));
  const site = (env.NEXT_PUBLIC_APP_URL ?? "https://www.spicyleague.dev").replace(/\/$/, "");
  const invite = env.DISCORD_INVITE_URL
    ? `<p>Not in the server yet? <a href="${env.DISCORD_INVITE_URL}">Join the Spicy League Discord</a>.</p>`
    : "";
  const resend = new Resend(env.AUTH_RESEND_KEY);
  const from = env.AUTH_EMAIL_FROM ?? "no-reply@spicyleague.dev";

  let sent = 0;
  let failed = 0;
  for (const p of targets) {
    const to = emailOf.get(p.id);
    if (!to) continue;
    const problem = p.discordUsername
      ? `<p>We couldn't find <strong>${escapeHtml(p.discordUsername)}</strong> in the Spicy League Discord server, so the bot can't give you your ${escapeHtml(season.name)} roles and team channel.</p><p>Check it's your Discord <em>username</em> (not your display name) on <a href="${site}/profile">your profile</a>, and that you've joined the server.</p>`
      : `<p>Your Spicy League account doesn't have a Discord username yet, so the bot can't give you your ${escapeHtml(season.name)} roles and team channel.</p><p>Add it on <a href="${site}/profile">your profile</a>.</p>`;
    try {
      const { error } = await resend.emails.send({
        from,
        to,
        subject: `Add your Discord for ${season.name} — Spicy League`,
        html: `<p>Hi ${escapeHtml(p.label)},</p>${problem}${invite}`,
      });
      if (error) failed++;
      else sent++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}
