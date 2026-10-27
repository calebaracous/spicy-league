/**
 * Pure Discord message formatting for the bot's posts and slash-command
 * replies (src/lib/discord-notify.ts, src/lib/discord-commands.ts).
 */

/** Discord renders this in each reader's own timezone. F = full date+time, R = "in 3 hours". */
export function discordTime(date: Date, style: "F" | "R" | "f" | "t" | "D" = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

export const roleMention = (roleId: string) => `<@&${roleId}>`;
export const channelMention = (channelId: string) => `<#${channelId}>`;

/** "Round 2 · Gucci Gang vs Cashmoney", trimmed to Discord's 100-char limit. */
export function matchThreadName(label: string, home: string, away: string): string {
  return `${label} · ${home} vs ${away}`.slice(0, 100);
}

/** "Gucci Gang 2–0 Cashmoney", "Gucci Gang 1–1 Cashmoney (draw)", or "Gucci Gang won". */
export function resultLine(m: {
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
}): string {
  if (m.homeScore !== null && m.awayScore !== null) {
    const draw = m.winner === null && m.homeScore === m.awayScore;
    return `${m.home} ${m.homeScore}–${m.awayScore} ${m.away}${draw ? " (draw)" : ""}`;
  }
  return m.winner ? `${m.winner} won` : "no result";
}

/** Fixed-width standings for a slash-command reply (inside a ``` block). */
export function standingsTable(
  rows: Array<{
    rank: number;
    tied: boolean;
    teamName: string;
    wins: number;
    draws: number;
    losses: number;
    gamesWon: number;
    gamesLost: number;
  }>,
  bo2: boolean,
): string {
  const nameWidth = Math.min(20, Math.max(4, ...rows.map((r) => r.teamName.length)));
  const head = `#   ${"Team".padEnd(nameWidth)}  ${bo2 ? " W  D  L  Maps" : " W  L   +/-"}`;
  const lines = rows.map((r) => {
    const rank = `${r.rank}${r.tied ? "=" : ""}`.padEnd(3);
    const name = r.teamName.slice(0, nameWidth).padEnd(nameWidth);
    const w = String(r.wins).padStart(2);
    const l = String(r.losses).padStart(2);
    if (bo2) {
      const d = String(r.draws).padStart(2);
      return `${rank} ${name}  ${w} ${d} ${l}  ${r.gamesWon}–${r.gamesLost}`;
    }
    const diff = r.gamesWon - r.gamesLost;
    return `${rank} ${name}  ${w} ${l}  ${(diff > 0 ? `+${diff}` : String(diff)).padStart(4)}`;
  });
  return [head, ...lines].join("\n");
}

/** Names for the IDs inside mentions, looked up from the server. */
export type MentionNames = {
  users: Map<string, string>;
  roles: Map<string, string>;
  channels: Map<string, string>;
};

/**
 * A Discord message as one line of plain text for the home-page ticker:
 * mentions resolved to names (pings like @everyone dropped), custom emoji and
 * markdown stripped, spoilers hidden, lines joined with " · ", and cut at
 * `max` characters on a word boundary. Dates in `<t:…>` tags are shown in the
 * league's timezone (US Eastern), since this renders on the server.
 */
export function plainMessageText(content: string, names: MentionNames, max = 160): string {
  const date = (unix: string) =>
    new Date(Number(unix) * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });
  let text = content
    .replace(/```(?:[\w-]+\n)?([\s\S]*?)```/g, "$1")
    .replace(/\|\|[\s\S]+?\|\|/g, "[spoiler]")
    .replace(/<@!?(\d+)>/g, (_, id: string) => `@${names.users.get(id) ?? "someone"}`)
    .replace(/<@&(\d+)>/g, (_, id: string) =>
      names.roles.has(id) ? `@${names.roles.get(id)}` : "",
    )
    .replace(/<#(\d+)>/g, (_, id: string) => `#${names.channels.get(id) ?? "channel"}`)
    .replace(/<a?:\w+:\d+>/g, "")
    .replace(/<t:(-?\d+)(?::[tTdDfFR])?>/g, (_, unix: string) => date(unix))
    .replace(/@(everyone|here)\b/g, "")
    .replace(/\[([^\]]+)\]\(<?[^)\s]+>?\)/g, "$1")
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([\s\S]+?)\*\*/g, "$1")
    .replace(/__([\s\S]+?)__/g, "$1")
    .replace(/~~([\s\S]+?)~~/g, "$1")
    .replace(/(^|[^\w*])\*(?!\s)(.+?)\*(?!\w)/gm, "$1$2")
    .replace(/(^|\W)_(?!\s)(.+?)_(?!\w)/gm, "$1$2")
    // Markers left without a partner (a strikethrough never closed).
    .replace(/\*\*|~~|\|\|/g, "");
  text = text
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:#{1,3}|-#|>{1,3}|[-*•]|\d+\.)\s+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join(" · ");
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s·,.;:–-]+$/, "")}…`;
}

export type TickerItem = { id: string; text: string; postedAt: string };

/**
 * The newest `count` announcements worth showing, newest first: ordinary
 * messages and replies only (no pins/joins/boosts), using the first embed's
 * title or description when the message itself has no text, and skipping
 * anything that ends up empty (an image on its own, a bare ping).
 */
export function tickerItems(
  messages: Array<{
    id: string;
    type: number;
    content: string;
    timestamp: string;
    embeds: Array<{ title?: string; description?: string }>;
  }>,
  names: MentionNames,
  count: number,
): TickerItem[] {
  const items: TickerItem[] = [];
  for (const m of messages) {
    if (m.type !== 0 && m.type !== 19) continue;
    const embed = m.embeds[0];
    const source = m.content.trim() || embed?.title || embed?.description || "";
    const text = plainMessageText(source, names);
    if (text) items.push({ id: m.id, text, postedAt: m.timestamp });
    if (items.length === count) break;
  }
  return items;
}
