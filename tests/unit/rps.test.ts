import { describe, expect, it } from "vitest";

import {
  advanceRps,
  griefLine,
  isRpsThrow,
  randomSide,
  roundOutcome,
  RPS_MAX_DOUBLE_VOIDS,
  RPS_REVEAL_MS,
  RPS_THROW_MS,
  settleRps,
  sidePickMs,
  type RpsCore,
  type RpsRound,
} from "@/lib/rps";

const TEAMS = { homeTeamId: "home-team", awayTeamId: "away-team" };
const T0 = new Date("2026-10-28T20:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

function row(over: Partial<RpsCore> = {}): RpsCore {
  return {
    state: "waiting",
    homeUserId: null,
    awayUserId: null,
    homeReadyAt: null,
    awayReadyAt: null,
    round: 0,
    throwDeadline: null,
    revealUntil: null,
    homeThrow: null,
    awayThrow: null,
    history: [],
    winnerTeamId: null,
    ...over,
  };
}

const ready = { homeUserId: "h", awayUserId: "a", homeReadyAt: T0, awayReadyAt: T0 };
const throwing = (over: Partial<RpsCore> = {}) =>
  row({ ...ready, state: "throwing", round: 1, throwDeadline: at(RPS_THROW_MS), ...over });

describe("roundOutcome", () => {
  it("applies the usual rules from the home side", () => {
    expect(roundOutcome("rock", "scissors")).toBe("home");
    expect(roundOutcome("paper", "rock")).toBe("home");
    expect(roundOutcome("scissors", "paper")).toBe("home");
    expect(roundOutcome("scissors", "rock")).toBe("away");
    expect(roundOutcome("rock", "paper")).toBe("away");
    expect(roundOutcome("paper", "scissors")).toBe("away");
  });
  it("ties on equal throws", () => {
    expect(roundOutcome("rock", "rock")).toBe("tie");
  });
  it("voids a round with a missing throw", () => {
    expect(roundOutcome(null, "rock")).toBe("void");
    expect(roundOutcome("rock", null)).toBe("void");
    expect(roundOutcome(null, null)).toBe("void");
  });
});

describe("isRpsThrow", () => {
  it("accepts only the three throws", () => {
    expect(isRpsThrow("rock")).toBe(true);
    expect(isRpsThrow("lizard")).toBe(false);
    expect(isRpsThrow(null)).toBe(false);
  });
});

describe("advanceRps", () => {
  it("waits until both seats are ready", () => {
    expect(advanceRps(row({ homeUserId: "h", homeReadyAt: T0 }), T0, TEAMS)).toBeNull();
  });

  it("starts round 1 with a fresh deadline once both are ready", () => {
    expect(advanceRps(row(ready), T0, TEAMS)).toEqual({
      state: "throwing",
      round: 1,
      throwDeadline: at(RPS_THROW_MS),
      revealUntil: null,
      homeThrow: null,
      awayThrow: null,
    });
  });

  it("keeps waiting for throws before the deadline", () => {
    expect(advanceRps(throwing({ homeThrow: "rock" }), at(5_000), TEAMS)).toBeNull();
  });

  it("reveals as soon as both have thrown", () => {
    const patch = advanceRps(
      throwing({ homeThrow: "rock", awayThrow: "scissors" }),
      at(2_000),
      TEAMS,
    );
    expect(patch).toMatchObject({
      state: "revealed",
      revealUntil: at(2_000 + RPS_REVEAL_MS),
      winnerTeamId: "home-team",
    });
    expect(patch?.history).toEqual([{ round: 1, home: "rock", away: "scissors", outcome: "home" }]);
  });

  it("voids the round at the deadline when someone didn't throw", () => {
    const patch = advanceRps(throwing({ awayThrow: "paper" }), at(RPS_THROW_MS), TEAMS);
    expect(patch).toMatchObject({ state: "revealed", winnerTeamId: null });
    expect(patch?.history?.at(-1)).toEqual({
      round: 1,
      home: null,
      away: "paper",
      outcome: "void",
    });
  });

  it("holds the reveal, then finishes on a win", () => {
    const revealed = row({
      ...ready,
      state: "revealed",
      round: 1,
      revealUntil: at(3_000),
      winnerTeamId: "away-team",
    });
    expect(advanceRps(revealed, at(2_999), TEAMS)).toBeNull();
    expect(advanceRps(revealed, at(3_000), TEAMS)).toEqual({ state: "done" });
  });

  it("replays after a tie or a void, counting the deadline from now", () => {
    const revealed = row({
      ...ready,
      state: "revealed",
      round: 2,
      revealUntil: at(3_000),
      history: [{ round: 2, home: "rock", away: "rock", outcome: "tie" }],
    });
    expect(advanceRps(revealed, at(60_000), TEAMS)).toMatchObject({
      state: "throwing",
      round: 3,
      throwDeadline: at(60_000 + RPS_THROW_MS),
    });
  });

  it("goes back to ready-up after too many rounds where neither threw", () => {
    const afk: RpsRound[] = Array.from({ length: RPS_MAX_DOUBLE_VOIDS }, (_, i) => ({
      round: i + 1,
      home: null,
      away: null,
      outcome: "void",
    }));
    const revealed = row({ ...ready, state: "revealed", round: 3, revealUntil: T0, history: afk });
    expect(advanceRps(revealed, T0, TEAMS)).toMatchObject({
      state: "waiting",
      homeUserId: null,
      awayUserId: null,
      homeReadyAt: null,
      awayReadyAt: null,
    });
  });

  it("doesn't count one-sided voids towards the AFK reset", () => {
    const history: RpsRound[] = [
      { round: 1, home: null, away: null, outcome: "void" },
      { round: 2, home: "rock", away: null, outcome: "void" },
      { round: 3, home: null, away: null, outcome: "void" },
    ];
    const revealed = row({ ...ready, state: "revealed", round: 3, revealUntil: T0, history });
    expect(advanceRps(revealed, T0, TEAMS)).toMatchObject({ state: "throwing", round: 4 });
  });

  it("does nothing once done", () => {
    expect(advanceRps(row({ state: "done", winnerTeamId: "home-team" }), T0, TEAMS)).toBeNull();
  });
});

describe("settleRps", () => {
  it("catches up through a lapsed round and its reveal in one go", () => {
    const { row: out, changed } = settleRps(
      throwing({ homeThrow: "paper" }),
      at(RPS_THROW_MS + RPS_REVEAL_MS + 5_000),
      TEAMS,
    );
    // void → reveal (deadline from now, still in the future) — stops there.
    expect(changed).toBe(true);
    expect(out.state).toBe("revealed");
    expect(out.history).toHaveLength(1);
  });

  it("reports no change when nothing is due", () => {
    const start = throwing();
    const { row: out, changed } = settleRps(start, at(1_000), TEAMS);
    expect(changed).toBe(false);
    expect(out).toBe(start);
  });
});

describe("griefLine / randomSide", () => {
  it("names the griefer", () => {
    expect(griefLine("Faker", 1)).toContain("Faker");
  });
  it("picks a side from the rng", () => {
    expect(randomSide(() => 0.1)).toBe("blue");
    expect(randomSide(() => 0.9)).toBe("red");
  });
});

describe("sidePickMs", () => {
  it("gives the RPS winner 60s for game 1 and the loser 5 minutes after", () => {
    expect(sidePickMs(1)).toBe(60_000);
    expect(sidePickMs(2)).toBe(5 * 60_000);
    expect(sidePickMs(3)).toBe(5 * 60_000);
  });
});
