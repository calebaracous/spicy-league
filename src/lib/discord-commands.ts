import "server-only";

import { and, asc, desc, eq, ne, or } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons, type Season } from "@/db/schema/seasons";
import { riotStatSnapshots } from "@/db/schema/stats";
import { channelMention, standingsTable } from "@/lib/discord-format";
import { env } from "@/lib/env";
import { getLiveSeason } from "@/lib/live-season";
import { roundLabel } from "@/lib/match-format";
import { bestRankPerUser, formatRank } from "@/lib/rank";
import { computeStandings, getTeamForCaptain } from "@/lib/schedule";
import { openSignupKind } from "@/lib/seasons";

/**
 * Slash commands (POST /api/discord/interactions → handleCommand). Command
 * definitions are registered by scripts/discord-register-commands.mjs; keep
 * the names in sync. Replies are plain text; personal ones are ephemeral.
 */

export type DiscordUser = { id: string; username: string };
export type CommandOption = { name: string; type: number; value?: unknown };
export type CommandReply = { content: string; ephemeral: boolean };

const appUrl = () => (env.NEXT_PUBLIC_APP_URL ?? "https://www.spicyleague.dev").replace(/\/$/, "");
const reply = (content: string, ephemeral = false): CommandReply => ({
  content: content.slice(0, 2000),
  ephemeral,
});

/** The site account behind a Discord user: matched ID first, else exact username (then remembered). */
async function siteUser(discordUser: DiscordUser) {
  const byId = await db.query.users.findFirst({ where: eq(users.discordUserId, discordUser.id) });
  if (byId) return byId;
  const byName = await db.query.users.findFirst({
    where: eq(users.discordUsername, discordUser.username.toLowerCase()),
  });
  if (byName) {
    await db.update(users).set({ discordUserId: discordUser.id }).where(eq(users.id, byName.id));
  }
  return byName ?? null;
}

const NOT_LINKED = `I can't find your Spicy League account. Add your Discord username on ${appUrl()}/profile and try again.`;

/** The season commands talk about: the live one, else the latest finished one. */
async function currentSeason(): Promise<Season | null> {
  const live = await getLiveSeason();
  if (live) return live;
  return (
    (await db.query.seasons.findFirst({
      where: eq(seasons.state, "complete"),
      orderBy: [desc(seasons.createdAt)],
    })) ?? null
  );
}

async function standings(): Promise<CommandReply> {
  const season = await currentSeason();
  if (!season) return reply("There's no season running.");
  const { rows } = await computeStandings(season.id);
  if (rows.length === 0 || !["group_stage", "playoffs", "complete"].includes(season.state)) {
    return reply(`No standings for ${season.name} yet.`);
  }
  return reply(
    [
      `**${season.name} standings**`,
      "```",
      standingsTable(rows, season.groupBestOf === 2),
      "```",
      `${appUrl()}/seasons/${season.slug}/matches`,
    ].join("\n"),
  );
}

/** The caller's team this season, or a reply explaining why there isn't one. */
async function callerTeam(discordUser: DiscordUser) {
  const user = await siteUser(discordUser);
  if (!user) return { ok: false as const, error: reply(NOT_LINKED, true) };
  const season = await currentSeason();
  if (!season) return { ok: false as const, error: reply("There's no season running.", true) };
  const team = await getTeamForCaptain(season.id, user.id);
  if (!team)
    return { ok: false as const, error: reply(`You're not on a team in ${season.name}.`, true) };
  return { ok: true as const, user, season, team };
}

async function myTeam(discordUser: DiscordUser): Promise<CommandReply> {
  const ctx = await callerTeam(discordUser);
  if (!ctx.ok) return ctx.error;
  const roster = await db
    .select({ name: users.name, username: users.username, pickNumber: teamMembers.pickNumber })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, ctx.team.id))
    .orderBy(asc(teamMembers.pickNumber));
  const { rows } = await computeStandings(ctx.season.id);
  const rec = rows.find((r) => r.teamId === ctx.team.id);
  const record = rec
    ? ctx.season.groupBestOf === 2
      ? ` · ${rec.wins}–${rec.draws}–${rec.losses} (${rec.gamesWon}–${rec.gamesLost} maps)`
      : ` · ${rec.wins}–${rec.losses}`
    : "";
  return reply(
    [
      `**${ctx.team.name}**${record}`,
      ...roster.map((m) => `• ${m.name ?? m.username}${m.pickNumber === null ? " (captain)" : ""}`),
    ].join("\n"),
    true,
  );
}

