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
