import type { Game, SeasonState } from "@/db/schema/seasons";

export const SEASON_STATES: readonly SeasonState[] = [
  "draft",
  "signups_open",
  "signups_closed",
  "captains_selected",
  "drafting",
  "group_stage",
  "playoffs",
  "complete",
] as const;

const TRANSITIONS: Record<SeasonState, SeasonState[]> = {
  draft: ["signups_open"],
  signups_open: ["signups_closed", "draft"],
  signups_closed: ["captains_selected", "signups_open"],
  captains_selected: ["drafting", "signups_closed"],
  drafting: ["group_stage", "captains_selected"],
  group_stage: ["playoffs", "drafting"],
  playoffs: ["complete", "group_stage"],
  complete: [],
};

export function nextStates(current: SeasonState): SeasonState[] {
  return TRANSITIONS[current] ?? [];
}

export function canTransition(from: SeasonState, to: SeasonState): boolean {
  return TRANSITIONS[from].includes(to);
}

export const SEASON_STATE_LABELS: Record<SeasonState, string> = {
  draft: "Draft",
  signups_open: "Signups open",
  signups_closed: "Signups closed",
  captains_selected: "Captains selected",
  drafting: "Drafting",
  group_stage: "Group stage",
  playoffs: "Playoffs",
  complete: "Complete",
};

export const GAME_LABELS: Record<Game, string> = {
  lol: "League of Legends",
  cs2: "Counter-Strike 2",
};

export const PUBLIC_STATES: readonly SeasonState[] = SEASON_STATES.filter((s) => s !== "draft");

export function isPublic(state: SeasonState): boolean {
  return state !== "draft";
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && slug.length >= 3 && slug.length <= 48;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
