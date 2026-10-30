// Pure rules for the match-day draft room (docs/design/MATCH-DAY.md). No db or
// next imports: the room's client components use this too.

export type DraftSide = "blue" | "red";
export type DraftKind = "ban" | "pick";
export type DraftStep = { step: number; side: DraftSide; kind: DraftKind };

/** A taken step, as stored in `match_draft_actions`. `championKey` null = skipped ban. */
export type DraftAction = {
  step: number;
  side: DraftSide;
  kind: DraftKind;
  championKey: string | null;
};

/** A pick's position, top to support — the draft recap's order (phase 4). */
export const LANE_ROLES = ["top", "jungle", "mid", "bot", "support"] as const;
export type LaneRole = (typeof LANE_ROLES)[number];
export const LANE_ROLE_LABEL: Record<LaneRole, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  bot: "Bot",
  support: "Support",
};

/** Why a champion can't be chosen right now; the grid greys and labels it. */
export type UnavailableReason = "banned" | "picked" | "fearless" | "disabled";

const B = "blue";
const R = "red";
const PHASES: Array<{ kind: DraftKind; sides: DraftSide[] }> = [
  { kind: "ban", sides: [B, R, B, R, B, R] },
  { kind: "pick", sides: [B, R, R, B, B, R] },
  { kind: "ban", sides: [R, B, R, B] },
  { kind: "pick", sides: [R, B, B, R] },
];

/** The standard tournament draft: 6 bans, 6 picks, 4 bans, 4 picks. */
export const DRAFT_SEQUENCE: readonly DraftStep[] = PHASES.flatMap(({ kind, sides }) =>
  sides.map((side) => ({ side, kind })),
).map((s, i) => ({ step: i + 1, ...s }));

export const TOTAL_STEPS = DRAFT_SEQUENCE.length;

/** Step `n` (1-based), or null outside 1..TOTAL_STEPS. */
export function stepAt(n: number): DraftStep | null {
  return Number.isInteger(n) ? (DRAFT_SEQUENCE[n - 1] ?? null) : null;
}

/** The step on the clock. Never stored: count of actions + 1, like the season draft. */
export function nextStep(actions: readonly DraftAction[]): number {
  return actions.length + 1;
}

export function isDraftComplete(actions: readonly DraftAction[]): boolean {
  return actions.length >= TOTAL_STEPS;
}

/** Side that acts next, or null once the draft is complete. */
export function sideOnClock(actions: readonly DraftAction[]): DraftSide | null {
  return stepAt(nextStep(actions))?.side ?? null;
}

type AvailabilityInput = {
  /** This game's actions so far. */
  actions: readonly DraftAction[];
  /** Champion keys picked by either team in earlier games of the match. */
  priorGamePicks: readonly string[];
  /** The season's disabled champions (`seasons.disabledChampions`). */
  disabled: readonly string[];
  fearless: boolean;
};

/**
 * Why `key` can't be chosen, or null if it can. This game's bans/picks come
 * first (the most specific label), then fearless, then the season's disabled
 * list. Earlier games' bans never carry over; earlier picks only under fearless.
 */
export function unavailableReason(
  key: string,
  { actions, priorGamePicks, disabled, fearless }: AvailabilityInput,
): UnavailableReason | null {
  const taken = actions.find((a) => a.championKey === key);
  if (taken) return taken.kind === "ban" ? "banned" : "picked";
  if (fearless && priorGamePicks.includes(key)) return "fearless";
  if (disabled.includes(key)) return "disabled";
  return null;
}

/** Catalogue keys still selectable this game, in catalogue order. */
export function availableChampions({
  catalogKeys,
  ...input
}: AvailabilityInput & { catalogKeys: readonly string[] }): string[] {
  const blocked = new Set<string>(input.disabled);
  for (const a of input.actions) if (a.championKey) blocked.add(a.championKey);
  if (input.fearless) for (const k of input.priorGamePicks) blocked.add(k);
  return catalogKeys.filter((k) => !blocked.has(k));
}

/**
 * What a lapsed step locks: the side's hover if it's still available, else
 * null (a skipped ban; a pick pauses the draft — docs/MATCH-DAY.md).
 */
export function resolveTimeout({
  hover,
  available,
}: {
  hover: string | null | undefined;
  available: readonly string[];
}): string | null {
  return hover && available.includes(hover) ? hover : null;
}

export type DraftBoardSide = { bans: (string | null)[]; picks: string[] };

/** Bans (null = skipped) and picks per side, in step order, for the room's columns. */
export function draftBoard(actions: readonly DraftAction[]): Record<DraftSide, DraftBoardSide> {
  const board: Record<DraftSide, DraftBoardSide> = {
    blue: { bans: [], picks: [] },
    red: { bans: [], picks: [] },
  };
  for (const a of [...actions].sort((x, y) => x.step - y.step)) {
    if (a.kind === "ban") board[a.side].bans.push(a.championKey);
    else if (a.championKey) board[a.side].picks.push(a.championKey);
  }
  return board;
}

export const DDRAGON_BASE = "https://ddragon.leagueoflegends.com";

/** Square champion icon for a Data Dragon version + champion key ("MonkeyKing"). */
export function championIconUrl(version: string, key: string): string {
  return `${DDRAGON_BASE}/cdn/${version}/img/champion/${key}.png`;
}
