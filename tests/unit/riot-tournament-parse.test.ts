import { describe, expect, it } from "vitest";

import {
  draftMismatches,
  parseMatchResult,
  parseTournamentCallback,
  riotMatchId,
} from "@/lib/riot-tournament-parse";

const participant = (puuid: string, teamId: 100 | 200, championName: string, win: boolean) => ({
  puuid,
  teamId,
  championName,
  kills: 3,
  deaths: 1,
  assists: 7,
  totalMinionsKilled: 180,
  neutralMinionsKilled: 12,
  goldEarned: 11000,
  totalDamageDealtToChampions: 21000,
  visionScore: 30,
  win,
});

describe("parseTournamentCallback", () => {
  it("reads Riot's callback body", () => {
    expect(
      parseTournamentCallback({
        startTime: 1,
        shortCode: "NA0418d-abc",
        metaData: '{"matchId":"m1","gameNumber":2}',
        gameId: 5012345678,
        region: "na1",
      }),
    ).toEqual({
      shortCode: "NA0418d-abc",
      gameId: 5012345678,
      metaData: '{"matchId":"m1","gameNumber":2}',
      region: "NA1",
    });
  });

  it("rejects a body without a code or game id", () => {
    expect(parseTournamentCallback({ gameId: 1 })).toBeNull();
    expect(parseTournamentCallback({ shortCode: "x", gameId: "nope" })).toBeNull();
    expect(parseTournamentCallback(null)).toBeNull();
  });

  it("builds the Match-v5 id", () => {
    expect(riotMatchId({ region: "NA1", gameId: 42 })).toBe("NA1_42");
  });
});

describe("parseMatchResult", () => {
  it("maps team 100 to blue, sums CS, and finds the winner", () => {
    const out = parseMatchResult({
      info: {
        participants: [participant("a", 100, "Garen", true), participant("b", 200, "Jinx", false)],
      },
    });
    expect(out?.winnerSide).toBe("blue");
    expect(out?.players[0]).toEqual({
      puuid: "a",
      side: "blue",
      championKey: "Garen",
      kills: 3,
      deaths: 1,
      assists: 7,
      cs: 192,
      gold: 11000,
      damage: 21000,
      visionScore: 30,
      win: true,
    });
  });

  it("is null without a clear winner or with malformed participants", () => {
    expect(
      parseMatchResult({
        info: {
          participants: [
            participant("a", 100, "Garen", false),
            participant("b", 200, "Jinx", false),
          ],
        },
      }),
    ).toBeNull();
    expect(parseMatchResult({ info: { participants: [{ puuid: "a" }] } })).toBeNull();
    expect(parseMatchResult({})).toBeNull();
  });
});

describe("draftMismatches", () => {
  const drafted = [
    { side: "blue" as const, championKey: "Fiddlesticks" },
    { side: "red" as const, championKey: "Jinx" },
  ];
  it("ignores id casing differences between Match-v5 and Data Dragon", () => {
    expect(
      draftMismatches(drafted, [
        { side: "blue", championKey: "FiddleSticks" },
        { side: "red", championKey: "Jinx" },
      ]),
    ).toEqual([]);
  });

  it("flags champions a side played that it didn't draft", () => {
    expect(
      draftMismatches(drafted, [
        { side: "blue", championKey: "Jinx" },
        { side: "red", championKey: "Jinx" },
      ]),
    ).toEqual([{ side: "blue", championKey: "Jinx" }]);
  });

  it("checks nothing when there was no draft", () => {
    expect(draftMismatches([], [{ side: "blue", championKey: "Lux" }])).toEqual([]);
  });
});
