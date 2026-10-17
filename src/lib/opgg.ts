/**
 * OP.GG profile URL for a linked Riot account, built from its stored
 * `gameName#tagLine` handle (`account_links.external_handle`). NA only, like
 * the rest of the Riot integration. Returns null for a malformed handle.
 */
export function opggUrlForRiotId(handle: string | null | undefined): string | null {
  const parts = handle?.split("#");
  if (!parts || parts.length !== 2) return null;
  const [gameName, tagLine] = parts.map((p) => p.trim());
  if (!gameName || !tagLine) return null;
  return `https://op.gg/lol/summoners/na/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`;
}
