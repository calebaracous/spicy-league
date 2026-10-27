// Season prize pool: seasons.prizePool (whole dollars) + seasons.prizeSplit
// (percent per place, 1st first). Pure helpers, shared by the admin form
// and the public season / home pages.

const PLACES = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

export const MAX_PRIZE_PLACES = PLACES.length;

/** "$250", "$187.50" — cents only when there are any. */
export function formatUsd(amount: number): string {
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** "75/25" → [75, 25]; null unless every part is a positive whole number and they sum to 100. */
export function parsePrizeSplit(input: string): number[] | null {
  const parts = input
    .split(/[\s/,]+/)
    .filter(Boolean)
    .map((p) => p.replace(/%$/, ""));
  if (parts.length === 0 || parts.length > MAX_PRIZE_PLACES) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const split = parts.map(Number);
  if (split.some((n) => n <= 0)) return null;
  return split.reduce((a, b) => a + b, 0) === 100 ? split : null;
}

export function formatPrizeSplit(split: number[]): string {
  return split.join("/");
}

export type Payout = { place: string; percent: number; amount: number };

/** Dollar amount per place, rounded to the cent. Empty when there's no prize pool. */
export function prizePayouts(season: {
  prizePool: number | null;
  prizeSplit: number[] | null;
}): Payout[] {
  const { prizePool, prizeSplit } = season;
  if (!prizePool || !prizeSplit?.length) return [];
  return prizeSplit.map((percent, i) => ({
    place: PLACES[i] ?? `${i + 1}th`,
    percent,
    amount: Math.round(prizePool * percent) / 100,
  }));
}

/** "1st $187.50 · 2nd $62.50" */
export function describePayouts(payouts: Payout[]): string {
  return payouts.map((p) => `${p.place} ${formatUsd(p.amount)}`).join(" · ");
}
