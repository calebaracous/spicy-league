// Pure parsing for the Riot Tournament API flow (docs/MATCH-DAY.md, phase 6):
// the server callback Riot posts when a tournament-code game ends, the
// Match-v5 result, and how it compares with our draft. Unit-tested.

import type { DraftSide } from "@/lib/draft-room";

/** The callback body Riot POSTs to the provider URL when a game ends. */
export type TournamentCallback = {
  shortCode: string;
  gameId: number;
  /** Our metadata string from code creation (JSON), if any. */
  metaData: string | null;
  /** Platform, e.g. "NA1". */
  region: string;
};

export function parseTournamentCallback(body: unknown): TournamentCallback | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const shortCode = typeof b.shortCode === "string" ? b.shortCode : null;
  const gameId = typeof b.gameId === "number" ? b.gameId : Number(b.gameId);
  if (!shortCode || !Number.isSafeInteger(gameId) || gameId <= 0) return null;
  return {
    shortCode,
    gameId,
    metaData: typeof b.metaData === "string" ? b.metaData : null,
    region: typeof b.region === "string" && b.region ? b.region.toUpperCase() : "NA1",
  };
}

/** Match-v5 id for a callback's game: "NA1_5012345678". */
export function riotMatchId(cb: Pick<TournamentCallback, "region" | "gameId">): string {
  return `${cb.region}_${cb.gameId}`;
}

export type PlayerLine = {
  puuid: string;
  side: DraftSide;
  championKey: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  visionScore: number;
  win: boolean;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Winner side and per-player lines from a Match-v5 match. teamId 100 is blue,
 * 200 red. Null if it isn't a finished 5v5 with a winner.
 */
export function parseMatchResult(
  json: unknown,
): { winnerSide: DraftSide; players: PlayerLine[] } | null {
  const info = (json as { info?: Record<string, unknown> } | null)?.info;
  const parts = info?.participants;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const players: PlayerLine[] = [];
  for (const p of parts as Record<string, unknown>[]) {
    if (typeof p.puuid !== "string" || typeof p.championName !== "string") return null;
    if (p.teamId !== 100 && p.teamId !== 200) return null;
    players.push({
      puuid: p.puuid,
      side: p.teamId === 100 ? "blue" : "red",
      championKey: p.championName,
      kills: num(p.kills),
      deaths: num(p.deaths),
      assists: num(p.assists),
      cs: num(p.totalMinionsKilled) + num(p.neutralMinionsKilled),
      gold: num(p.goldEarned),
      damage: num(p.totalDamageDealtToChampions),
      visionScore: num(p.visionScore),
      win: p.win === true,
    });
  }
  const blueWon = players.some((p) => p.side === "blue" && p.win);
  const redWon = players.some((p) => p.side === "red" && p.win);
  if (blueWon === redWon) return null;
  return { winnerSide: blueWon ? "blue" : "red", players };
}

// Match-v5 and Data Dragon disagree on a few ids' casing ("FiddleSticks" vs
// "Fiddlesticks"), so compare loosely.
const norm = (k: string) => k.toLowerCase();

/**
 * Champions played that weren't drafted for that side (blind pick lets players
 * lock anything — decision 15). Empty when everyone played what was drafted.
 */
export function draftMismatches(
  draftedPicks: readonly { side: DraftSide; championKey: string | null }[],
  players: readonly Pick<PlayerLine, "side" | "championKey">[],
): { side: DraftSide; championKey: string }[] {
  const drafted = new Set(
    draftedPicks.filter((a) => a.championKey).map((a) => `${a.side}:${norm(a.championKey!)}`),
  );
  if (drafted.size === 0) return [];
  return players
    .filter((p) => !drafted.has(`${p.side}:${norm(p.championKey)}`))
    .map((p) => ({ side: p.side, championKey: p.championKey }));
}
