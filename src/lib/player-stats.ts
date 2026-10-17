/**
 * Per-player career tallies for the player directory (`/users`). Pure — the
 * DB side is `src/lib/players.ts`, which feeds these the raw rows.
 *
 * A season match counts for whoever was in the lineup: the team roster minus
 * approved `replacedUserId`s plus approved `subUserId`s (same derivation as
 * `getMatchLineups` in `src/lib/substitutions.ts`). Sitting out is not a game
 * played, so it's excluded from the record.
 */

export type RecordTally = { wins: number; losses: number };

export type TallyMatch = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
};

export type TallyMembership = { userId: string; teamId: string };

/** Approved substitutions only. */
export type TallySub = {
  matchId: string;
  teamId: string;
  subUserId: string;
  replacedUserId: string | null;
};

function bump(map: Map<string, RecordTally>, userId: string, won: boolean) {
  const t = map.get(userId) ?? { wins: 0, losses: 0 };
  if (won) t.wins++;
  else t.losses++;
  map.set(userId, t);
}

/** Season W–L per user over confirmed matches. Matches without a winner are skipped. */
export function tallyMatchRecords(
  matches: TallyMatch[],
  memberships: TallyMembership[],
  subs: TallySub[],
): Map<string, RecordTally> {
  const roster = new Map<string, string[]>();
  for (const m of memberships) {
    const list = roster.get(m.teamId) ?? [];
    list.push(m.userId);
    roster.set(m.teamId, list);
  }
  const subsByMatch = new Map<string, TallySub[]>();
  for (const s of subs) {
    const list = subsByMatch.get(s.matchId) ?? [];
    list.push(s);
    subsByMatch.set(s.matchId, list);
  }

  const records = new Map<string, RecordTally>();
  for (const match of matches) {
    if (!match.winnerTeamId) continue;
    const matchSubs = subsByMatch.get(match.id) ?? [];
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      const teamSubs = matchSubs.filter((s) => s.teamId === teamId);
      const out = new Set(teamSubs.map((s) => s.replacedUserId).filter(Boolean));
      const lineup = new Set([
        ...(roster.get(teamId) ?? []).filter((u) => !out.has(u)),
        ...teamSubs.map((s) => s.subUserId),
      ]);
      const won = match.winnerTeamId === teamId;
      for (const userId of lineup) bump(records, userId, won);
    }
  }
  return records;
}

export type TallyTenMan = { id: string; winnerCaptainUserId: string | null };
export type TallyTenManCaptain = { tenManId: string; userId: string };
export type TallyTenManPick = { tenManId: string; captainUserId: string; pickedUserId: string };

/**
 * 10-man W–L per user over completed 10-mans. A player's side is their own
 * captaincy or the captain who picked them. 10-mans whose winner is unknown
 * (captain account deleted → null) are skipped.
 */
export function tallyTenManRecords(
  tenMans: TallyTenMan[],
  captains: TallyTenManCaptain[],
  picks: TallyTenManPick[],
): Map<string, RecordTally> {
  const winner = new Map(tenMans.map((t) => [t.id, t.winnerCaptainUserId]));
  const records = new Map<string, RecordTally>();
  const credit = (tenManId: string, userId: string, captainUserId: string) => {
    const w = winner.get(tenManId);
    if (!w) return;
    bump(records, userId, w === captainUserId);
  };
  for (const c of captains) credit(c.tenManId, c.userId, c.userId);
  for (const p of picks) credit(p.tenManId, p.pickedUserId, p.captainUserId);
  return records;
}
