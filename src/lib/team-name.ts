/**
 * Team names: captains rename their team (default "Team <captain>") on the
 * Teams page, and the Discord role + channels follow. Pure — shared by the
 * rename action and the Discord sync.
 */

export const TEAM_NAME_MAX = 32;
export const TEAM_NAME_HELP = `3–${TEAM_NAME_MAX} characters: letters, numbers, spaces and ' & . - _ ! ?`;

// No @ (Discord mentions), # or other markup; letters from any language.
const TEAM_NAME = /^[\p{L}\p{N} '&.\-_!?]+$/u;

/** Trims and collapses spaces. Null if it isn't a valid team name. */
export function normalizeTeamName(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().replace(/\s+/g, " ");
  if (v.length < 3 || v.length > TEAM_NAME_MAX || !TEAM_NAME.test(v)) return null;
  return v;
}

/** Discord text-channel form of a team name: "Gucci Gang!" → "gucci-gang". */
export function teamTextChannelName(teamName: string): string {
  const slug = teamName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return slug || "team";
}
