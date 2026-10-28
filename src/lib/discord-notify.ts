import "server-only";

import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teams } from "@/db/schema/drafts";
import { matches, matchSubstitutions, type Match } from "@/db/schema/matches";
import { seasons, type Season } from "@/db/schema/seasons";
import { discordConfig, postMessage, startThread, type DiscordConfig } from "@/lib/discord-api";
import {
  channelMention,
  discordTime,
  matchThreadName,
  resultLine,
  roleMention,
} from "@/lib/discord-format";
import {
  describe,
  emptyReport,
  isTestSeason,
  LEAGUE_ROLES,
  leagueRoleId,
  type DiscordSyncReport,
} from "@/lib/discord-roles";
import { env } from "@/lib/env";
import { FEARLESS_DRAFT_RULE, fearlessApplies, roundLabel } from "@/lib/match-format";

/**
 * The bot's match coordination posts (see docs/DISCORD.md):
 *   - one thread per match in DISCORD_MATCHES_CHANNEL_ID, tagging both teams
 *   - each team's group schedule posted in its private channel
 *   - result reported / confirmed / disputed / reset notes in the match thread
 *   - sub request decisions in the requesting team's channel
 *   - captains' "ping the sub list" and the 10-man open ping
 *   - daily reminders (cron)
 * Everything is best-effort: failures land in the report / logs, never in
 * the user's request.
 */

const appUrl = () => (env.NEXT_PUBLIC_APP_URL ?? "https://www.spicyleague.dev").replace(/\/$/, "");
const matchUrl = (slug: string, matchId: string) =>
  `${appUrl()}/seasons/${slug}/matches/${matchId}`;

type TeamInfo = {
  id: string;
  name: string;
  discordRoleId: string | null;
  discordTextChannelId: string | null;
};

async function teamsById(seasonId: string): Promise<Map<string, TeamInfo>> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      discordRoleId: teams.discordRoleId,
      discordTextChannelId: teams.discordTextChannelId,
    })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));
  return new Map(rows.map((t) => [t.id, t]));
}

async function liveSeason(seasonId: string): Promise<Season | null> {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.id, seasonId) });
  return season && !isTestSeason(season.slug) ? season : null;
}

