import "server-only";

import { env } from "@/lib/env";

// Prefer personal key (stable) over developer key (24h expiring)
function getApiKey(): string | null {
  return env.RIOT_PERSONAL_API_KEY ?? env.RIOT_DEVELOPER_API_KEY ?? null;
}

// NA routing: account lookups go through Americas, ranked data through na1
const AMERICAS_HOST = "https://americas.api.riotgames.com";
const NA1_HOST = "https://na1.api.riotgames.com";

// Data Dragon — champion ID → name lookup, cached at build/request level
const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

async function riotFetch<T>(url: string): Promise<T | null> {
  const key = getApiKey();
  if (!key) return null;
  try {
    const res = await fetch(url, {
      headers: { "X-Riot-Token": key },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Account ────────────────────────────────────────────────────────────────

export type RiotAccount = {
  puuid: string;
  gameName: string;
  tagLine: string;
};

export async function getAccountByRiotId(
  gameName: string,
  tagLine: string,
): Promise<RiotAccount | null> {
  return riotFetch<RiotAccount>(
    `${AMERICAS_HOST}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  );
}

// ── Ranked entries ─────────────────────────────────────────────────────────

export type RankEntry = {
  queueType: string;
  tier: string;
  rank: string;
  leaguePoints: number;
  wins: number;
  losses: number;
};

export async function getRankEntries(puuid: string): Promise<RankEntry[] | null> {
  return riotFetch<RankEntry[]>(
    `${NA1_HOST}/lol/league/v4/entries/by-puuid/${encodeURIComponent(puuid)}`,
  );
}

// ── Champion mastery ───────────────────────────────────────────────────────

export type ChampionMastery = {
  championId: number;
  championLevel: number;
  championPoints: number;
};

export async function getTopChampions(puuid: string, count = 3): Promise<ChampionMastery[] | null> {
  return riotFetch<ChampionMastery[]>(
    `${NA1_HOST}/lol/champion-mastery/v4/champion-masteries/by-puuid/${encodeURIComponent(puuid)}/top?count=${count}`,
  );
}

// ── Data Dragon ────────────────────────────────────────────────────────────

type ChampionData = { id: string; name: string; key: string };
type DDragonChampionResponse = { data: Record<string, ChampionData> };

let championMap: Map<number, string> | null = null;

export async function getChampionName(championId: number): Promise<string> {
  if (!championMap) {
    try {
      const versionsRes = await fetch(`${DDRAGON_BASE}/api/versions.json`, {
        next: { revalidate: 86400 },
      });
      const versions = (await versionsRes.json()) as string[];
      const latest = versions[0];
      const champRes = await fetch(`${DDRAGON_BASE}/cdn/${latest}/data/en_US/champion.json`, {
        next: { revalidate: 86400 },
      });
      const champData = (await champRes.json()) as DDragonChampionResponse;
      championMap = new Map(
        Object.values(champData.data).map((c) => [parseInt(c.key, 10), c.name]),
      );
    } catch {
      return `Champion #${championId}`;
    }
  }
  return championMap.get(championId) ?? `Champion #${championId}`;
}
