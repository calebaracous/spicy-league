/**
 * Riot IDs as typed into the link forms (`GameName#TAG`). Pure, so it's
 * unit-tested; the lookup against the Riot API is in account-edits.ts.
 */
export function parseRiotId(raw: string | null | undefined): {
  gameName: string;
  tagLine: string;
} | null {
  const parts = (raw ?? "").trim().split("#");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { gameName: parts[0], tagLine: parts[1] };
}
