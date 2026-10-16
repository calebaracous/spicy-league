import { describe, expect, it } from "vitest";

import {
  evaluateSubRequest,
  MAX_SUBS_PER_TEAM,
  type SubRequestContext,
} from "@/lib/substitution-rules";

const base = (): SubRequestContext => ({
  matchState: "scheduled",
  requestingTeamId: "home",
  homeTeamId: "home",
  awayTeamId: "away",
  homeRoster: new Set(["h1", "h2", "h3", "h4", "h5"]),
  awayRoster: new Set(["a1", "a2", "a3", "a4", "a5"]),
  candidateId: "fa1",
  replacedUserId: "h2",
  candidateSignedUp: true,
  candidateTeamId: null,
  candidateBanned: false,
  activeSubs: [],
});

describe("evaluateSubRequest", () => {
  it("allows an undrafted season signup", () => {
    expect(evaluateSubRequest(base())).toEqual({ ok: true, crossTeam: false });
  });

  it("flags a player from another team as cross-team", () => {
    expect(evaluateSubRequest({ ...base(), candidateTeamId: "third" })).toEqual({
      ok: true,
      crossTeam: true,
    });
  });

  it("allows filling an empty slot (no replaced player)", () => {
    expect(evaluateSubRequest({ ...base(), replacedUserId: null }).ok).toBe(true);
  });

  it.each(["reported", "confirmed", "disputed"] as const)("locks the lineup when %s", (s) => {
    expect(evaluateSubRequest({ ...base(), matchState: s })).toEqual({
      ok: false,
      error: "locked",
    });
  });

  it("rejects a team that isn't in the match", () => {
    expect(evaluateSubRequest({ ...base(), requestingTeamId: "third" })).toMatchObject({
      error: "not-in-match",
    });
  });

  it("rejects players already in this match, on either side", () => {
    expect(evaluateSubRequest({ ...base(), candidateId: "h4" })).toMatchObject({
      error: "in-match",
    });
    expect(evaluateSubRequest({ ...base(), candidateId: "a1" })).toMatchObject({
      error: "in-match",
    });
  });

  it("rejects banned players", () => {
    expect(evaluateSubRequest({ ...base(), candidateBanned: true })).toMatchObject({
      error: "banned",
    });
  });

  it("rejects accounts that didn't sign up for the season", () => {
    expect(evaluateSubRequest({ ...base(), candidateSignedUp: false })).toMatchObject({
      error: "not-signed-up",
    });
  });

  it("rejects a candidate already subbing in this match (either team)", () => {
    const ctx = base();
    ctx.activeSubs = [
      { teamId: "away", subUserId: "fa1", replacedUserId: "a3", status: "pending" },
    ];
    expect(evaluateSubRequest(ctx)).toMatchObject({ error: "already-subbing" });
  });

  it("requires the sitting-out player to be on the requesting roster", () => {
    expect(evaluateSubRequest({ ...base(), replacedUserId: "a2" })).toMatchObject({
      error: "not-on-roster",
    });
  });

  it("doesn't let two subs replace the same player", () => {
    const ctx = base();
    ctx.activeSubs = [
      { teamId: "home", subUserId: "fa9", replacedUserId: "h2", status: "approved" },
    ];
    expect(evaluateSubRequest(ctx)).toMatchObject({ error: "already-replaced" });
  });

  it(`caps a team at ${MAX_SUBS_PER_TEAM} subs per match`, () => {
    const ctx = base();
    ctx.replacedUserId = "h5";
    ctx.activeSubs = [
      { teamId: "home", subUserId: "x1", replacedUserId: "h1", status: "approved" },
      { teamId: "home", subUserId: "x2", replacedUserId: "h3", status: "pending" },
      { teamId: "away", subUserId: "x3", replacedUserId: "a1", status: "approved" },
    ];
    expect(evaluateSubRequest(ctx)).toMatchObject({ error: "sub-limit" });
  });
});
