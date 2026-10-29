import { describe, expect, it } from "vitest";

import {
  advanceDraft,
  afterStep,
  DRAFT_COUNTDOWN_MS,
  DRAFT_STEP_MS,
  settleDraft,
  type DraftClock,
} from "@/lib/draft-clock";
import { DRAFT_SEQUENCE, type DraftAction } from "@/lib/draft-room";

const T0 = new Date("2026-10-28T20:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const POOL = ["Ahri", "Garen", "Jinx", "Lux", "Thresh"];
const available = (actions: readonly DraftAction[]) =>
  POOL.filter((k) => !actions.some((a) => a.championKey === k));

function clock(over: Partial<DraftClock> = {}): DraftClock {
  return {
    draftState: "waiting",
    blueReadyAt: null,
    redReadyAt: null,
    draftStartsAt: null,
    stepDeadline: null,
    blueHover: null,
    redHover: null,
    draftCompletedAt: null,
    ...over,
  };
}

/** The first `n` steps, with distinct fake champions. */
const steps = (n: number): DraftAction[] =>
  DRAFT_SEQUENCE.slice(0, n).map((s) => ({ ...s, championKey: `C${s.step}` }));

describe("advanceDraft", () => {
  it("waits for both sides, then counts down 3s", () => {
    expect(advanceDraft(clock({ blueReadyAt: T0 }), [], T0, available)).toBeNull();
    expect(advanceDraft(clock({ blueReadyAt: T0, redReadyAt: T0 }), [], T0, available)).toEqual({
      patch: { draftState: "countdown", draftStartsAt: at(DRAFT_COUNTDOWN_MS) },
    });
  });

  it("starts step 1's clock when the countdown ends", () => {
    const c = clock({ draftState: "countdown", draftStartsAt: at(3_000) });
    expect(advanceDraft(c, [], at(2_999), available)).toBeNull();
    expect(advanceDraft(c, [], at(3_000), available)).toEqual({
      patch: { draftState: "drafting", stepDeadline: at(3_000 + DRAFT_STEP_MS) },
    });
  });

  it("does nothing before the step deadline", () => {
    const c = clock({ draftState: "drafting", stepDeadline: at(30_000) });
    expect(advanceDraft(c, [], at(29_999), available)).toBeNull();
  });

  it("locks the on-the-clock side's hover at the deadline", () => {
    const c = clock({
      draftState: "drafting",
      stepDeadline: at(30_000),
      blueHover: "Lux",
      redHover: "Jinx",
    });
    const t = advanceDraft(c, [], at(30_000), available);
    expect(t?.action).toEqual({ step: 1, side: "blue", kind: "ban", championKey: "Lux" });
    expect(t?.patch).toEqual({ blueHover: null, stepDeadline: at(30_000 + DRAFT_STEP_MS) });
  });

  it("skips a ban with no hover, and picks at random with none", () => {
    const ban = advanceDraft(
      clock({ draftState: "drafting", stepDeadline: T0 }),
      [],
      T0,
      available,
    );
    expect(ban?.action?.championKey).toBeNull();

    // Step 7 is blue's first pick.
    const pick = advanceDraft(
      clock({ draftState: "drafting", stepDeadline: T0 }),
      steps(6),
      T0,
      available,
      () => 0,
    );
    expect(pick?.action).toMatchObject({
      step: 7,
      side: "blue",
      kind: "pick",
      championKey: "Ahri",
    });
  });

  it("ignores a hover that's no longer available", () => {
    const taken: DraftAction[] = [{ step: 1, side: "blue", kind: "ban", championKey: "Lux" }];
    const t = advanceDraft(
      clock({ draftState: "drafting", stepDeadline: T0, redHover: "Lux" }),
      taken,
      T0,
      available,
    );
    expect(t?.action).toEqual({ step: 2, side: "red", kind: "ban", championKey: null });
  });

  it("completes after the 20th step", () => {
    const t = advanceDraft(
      clock({ draftState: "drafting", stepDeadline: T0, blueHover: "Garen" }),
      steps(19),
      T0,
      available,
    );
    expect(t?.action).toMatchObject({ step: 20, side: "red", kind: "pick" });
    expect(t?.patch).toMatchObject({
      draftState: "complete",
      stepDeadline: null,
      draftCompletedAt: T0,
    });
  });

  it("does nothing once complete or skipped", () => {
    expect(advanceDraft(clock({ draftState: "complete" }), [], T0, available)).toBeNull();
    expect(advanceDraft(clock({ draftState: "skipped" }), [], T0, available)).toBeNull();
  });
});

describe("afterStep", () => {
  it("spends the side's hover and restarts the clock", () => {
    expect(afterStep("red", steps(2), T0)).toEqual({
      redHover: null,
      stepDeadline: at(DRAFT_STEP_MS),
    });
  });
});

describe("settleDraft", () => {
  it("catches up countdown → drafting in one go, but takes at most one timed-out step", () => {
    const { clock: out, taken } = settleDraft(
      clock({ draftState: "countdown", draftStartsAt: T0 }),
      [],
      at(120_000),
      available,
    );
    expect(out.draftState).toBe("drafting");
    expect(out.stepDeadline).toEqual(at(120_000 + DRAFT_STEP_MS));
    expect(taken).toEqual([]);
  });

  it("reports unchanged when nothing is due", () => {
    const c = clock({ draftState: "drafting", stepDeadline: at(10_000) });
    expect(settleDraft(c, [], T0, available)).toEqual({ clock: c, taken: [], changed: false });
  });
});
