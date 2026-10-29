// The draft room's clock (docs/MATCH-DAY.md, phase 3): both sides ready → 3s
// countdown → 60s per ban, 2 minutes per pick → complete. A pick that runs out
// with nothing hovered pauses the draft (stepDeadline null) until that side or
// an admin locks it. Pure, like rps.ts: deadlines are lazy (no cron), so
// whoever reads or acts next applies what has lapsed.

import {
  resolveTimeout,
  stepAt,
  TOTAL_STEPS,
  type DraftAction,
  type DraftKind,
  type DraftSide,
} from "@/lib/draft-room";

export const DRAFT_COUNTDOWN_MS = 3_000;
export const DRAFT_BAN_MS = 60_000;
export const DRAFT_PICK_MS = 120_000;

/** How long a step of this kind gets. */
export function stepMs(kind: DraftKind): number {
  return kind === "ban" ? DRAFT_BAN_MS : DRAFT_PICK_MS;
}

/** The deadline for step `step` starting at `now` (null past the last step). */
export function deadlineFor(step: number, now: Date): Date | null {
  const s = stepAt(step);
  return s ? new Date(now.getTime() + stepMs(s.kind)) : null;
}

export type DraftState = "waiting" | "countdown" | "drafting" | "complete" | "skipped";

/** Drafting with no deadline: a pick ran out with nothing hovered; waiting for that side or an admin. */
export function draftPaused(clock: Pick<DraftClock, "draftState" | "stepDeadline">): boolean {
  return clock.draftState === "drafting" && !clock.stepDeadline;
}

/** The match_games fields the clock reads and writes. */
export type DraftClock = {
  draftState: DraftState;
  blueReadyAt: Date | null;
  redReadyAt: Date | null;
  draftStartsAt: Date | null;
  stepDeadline: Date | null;
  blueHover: string | null;
  redHover: string | null;
  draftCompletedAt: Date | null;
};

const hoverKey = (side: DraftSide) => (side === "blue" ? "blueHover" : "redHover");

/**
 * The clock after `side` took a step (by hand or by timeout): its hover is
 * spent, and the next step gets a fresh clock — or the draft is complete.
 */
export function afterStep(
  side: DraftSide,
  actionsAfter: readonly DraftAction[],
  now: Date,
): Partial<DraftClock> {
  const patch: Partial<DraftClock> = { [hoverKey(side)]: null };
  if (actionsAfter.length >= TOTAL_STEPS) {
    return {
      ...patch,
      draftState: "complete",
      stepDeadline: null,
      draftCompletedAt: now,
      blueHover: null,
      redHover: null,
    };
  }
  return { ...patch, stepDeadline: deadlineFor(actionsAfter.length + 1, now) };
}

export type DraftTransition = {
  patch: Partial<DraftClock>;
  /** A step the clock took (timeout). */
  action?: DraftAction;
  /** The draft just paused on a pick nobody hovered. */
  paused?: boolean;
};

/**
 * One transition due at `now`, or null. A lapsed step locks the side's hover
 * if it's still available (`resolveTimeout`); otherwise a ban is skipped and a
 * pick pauses the draft. New deadlines count from `now`, so a late poll never
 * chains through steps nobody saw.
 */
export function advanceDraft(
  clock: DraftClock,
  actions: readonly DraftAction[],
  now: Date,
  available: (actions: readonly DraftAction[]) => readonly string[],
): DraftTransition | null {
  switch (clock.draftState) {
    case "waiting":
      return clock.blueReadyAt && clock.redReadyAt
        ? {
            patch: {
              draftState: "countdown",
              draftStartsAt: new Date(now.getTime() + DRAFT_COUNTDOWN_MS),
            },
          }
        : null;
    case "countdown":
      return clock.draftStartsAt && now >= clock.draftStartsAt
        ? {
            patch: {
              draftState: "drafting",
              stepDeadline: deadlineFor(actions.length + 1, now),
            },
          }
        : null;
    case "drafting": {
      if (!clock.stepDeadline || now < clock.stepDeadline) return null;
      const step = stepAt(actions.length + 1);
      if (!step) return { patch: afterStep("blue", actions, now) };
      const championKey = resolveTimeout({
        hover: clock[hoverKey(step.side)],
        available: available(actions),
      });
      if (step.kind === "pick" && !championKey) {
        return { patch: { stepDeadline: null }, paused: true };
      }
      const action: DraftAction = { ...step, championKey };
      return { patch: afterStep(step.side, [...actions, action], now), action };
    }
    case "complete":
    case "skipped":
      return null;
  }
}

/**
 * Applies every due transition; returns the clock, the steps the clock took,
 * and whether the draft just paused.
 */
export function settleDraft(
  clock: DraftClock,
  actions: readonly DraftAction[],
  now: Date,
  available: (actions: readonly DraftAction[]) => readonly string[],
): { clock: DraftClock; taken: DraftAction[]; changed: boolean; paused: boolean } {
  let cur = clock;
  const all = [...actions];
  const taken: DraftAction[] = [];
  let changed = false;
  let paused = false;
  // Each lapsed step sets a deadline past `now` (or pauses), so this stops
  // after one timeout; the cap guards a rules bug looping inside a transaction.
  for (let i = 0; i < 8; i++) {
    const t = advanceDraft(cur, all, now, available);
    if (!t) break;
    cur = { ...cur, ...t.patch };
    if (t.action) {
      all.push(t.action);
      taken.push(t.action);
    }
    if (t.paused) paused = true;
    changed = true;
  }
  return { clock: cur, taken, changed, paused };
}
