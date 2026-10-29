// Season champion and side stats from match-day drafts (docs/MATCH-DAY.md,
// phase 5). Pure: the loader (src/lib/season-stats.ts) feeds it confirmed
// matches' completed drafts. Everything here is our own data (drafts, game
// winners, who played what), not Riot match history.

import type { DraftKind, DraftSide } from "@/lib/draft-room";

export type StatsGame = {
  blueTeamId: string;
  redTeamId: string;
  /** Null until the game's result is recorded; such games count picks/bans only. */
  winnerTeamId: string | null;
  gameNumber: number;
  sideChosenVia: string | null;
  sideChooserTeamId: string | null;
  actions: {
    side: DraftSide;
    kind: DraftKind;
    championKey: string | null;
    assignedUserId: string | null;
  }[];
};

export type ChampionRow = {
  key: string;
  picks: number;
  bans: number;
  /** Games where it was picked or banned. */
  presence: number;
  wins: number;
  losses: number;
  bluePicks: number;
  redPicks: number;
};

const teamOf = (g: StatsGame, side: DraftSide) => (side === "blue" ? g.blueTeamId : g.redTeamId);

/**
 * Per-champion picks, bans, presence and record. With `teamId`, only that
 * team's picks and bans count (scouting), plus `bannedAgainst` — what
 * opponents ban against them.
 */
export function championStats(
  games: readonly StatsGame[],
  opts: { teamId?: string } = {},
): { games: number; rows: ChampionRow[]; bannedAgainst: { key: string; bans: number }[] } {
  const rows = new Map<string, ChampionRow>();
  const against = new Map<string, number>();
  const row = (key: string) => {
    let r = rows.get(key);
    if (!r) {
      r = { key, picks: 0, bans: 0, presence: 0, wins: 0, losses: 0, bluePicks: 0, redPicks: 0 };
      rows.set(key, r);
    }
    return r;
  };
  let counted = 0;
  for (const g of games) {
    if (opts.teamId && g.blueTeamId !== opts.teamId && g.redTeamId !== opts.teamId) continue;
    counted++;
    const seen = new Set<string>();
    for (const a of g.actions) {
      if (!a.championKey) continue;
      const team = teamOf(g, a.side);
      if (opts.teamId && team !== opts.teamId) {
        if (a.kind === "ban") against.set(a.championKey, (against.get(a.championKey) ?? 0) + 1);
        continue;
      }
      const r = row(a.championKey);
      if (!seen.has(a.championKey)) {
        seen.add(a.championKey);
        r.presence++;
      }
      if (a.kind === "ban") {
        r.bans++;
        continue;
      }
      r.picks++;
      if (a.side === "blue") r.bluePicks++;
      else r.redPicks++;
      if (g.winnerTeamId) {
        if (g.winnerTeamId === team) r.wins++;
        else r.losses++;
      }
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) => b.presence - a.presence || b.picks - a.picks || a.key.localeCompare(b.key),
  );
  const bannedAgainst = [...against.entries()]
    .map(([key, bans]) => ({ key, bans }))
    .sort((a, b) => b.bans - a.bans || a.key.localeCompare(b.key));
  return { games: counted, rows: sorted, bannedAgainst };
}

/** Blue vs red record, and how often the RPS winner won game 1. */
export function sideStats(games: readonly StatsGame[]) {
  let played = 0;
  let blueWins = 0;
  let rpsGames = 0;
  let rpsWins = 0;
  for (const g of games) {
    if (!g.winnerTeamId) continue;
    played++;
    if (g.winnerTeamId === g.blueTeamId) blueWins++;
    if (g.gameNumber === 1 && g.sideChosenVia === "rps" && g.sideChooserTeamId) {
      rpsGames++;
      if (g.winnerTeamId === g.sideChooserTeamId) rpsWins++;
    }
  }
  return { played, blueWins, redWins: played - blueWins, rpsGames, rpsWins };
}

/** The champions a player was assigned, with their record on each. */
export function playerChampions(games: readonly StatsGame[], userId: string) {
  const byKey = new Map<string, { key: string; games: number; wins: number; losses: number }>();
  for (const g of games) {
    for (const a of g.actions) {
      if (a.kind !== "pick" || !a.championKey || a.assignedUserId !== userId) continue;
      const r = byKey.get(a.championKey) ?? { key: a.championKey, games: 0, wins: 0, losses: 0 };
      r.games++;
      if (g.winnerTeamId) {
        if (g.winnerTeamId === teamOf(g, a.side)) r.wins++;
        else r.losses++;
      }
      byKey.set(a.championKey, r);
    }
  }
  return [...byKey.values()].sort((a, b) => b.games - a.games || b.wins - a.wins);
}

/** "62%" or "—" when there's nothing to divide by. */
export function percent(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : "—";
}
