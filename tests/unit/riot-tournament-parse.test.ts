import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";

import {
  draftMismatches,
  matchPlayersToUsers,
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
      riotId: null,
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

describe("parseMatchResult on a real tournament-code game", () => {
  // A real Match-v5 game (queue 3130, played on a tournament code), with
  // PUUIDs and Riot IDs replaced. docs/design/RIOT-STATS-EXPANSION.md.
  const real = JSON.parse(readFileSync("tests/fixtures/riot/tourney-match.json", "utf8"));

  it("reads the winner, all ten lines, and Riot IDs", () => {
    const out = parseMatchResult(real);
    expect(out?.winnerSide).toBe("blue");
    expect(out?.players).toHaveLength(10);
    expect(out?.players.map((p) => p.side)).toEqual([
      ...Array(5).fill("blue"),
      ...Array(5).fill("red"),
    ]);
    expect(out?.players[0]).toMatchObject({
      puuid: "puuid-1",
      riotId: "Player 1#TST",
      championKey: "Renekton",
      kills: 7,
      deaths: 6,
      assists: 6,
    });
  });
});

describe("matchPlayersToUsers", () => {
  const players = [
    { puuid: "p1", riotId: "Alpha#NA1" },
    { puuid: "p2", riotId: "Beta#NA1" },
    { puuid: "p3", riotId: null },
  ];

  it("matches by PUUID", () => {
    const { userOf, byRiotId } = matchPlayersToUsers(players, [
      { userId: "u1", puuid: "p1", handle: "Alpha#NA1" },
      { userId: "u3", puuid: "p3", handle: "Gamma#NA1" },
    ]);
    expect([...userOf]).toEqual([
      ["p1", "u1"],
      ["p3", "u3"],
    ]);
    expect(byRiotId).toBe(0);
  });

  it("falls back to Riot ID, ignoring case, when the PUUID is from another key", () => {
    const { userOf, byRiotId } = matchPlayersToUsers(players, [
      { userId: "u1", puuid: "old-key-p1", handle: "alpha#na1" },
      { userId: "u2", puuid: "old-key-p2", handle: " Beta#NA1 " },
    ]);
    expect(userOf.get("p1")).toBe("u1");
    expect(userOf.get("p2")).toBe("u2");
    expect(byRiotId).toBe(2);
  });

  it("prefers a PUUID match and never matches a user twice", () => {
    // u1's handle is stale (Beta was renamed into it): PUUID wins, and the
    // Riot ID fallback can't hand u1 a second player.
    const { userOf, byRiotId } = matchPlayersToUsers(players, [
      { userId: "u1", puuid: "p1", handle: "Beta#NA1" },
    ]);
    expect([...userOf]).toEqual([["p1", "u1"]]);
    expect(byRiotId).toBe(0);
  });

  it("skips a PUUID or Riot ID linked by more than one user", () => {
    const { userOf } = matchPlayersToUsers(players, [
      { userId: "u1", puuid: "p1", handle: null },
      { userId: "u9", puuid: "p1", handle: null },
      { userId: "u2", puuid: "x", handle: "Beta#NA1" },
      { userId: "u8", puuid: "y", handle: "beta#na1" },
    ]);
    expect(userOf.size).toBe(0);
  });
});
