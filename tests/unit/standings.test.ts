import { describe, expect, it } from "vitest";

import { rankStandings, type RankMatch } from "@/lib/standings";

const teams = ["A", "B", "C", "D", "E", "F"].map((id) => ({ id, name: `Team ${id}` }));

/** Bo2 group result, `"2-0"` etc. from the home side. */
function g(home: string, away: string, score: "2-0" | "1-1" | "0-2"): RankMatch {
  const [h, a] = score.split("-").map(Number);
  return {
    stage: "group",
    homeTeamId: home,
    awayTeamId: away,
    winnerTeamId: h > a ? home : a > h ? away : null,
    homeScore: h,
    awayScore: a,
  };
}

function tb(winner: string, loser: string): RankMatch {
  return {
    stage: "tiebreaker",
    homeTeamId: winner,
    awayTeamId: loser,
    winnerTeamId: winner,
    homeScore: null,
    awayScore: null,
  };
}

const order = (r: ReturnType<typeof rankStandings>) => r.rows.map((x) => x.teamId);

describe("rankStandings", () => {
  it("scores a 2-0 as two map wins and a 1-1 as one each", () => {
    const r = rankStandings(teams.slice(0, 3), [g("A", "B", "2-0"), g("B", "C", "1-1")]);
    const a = r.rows.find((x) => x.teamId === "A")!;
    const b = r.rows.find((x) => x.teamId === "B")!;
    expect(a).toMatchObject({ wins: 1, draws: 0, losses: 0, points: 2, gamesWon: 2 });
    expect(b).toMatchObject({ wins: 0, draws: 1, losses: 1, points: 1, gamesWon: 1, gamesLost: 3 });
    // B and C level on points and head-to-head; C's map difference is better.
    expect(order(r)).toEqual(["A", "C", "B"]);
  });

  it("breaks a two-way tie on head-to-head", () => {
    // A and B both on 3 points; B beat A.
    const r = rankStandings(teams.slice(0, 4), [
      g("A", "B", "0-2"),
      g("A", "C", "2-0"),
      g("A", "D", "1-1"),
      g("B", "C", "0-2"),
      g("B", "D", "1-1"),
      g("C", "D", "0-2"),
    ]);
    const pts = Object.fromEntries(r.rows.map((x) => [x.teamId, x.points]));
    expect(pts.A).toBe(pts.B);
    expect(order(r).indexOf("B")).toBeLessThan(order(r).indexOf("A"));
  });

  it("falls through a drawn head-to-head to series wins", () => {
    // A: 2-0, 0-2, 1-1 vs B → 3 pts, 1 series win. B: 1-1 x3 → 3 pts, 0 series wins.
    const r = rankStandings(teams.slice(0, 4), [
      g("A", "B", "1-1"),
      g("A", "C", "2-0"),
      g("A", "D", "0-2"),
      g("B", "C", "1-1"),
      g("B", "D", "1-1"),
      g("C", "D", "0-2"),
    ]);
    expect(order(r).indexOf("A")).toBeLessThan(order(r).indexOf("B"));
    expect(r.rows.find((x) => x.teamId === "A")!.tied).toBe(false);
  });

  it("uses a mini-table for a three-way tie", () => {
    // A, B, C each on 5 pts. Among themselves: A beat B, B drew C, C drew A
    // → mini-table A 3, C 2, B 1.
    const r = rankStandings(teams.slice(0, 5), [
      g("A", "B", "2-0"),
      g("B", "C", "1-1"),
      g("C", "A", "1-1"),
      g("A", "D", "0-2"),
      g("B", "D", "2-0"),
      g("C", "D", "1-1"),
      g("A", "E", "2-0"),
      g("B", "E", "2-0"),
      g("C", "E", "2-0"),
      g("D", "E", "0-2"),
    ]);
    const pts = r.rows.filter((x) => "ABC".includes(x.teamId)).map((x) => x.points);
    expect(new Set(pts).size).toBe(1);
    expect(order(r).filter((id) => "ABC".includes(id))).toEqual(["A", "C", "B"]);
  });

  it("flags a tie at the playoff cut and settles it with a tiebreaker game", () => {
    // Everyone draws everyone: all six level on everything.
    const all: RankMatch[] = [];
    for (let i = 0; i < teams.length; i++) {
      for (let j = i + 1; j < teams.length; j++) all.push(g(teams[i].id, teams[j].id, "1-1"));
    }
    const before = rankStandings(teams, all);
    expect(before.rows.every((x) => x.rank === 1 && x.tied)).toBe(true);
    expect(before.tiebreakersNeeded).toEqual([["A", "B", "C", "D", "E", "F"]]);

    // Tiebreaker round robin among all six: A > B > C > D > E > F.
    const ids = teams.map((t) => t.id);
    const tbs: RankMatch[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) tbs.push(tb(ids[i], ids[j]));
    }
    const after = rankStandings(teams, [...all, ...tbs]);
    expect(order(after)).toEqual(ids);
    expect(after.tiebreakersNeeded).toEqual([]);
  });

  it("leaves ties below the top 4 shared without asking for a tiebreaker", () => {
    // A > B > C > D clear; E and F draw each other and lose everything else.
    const r = rankStandings(teams, [
      g("A", "B", "2-0"),
      g("A", "C", "2-0"),
      g("A", "D", "2-0"),
      g("A", "E", "2-0"),
      g("A", "F", "2-0"),
      g("B", "C", "2-0"),
      g("B", "D", "2-0"),
      g("B", "E", "2-0"),
      g("B", "F", "2-0"),
      g("C", "D", "2-0"),
      g("C", "E", "2-0"),
      g("C", "F", "2-0"),
      g("D", "E", "2-0"),
      g("D", "F", "2-0"),
      g("E", "F", "1-1"),
    ]);
    expect(order(r)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(r.rows.slice(4).map((x) => x.rank)).toEqual([5, 5]);
    expect(r.tiebreakersNeeded).toEqual([]);
  });

  it("asks for a tiebreaker when a tie only affects seeding inside the top 4", () => {
    const group = [
      g("A", "B", "1-1"),
      g("A", "C", "2-0"),
      g("A", "D", "2-0"),
      g("B", "C", "2-0"),
      g("B", "D", "2-0"),
      g("C", "D", "2-0"),
    ];
    const r = rankStandings(teams.slice(0, 4), group);
    expect(r.tiebreakersNeeded).toEqual([["A", "B"]]);
    const settled = rankStandings(teams.slice(0, 4), [...group, tb("B", "A")]);
    expect(order(settled)).toEqual(["B", "A", "C", "D"]);
    expect(settled.tiebreakersNeeded).toEqual([]);
  });

  it("ignores playoff matches and unreported group matches", () => {
    const r = rankStandings(teams.slice(0, 2), [
      { ...g("A", "B", "2-0"), stage: "semis" },
      { ...g("A", "B", "2-0"), winnerTeamId: null, homeScore: null, awayScore: null },
    ]);
    expect(r.rows.every((x) => x.matchesPlayed === 0)).toBe(true);
  });

  it("keeps Bo1 seasons ranked on wins, then game difference", () => {
    const bo1 = (home: string, away: string, hs: number, as: number): RankMatch => ({
      stage: "group",
      homeTeamId: home,
      awayTeamId: away,
      winnerTeamId: hs > as ? home : away,
      homeScore: hs,
      awayScore: as,
    });
    // A and B both 1-1 in a 3-team cycle; A won 2-0 and lost 1-2, B won 2-1 and lost 0-2.
    const r = rankStandings(teams.slice(0, 3), [
      bo1("A", "B", 1, 2),
      bo1("B", "C", 0, 2),
      bo1("C", "A", 0, 2),
    ]);
    // All on one win; head-to-head is a cycle, series wins equal → game diff.
    expect(order(r)).toEqual(["A", "C", "B"]);
  });
});