/** " (best-of-2 series, fearless draft)" for the team schedule post, or "". */
function scheduleFormat(season: Season): string {
  const parts = [
    season.groupBestOf === 2 ? "best-of-2 series" : "",
    season.fearlessDraft ? "fearless draft" : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

const mentionOf = (t: TeamInfo | undefined) =>
  t?.discordRoleId ? roleMention(t.discordRoleId) : `**${t?.name ?? "?"}**`;
const rolesOf = (...ts: Array<TeamInfo | undefined>) =>
  ts.map((t) => t?.discordRoleId).filter((id): id is string => !!id);

/** A thread for every unconfirmed match that doesn't have one yet, tagging both teams. */
export async function ensureMatchThreads(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg?.matchesChannelId) return report;
  const season = await liveSeason(seasonId);
  if (!season) return report;

  const [pending, byId] = await Promise.all([
    db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.seasonId, seasonId),
          isNull(matches.discordThreadId),
          ne(matches.state, "confirmed"),
        ),
      )
      .orderBy(asc(matches.round)),
    teamsById(seasonId),
  ]);
  for (const m of pending) {
    const home = byId.get(m.homeTeamId);
    const away = byId.get(m.awayTeamId);
    const label = roundLabel(m.stage, m.round);
    try {
      const thread = await startThread(
        cfg,
        cfg.matchesChannelId,
        matchThreadName(label, home?.name ?? "?", away?.name ?? "?"),
        `Spicy League: ${season.name} match`,
      );
      await db.update(matches).set({ discordThreadId: thread.id }).where(eq(matches.id, m.id));
      report.channelsCreated++;
      const format = [
        m.stage === "group" && season.groupBestOf === 2
          ? "Best of 2 (2–0, 1–1 or 0–2)."
          : m.stage === "tiebreaker"
            ? "Best of 1 tiebreaker."
            : "",
        fearlessApplies(season, m.stage) ? `Fearless draft: ${FEARLESS_DRAFT_RULE}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      await postMessage(
        cfg,
        thread.id,
        [
          `**${season.name} · ${label}**: ${mentionOf(home)} vs ${mentionOf(away)}. ${format}`.trim(),
          "Use this thread to agree on a time. Report the result on the site when you're done:",
          matchUrl(season.slug, m.id),
        ].join("\n"),
        rolesOf(home, away),
      );
    } catch (err) {
      report.errors.push(`${label} thread: ${describe(err)}`);
    }
  }
  return report;
}

/** Each team's group fixtures, in its private channel. Posted once, when the schedule is generated. */
export async function postTeamSchedules(seasonId: string): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const season = await liveSeason(seasonId);
  if (!season) return report;

  const [groupMatches, byId] = await Promise.all([
    db
      .select()
      .from(matches)
      .where(and(eq(matches.seasonId, seasonId), eq(matches.stage, "group")))
      .orderBy(asc(matches.round)),
    teamsById(seasonId),
  ]);
  for (const team of byId.values()) {
    if (!team.discordTextChannelId) continue;
    const lines = groupMatches
      .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
      .map((m) => {
        const opp = byId.get(m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId);
        const where = m.discordThreadId
          ? channelMention(m.discordThreadId)
          : matchUrl(season.slug, m.id);
        return `• Round ${m.round}: vs **${opp?.name ?? "?"}** — ${where}`;
      });
    if (lines.length === 0) continue;
    const when = season.groupStageEndsAt
      ? ` The group stage ends ${discordTime(season.groupStageEndsAt)}.`
      : "";
    try {
      await postMessage(
        cfg,
        team.discordTextChannelId,
        [
          `**Your ${season.name} group stage schedule**${scheduleFormat(season)}:`,
          ...lines,
          `Agree on times with the other captain in each match thread.${when}`,
        ].join("\n"),
      );
    } catch (err) {
      report.errors.push(`${team.name} schedule: ${describe(err)}`);
    }
  }
  return report;
}

export type MatchEvent = "reported" | "confirmed" | "disputed" | "reset";

/**
 * A note in the match thread. On "reported", the team that didn't report is
 * pinged so they can flag a wrong result to an admin before it's confirmed.
 */
export async function notifyMatchEvent(
  matchId: string,
  event: MatchEvent,
  reportingTeamId: string | null = null,
): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match?.discordThreadId) return report;
  const season = await liveSeason(match.seasonId);
  if (!season) return report;
  const byId = await teamsById(match.seasonId);
  const home = byId.get(match.homeTeamId);
  const away = byId.get(match.awayTeamId);
  const line = resultLine({
    home: home?.name ?? "?",
    away: away?.name ?? "?",
    homeScore: match.homeScore,
    awayScore: match.awayScore,
    winner: match.winnerTeamId ? (byId.get(match.winnerTeamId)?.name ?? "?") : null,
  });

  let content: string;
  let ping: string[] = [];
  if (event === "reported") {
    const others =
      reportingTeamId === home?.id ? [away] : reportingTeamId === away?.id ? [home] : [home, away];
    ping = rolesOf(...others);
    content = `Result reported: **${line}**. ${others.map(mentionOf).join(" ")}, if that's wrong, tell an admin before it's confirmed.`;
  } else if (event === "confirmed") {
    content = `✅ Confirmed: **${line}**.`;
  } else if (event === "disputed") {
    content = "⚠️ The reported result is disputed. An admin will sort it out.";
  } else {
    content = "The result was cleared; this match is back to scheduled.";
  }
  try {
    await postMessage(cfg, match.discordThreadId, content, ping);
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/** Tells the requesting team's channel how an admin decided their sub request. */
export async function notifySubDecision(
  subId: string,
  decision: "approved" | "rejected" | "revoked",
): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const sub = await db.query.matchSubstitutions.findFirst({
    where: eq(matchSubstitutions.id, subId),
  });
  if (!sub) return report;
  const match = await db.query.matches.findFirst({ where: eq(matches.id, sub.matchId) });
  if (!match) return report;
  const season = await liveSeason(match.seasonId);
  if (!season) return report;
  const byId = await teamsById(match.seasonId);
  const team = byId.get(sub.teamId);
  if (!team?.discordTextChannelId) return report;
  const opp = byId.get(match.homeTeamId === sub.teamId ? match.awayTeamId : match.homeTeamId);
  const names = await db
    .select({ id: users.id, name: users.name, username: users.username })
    .from(users)
    .where(
      inArray(
        users.id,
        [sub.subUserId, sub.replacedUserId].filter((x): x is string => !!x),
      ),
    );
  const nameOf = (id: string | null) => {
    const u = names.find((n) => n.id === id);
    return u?.name ?? u?.username ?? "?";
  };
  const what = `**${nameOf(sub.subUserId)}** for ${roundLabel(match.stage, match.round)} vs **${opp?.name ?? "?"}**${sub.replacedUserId ? ` (in for ${nameOf(sub.replacedUserId)})` : ""}`;
  const content =
    decision === "approved"
      ? `✅ Sub approved: ${what}.`
      : decision === "rejected"
        ? `Sub request rejected: ${what}.`
        : `Sub revoked: ${what} is no longer subbing in.`;
  try {
    await postMessage(cfg, team.discordTextChannelId, content);
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

/**
 * A captain asks the Sub list for help, in the match thread (public, so subs
 * can see it). Returns an error code for the page, or null when posted.
 */
export async function pingSubList(
  matchId: string,
  teamId: string,
): Promise<"no-discord" | "discord-failed" | null> {
  const cfg = discordConfig();
  if (!cfg) return "no-discord";
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match?.discordThreadId) return "no-discord";
  const season = await liveSeason(match.seasonId);
  if (!season) return "no-discord";
  const byId = await teamsById(match.seasonId);
  const team = byId.get(teamId);
  const opp = byId.get(match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId);
  try {
    const roleId = await leagueRoleId(cfg, LEAGUE_ROLES.subList, emptyReport());
    await postMessage(
      cfg,
      match.discordThreadId,
      `${roleMention(roleId)} **${team?.name ?? "?"}** needs a sub for ${roundLabel(match.stage, match.round)} vs **${opp?.name ?? "?"}**. Free to play? Reply here; the captain requests you on the match page:\n${matchUrl(season.slug, match.id)}`,
      [roleId],
    );
    return null;
  } catch (err) {
    console.error("[discord] sub list ping failed", err);
    return "discord-failed";
  }
}

/** "@10-man a 10-man is open" in DISCORD_TEN_MAN_CHANNEL_ID. */
export async function pingTenMan(): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg?.tenManChannelId) return report;
  try {
    const roleId = await leagueRoleId(cfg, LEAGUE_ROLES.tenMan, report);
    await postMessage(
      cfg,
      cfg.tenManChannelId,
      `${roleMention(roleId)} A 10-man is open. Sign up: ${appUrl()}/10-man`,
      [roleId],
    );
  } catch (err) {
    report.errors.push(describe(err));
  }
  return report;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a playoff match is due: its own scheduledAt, else the season's semis/final date. */
function playoffDue(m: Match, season: Season): Date | null {
  if (m.scheduledAt) return m.scheduledAt;
  if (m.stage === "semis") return season.semisAt;
  if (m.stage === "final") return season.finalAt;
  return null;
}

/**
 * Daily reminders (cron, see /api/cron/discord-reminders):
 *   - group stage: each team with unplayed group matches gets a list in its channel
 *   - any match due in the next 24 hours (its scheduledAt, or the semis/final
 *     date) gets a reminder in its thread, pinging both teams
 */
export async function sendDailyReminders(now = new Date()): Promise<DiscordSyncReport> {
  const report = emptyReport();
  const cfg = discordConfig();
  if (!cfg) return report;
  const active = (
    await db.query.seasons.findMany({
      where: inArray(seasons.state, ["group_stage", "playoffs"]),
    })
  ).filter((s) => !isTestSeason(s.slug));

  for (const season of active) {
    const [open, byId] = await Promise.all([
      db
        .select()
        .from(matches)
        .where(
          and(
            eq(matches.seasonId, season.id),
            or(eq(matches.state, "scheduled"), eq(matches.state, "disputed")),
          ),
        )
        .orderBy(asc(matches.round)),
      teamsById(season.id),
    ]);

    if (season.state === "group_stage") {
      for (const team of byId.values()) {
        if (!team.discordTextChannelId) continue;
        const left = open.filter(
          (m) => m.stage === "group" && (m.homeTeamId === team.id || m.awayTeamId === team.id),
        );
        if (left.length === 0) continue;
        const lines = left.map((m) => {
          const opp = byId.get(m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId);
          const where = m.discordThreadId
            ? channelMention(m.discordThreadId)
            : matchUrl(season.slug, m.id);
          return `• Round ${m.round} vs **${opp?.name ?? "?"}** — ${where}`;
        });
        const deadline = season.groupStageEndsAt
          ? ` The group stage ends ${discordTime(season.groupStageEndsAt)} (${discordTime(season.groupStageEndsAt, "R")}).`
          : "";
        await post(cfg, team.discordTextChannelId, [
          `Reminder: ${left.length} group match${left.length === 1 ? "" : "es"} still to play.${deadline}`,
          ...lines,
        ]);
      }
    }

    for (const m of open) {
      if (!m.discordThreadId) continue;
      const due =
        m.stage === "group" || m.stage === "tiebreaker" ? m.scheduledAt : playoffDue(m, season);
      if (!due || due.getTime() < now.getTime() || due.getTime() - now.getTime() > DAY_MS) continue;
      const home = byId.get(m.homeTeamId);
      const away = byId.get(m.awayTeamId);
      await post(
        cfg,
        m.discordThreadId,
        [
          `⏰ ${mentionOf(home)} vs ${mentionOf(away)}: ${roundLabel(m.stage, m.round)} is ${discordTime(due, "R")} (${discordTime(due)}).`,
        ],
        rolesOf(home, away),
      );
    }
  }
  return report;

  async function post(cfg: DiscordConfig, channelId: string, lines: string[], ping: string[] = []) {
    try {
      await postMessage(cfg, channelId, lines.join("\n"), ping);
      report.assigned++;
    } catch (err) {
      report.errors.push(describe(err));
    }
  }
}
