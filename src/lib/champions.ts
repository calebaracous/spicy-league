import "server-only";

import { DDRAGON_BASE } from "@/lib/draft-room";

/** `key` is the Data Dragon id we store ("MonkeyKing"); `name` is for display ("Wukong"). */
export type Champion = { key: string; name: string; numericId: number };
export type ChampionCatalog = { version: string; champions: Champion[] };

// A day: new champions show up within a day of a patch (MATCH-DAY.md, "Patch day").
const REVALIDATE = { next: { revalidate: 86400 } };

/**
 * Champions from Data Dragon's `champion.json`, sorted by display name.
 * Malformed entries are dropped; null if the payload isn't the expected shape.
 */
export function parseChampionJson(json: unknown): Champion[] | null {
  const data = (json as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return null;
  const champions: Champion[] = [];
  for (const c of Object.values(data as Record<string, unknown>)) {
    const { id, name, key } = (c ?? {}) as Record<string, unknown>;
    const numericId = typeof key === "string" ? Number.parseInt(key, 10) : NaN;
    if (typeof id !== "string" || typeof name !== "string" || Number.isNaN(numericId)) continue;
    champions.push({ key: id, name, numericId });
  }
  return champions.sort((a, b) => a.name.localeCompare(b.name, "en"));
}

/** Latest-patch champion list. Null on any failure (same policy as riot-api.ts). */
export async function getChampionCatalog(): Promise<ChampionCatalog | null> {
  try {
    const versionsRes = await fetch(`${DDRAGON_BASE}/api/versions.json`, REVALIDATE);
    if (!versionsRes.ok) return null;
    const versions: unknown = await versionsRes.json();
    const version = Array.isArray(versions) ? versions[0] : undefined;
    if (typeof version !== "string") return null;

    const champRes = await fetch(
      `${DDRAGON_BASE}/cdn/${version}/data/en_US/champion.json`,
      REVALIDATE,
    );
    if (!champRes.ok) return null;
    const champions = parseChampionJson(await champRes.json());
    return champions ? { version, champions } : null;
  } catch {
    return null;
  }
}

/** Lowercase letters and digits only, so "Kai'Sa", "kaisa" and "KAI SA" all compare equal. */
function championToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Admin input ("Wukong, Kai'Sa, nunu & willump") → Data Dragon keys, deduped
 * and sorted. Each comma- or newline-separated entry matches a champion's
 * display name or key, ignoring case, spaces and punctuation. Entries that
 * match nothing come back in `unknown` (trimmed, deduped, input order).
 */
export function resolveChampionKeys(
  input: string,
  champions: Champion[],
): { keys: string[]; unknown: string[] } {
  const byToken = new Map<string, string>();
  for (const c of champions) {
    byToken.set(championToken(c.key), c.key);
    byToken.set(championToken(c.name), c.key);
  }
  const keys = new Set<string>();
  const unknown: string[] = [];
  for (const raw of input.split(/[,\n]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    const key = byToken.get(championToken(entry));
    if (key) keys.add(key);
    else if (!unknown.includes(entry)) unknown.push(entry);
  }
  return { keys: [...keys].sort(), unknown };
}