async function teamMatches(seasonId: string, teamId: string, onlyOpen: boolean) {
  return db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.seasonId, seasonId),
        or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)),
        ...(onlyOpen ? [ne(matches.state, "confirmed")] : []),
      ),
    )
    .orderBy(asc(matches.round));
}

async function teamNames(seasonId: string) {
  const rows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.seasonId, seasonId));
  return new Map(rows.map((t) => [t.id, t.name]));
}

async function schedule(discordUser: DiscordUser): Promise<CommandReply> {
  const ctx = await callerTeam(discordUser);
  if (!ctx.ok) return ctx.error;
  const [all, names] = await Promise.all([
    teamMatches(ctx.season.id, ctx.team.id, false),
    teamNames(ctx.season.id),
  ]);
  if (all.length === 0) return reply("No matches scheduled yet.", true);
  const lines = all.map((m) => {
    const opp = names.get(m.homeTeamId === ctx.team.id ? m.awayTeamId : m.homeTeamId) ?? "?";
    const status =
      m.state === "confirmed"
        ? `${m.homeTeamId === ctx.team.id ? m.homeScore : m.awayScore}–${m.homeTeamId === ctx.team.id ? m.awayScore : m.homeScore}`
        : m.state;
    return `• ${roundLabel(m.stage, m.round)} vs **${opp}** — ${status}${m.discordThreadId ? ` ${channelMention(m.discordThreadId)}` : ""}`;
  });
  return reply([`**${ctx.team.name} schedule**`, ...lines].join("\n"), true);
}

async function nextMatch(discordUser: DiscordUser): Promise<CommandReply> {
  const ctx = await callerTeam(discordUser);
  if (!ctx.ok) return ctx.error;
  const [open, names] = await Promise.all([
    teamMatches(ctx.season.id, ctx.team.id, true),
    teamNames(ctx.season.id),
  ]);
  const m = open[0];
  if (!m) return reply("No matches left to play. 🎉", true);
  const opp = names.get(m.homeTeamId === ctx.team.id ? m.awayTeamId : m.homeTeamId) ?? "?";
  return reply(
    [
      `Next: **${roundLabel(m.stage, m.round)} vs ${opp}** (${m.state}).`,
      m.discordThreadId ? `Thread: ${channelMention(m.discordThreadId)}` : null,
      `${appUrl()}/seasons/${ctx.season.slug}/matches/${m.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
    true,
  );
}

async function rank(discordUser: DiscordUser, target: DiscordUser | null): Promise<CommandReply> {
  const who = target ?? discordUser;
  const user = await siteUser(who);
  if (!user) {
    return reply(
      target ? `${who.username} hasn't linked a Spicy League account.` : NOT_LINKED,
      !target,
    );
  }
  const rows = await db
    .select({
      userId: riotStatSnapshots.userId,
      tier: riotStatSnapshots.tier,
      rankDivision: riotStatSnapshots.rankDivision,
      lp: riotStatSnapshots.lp,
    })
    .from(riotStatSnapshots)
    .where(and(eq(riotStatSnapshots.userId, user.id), eq(riotStatSnapshots.queue, "solo")));
  const best = bestRankPerUser(rows).get(user.id);
  const name = user.name ?? user.username ?? who.username;
  return reply(
    best
      ? `**${name}**: ${formatRank(best.tier, best.rankDivision, best.lp)} (best solo rank across linked accounts)`
      : `**${name}** has no ranked solo data. Link a Riot account at ${appUrl()}/profile.`,
  );
}

async function signup(): Promise<CommandReply> {
  const season = await getLiveSeason();
  const kind = season ? openSignupKind(season) : null;
  if (!season || !kind) return reply("Signups aren't open right now.", true);
  return reply(
    `${kind === "sub" ? "Sub signups" : "Signups"} for **${season.name}** are open: ${appUrl()}/seasons/${season.slug}/signup`,
    true,
  );
}

export async function handleCommand(
  name: string,
  options: CommandOption[],
  invoker: DiscordUser,
  resolvedUsers: Record<string, { id: string; username: string }>,
): Promise<CommandReply> {
  switch (name) {
    case "standings":
      return standings();
    case "myteam":
      return myTeam(invoker);
    case "schedule":
      return schedule(invoker);
    case "nextmatch":
      return nextMatch(invoker);
    case "rank": {
      const id = options.find((o) => o.name === "player")?.value;
      const target = typeof id === "string" ? (resolvedUsers[id] ?? null) : null;
      return rank(invoker, target);
    }
    case "signup":
      return signup();
    default:
      return reply("Unknown command.", true);
  }
}
