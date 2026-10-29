// The draft room's clock (docs/MATCH-DAY.md, phase 3): both sides ready → 3s
// countdown → 30s per step → complete. Pure, like rps.ts: deadlines are lazy
// (no cron), so whoever reads or acts next applies what has lapsed.

import {
  resolveTimeout,
  stepAt,
  TOTAL_STEPS,
  type DraftAction,
  type DraftSide,
} from "@/lib/draft-room";

export const DRAFT_COUNTDOWN_MS = 3_000;
export const DRAFT_STEP_MS = 30_000;

export type DraftState = "waiting" | "countdown" | "drafting" | "complete" | "skipped";

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
 * spent, and the next step gets a fresh 30s — or the draft is complete.
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
  return { ...patch, stepDeadline: new Date(now.getTime() + DRAFT_STEP_MS) };
}

export type DraftTransition = {
  patch: Partial<DraftClock>;
  /** A step the clock took (timeout). */
  action?: DraftAction;
};

/**
 * One transition due at `now`, or null. A lapsed step locks the side's hover
 * if it's still available; otherwise a ban is skipped and a pick is random
 * (`resolveTimeout`). New deadlines count from `now`, so a late poll never
 * chains through steps nobody saw.
 */
export function advanceDraft(
  clock: DraftClock,
  actions: readonly DraftAction[],
  now: Date,
  available: (actions: readonly DraftAction[]) => readonly string[],
  rng: () => number = Math.random,
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
              stepDeadline: new Date(now.getTime() + DRAFT_STEP_MS),
            },
          }
        : null;
    case "drafting": {
      if (!clock.stepDeadline || now < clock.stepDeadline) return null;
      const step = stepAt(actions.length + 1);
      if (!step) return { patch: afterStep("blue", actions, now) };
      const championKey = resolveTimeout({
        step,
        hover: clock[hoverKey(step.side)],
        available: available(actions),
        rng,
      });
      const action: DraftAction = { ...step, championKey };
      return { patch: afterStep(step.side, [...actions, action], now), action };
    }
    case "complete":
    case "skipped":
      return null;
  }
}

/** Applies every due transition; returns the clock and the steps the clock took. */
export function settleDraft(
  clock: DraftClock,
  actions: readonly DraftAction[],
  now: Date,
  available: (actions: readonly DraftAction[]) => readonly string[],
  rng: () => number = Math.random,
): { clock: DraftClock; taken: DraftAction[]; changed: boolean } {
  let cur = clock;
  const all = [...actions];
  const taken: DraftAction[] = [];
  let changed = false;
  // Each lapsed step sets a deadline 30s past `now`, so this stops after one
  // timeout; the cap guards a rules bug looping inside a transaction.
  for (let i = 0; i < 8; i++) {
    const t = advanceDraft(cur, all, now, available, rng);
    if (!t) break;
    cur = { ...cur, ...t.patch };
    if (t.action) {
      all.push(t.action);
      taken.push(t.action);
    }
    changed = true;
  }
  return { clock: cur, taken, changed };
}
