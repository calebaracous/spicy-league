/**
 * LoL ranked-tier helpers shared by the home page, public profiles and the
 * player directory. Pure — operates on `riotStatSnapshots` rank columns.
 */

const APEX_TIERS = ["MASTER", "GRANDMASTER", "CHALLENGER"];

const TIER_WEIGHT: Record<string, number> = {
  CHALLENGER: 0,
  GRANDMASTER: 1,
  MASTER: 2,
  DIAMOND: 3,
  EMERALD: 4,
  PLATINUM: 5,
  GOLD: 6,
  SILVER: 7,
  BRONZE: 8,
  IRON: 9,
};

const DIVISION_WEIGHT: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3 };

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** "Gold II · 45 LP", "Master · 120 LP", or "Unranked". */
export function formatRank(
  tier: string | null,
  division: string | null,
  lp: number | null,
): string {
  if (!tier) return "Unranked";
  if (APEX_TIERS.includes(tier)) return `${capitalize(tier)} · ${lp ?? 0} LP`;
  return `${capitalize(tier)} ${division ?? ""} · ${lp ?? 0} LP`;
}

/** "Gold II" / "Master" — no LP, for compact lists. Null when unranked. */
export function formatTier(tier: string | null, division: string | null): string | null {
  if (!tier) return null;
  if (APEX_TIERS.includes(tier) || !division) return capitalize(tier);
  return `${capitalize(tier)} ${division}`;
}

/** Lower is better. Unranked sorts last. */
export function rankScore(tier: string | null, division: string | null, lp: number | null): number {
  if (!tier) return 999_999;
  const w = (TIER_WEIGHT[tier] ?? 10) * 10_000;
  const d = (DIVISION_WEIGHT[division ?? ""] ?? 0) * 1_000;
  return w + d - (lp ?? 0);
}
