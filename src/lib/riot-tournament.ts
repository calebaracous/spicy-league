import "server-only";

import { env } from "@/lib/env";

// Riot Tournament API client (docs/MATCH-DAY.md, phase 6). With a
// tournament-enabled key (RIOT_TOURNAMENT_API_KEY) it calls tournament-v5;
// without one it uses the personal key against tournament-stub-v5, which
// returns real-looking ids and codes but never sends callbacks. Lobby codes
// are only offered once RIOT_TOURNAMENT_PROVIDER_ID is set
// (scripts/riot-tournament-setup.mjs registers the provider).

const AMERICAS = "https://americas.api.riotgames.com";

export const tournamentIsStub = () => !env.RIOT_TOURNAMENT_API_KEY;
export const lobbyCodesEnabled = () => !!env.RIOT_TOURNAMENT_PROVIDER_ID;

function apiKey(): string | null {
  return (
    env.RIOT_TOURNAMENT_API_KEY ?? env.RIOT_PERSONAL_API_KEY ?? env.RIOT_DEVELOPER_API_KEY ?? null
  );
}

const base = () => `${AMERICAS}/lol/tournament${tournamentIsStub() ? "-stub" : ""}/v5`;

type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(method: "GET" | "POST", url: string, body?: unknown): Promise<Result<T>> {
  const key = apiKey();
  if (!key) return { ok: false, status: 0, error: "No Riot API key configured." };
  try {
    const res = await fetch(url, {
      method,
      headers: { "X-Riot-Token": key, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        error: `Riot API ${res.status}: ${await res.text()}`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/** One per season: the tournament its lobby codes belong to. */
export function registerTournament(name: string): Promise<Result<number>> {
  return call<number>("POST", `${base()}/tournaments`, {
    name: name.slice(0, 64),
    providerId: env.RIOT_TOURNAMENT_PROVIDER_ID,
  });
}

/**
 * One code per game (Riot: "each code should create only one match"). Blind
 * pick — players lock what was drafted in our room (decision 15); anyone can
 * spectate (decision 18); no allowedParticipants (decision 16).
 */
export async function createLobbyCode(
  tournamentId: number,
  metadata: Record<string, unknown>,
): Promise<Result<string>> {
  const res = await call<string[]>("POST", `${base()}/codes?count=1&tournamentId=${tournamentId}`, {
    mapType: "SUMMONERS_RIFT",
    pickType: "BLIND_PICK",
    spectatorType: "ALL",
    teamSize: 5,
    enoughPlayers: false,
    metadata: JSON.stringify(metadata),
  });
  if (!res.ok) return res;
  const code = res.data[0];
  return code
    ? { ok: true, data: code }
    : { ok: false, status: 0, error: "Riot returned no code." };
}

/** Match-v5 for a finished game (any key works). */
export function getMatch(matchId: string): Promise<Result<unknown>> {
  return call<unknown>("GET", `${AMERICAS}/lol/match/v5/matches/${encodeURIComponent(matchId)}`);
}
