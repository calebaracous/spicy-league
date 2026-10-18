/**
 * Pure substitution rules (no DB) so they can be unit-tested. The DB-backed
 * wrapper that gathers the inputs is `checkSubEligibility` in
 * src/lib/substitutions.ts. Design: docs/design/SUBSTITUTIONS.md.
 */

/** Approved + pending subs allowed per team per match (5v5). */
export const MAX_SUBS_PER_TEAM = 2;

export type ActiveSub = {
  teamId: string;
  subUserId: string;
  replacedUserId: string | null;
  status: "pending" | "approved";
};

export type SubRequestContext = {
  matchState: "scheduled" | "reported" | "confirmed" | "disputed";
  requestingTeamId: string;
  /** Current rosters (captain included) of the two teams in the match. */
  homeTeamId: string;
  awayTeamId: string;
  homeRoster: ReadonlySet<string>;
  awayRoster: ReadonlySet<string>;
  candidateId: string;
  /** Roster player sitting out, or null when filling an empty slot. */
  replacedUserId: string | null;
  candidateSignedUp: boolean;
  /** Team the candidate is drafted to in this season, if any. */
  candidateTeamId: string | null;
  candidateBanned: boolean;
  /** Pending + approved subs already on this match (both teams). */
  activeSubs: readonly ActiveSub[];
};

export type SubRuleError =
  | "locked"
  | "not-in-match"
  | "in-match"
  | "banned"
  | "not-signed-up"
  | "already-subbing"
  | "not-on-roster"
  | "already-replaced"
  | "sub-limit";

export type SubRuleResult = { ok: true; crossTeam: boolean } | { ok: false; error: SubRuleError };

export function evaluateSubRequest(ctx: SubRequestContext): SubRuleResult {
  // The lineup locks once a result is reported.
  if (ctx.matchState !== "scheduled") return { ok: false, error: "locked" };

  const isHome = ctx.requestingTeamId === ctx.homeTeamId;
  const isAway = ctx.requestingTeamId === ctx.awayTeamId;
  if (!isHome && !isAway) return { ok: false, error: "not-in-match" };
  const ownRoster = isHome ? ctx.homeRoster : ctx.awayRoster;

  if (ctx.homeRoster.has(ctx.candidateId) || ctx.awayRoster.has(ctx.candidateId)) {
    return { ok: false, error: "in-match" };
  }
  if (ctx.candidateBanned) return { ok: false, error: "banned" };
  if (!ctx.candidateSignedUp && !ctx.candidateTeamId) {
    return { ok: false, error: "not-signed-up" };
  }
  if (ctx.activeSubs.some((s) => s.subUserId === ctx.candidateId)) {
    return { ok: false, error: "already-subbing" };
  }

  if (ctx.replacedUserId) {
    if (!ownRoster.has(ctx.replacedUserId)) return { ok: false, error: "not-on-roster" };
    if (ctx.activeSubs.some((s) => s.replacedUserId === ctx.replacedUserId)) {
      return { ok: false, error: "already-replaced" };
    }
  }

  const teamSubs = ctx.activeSubs.filter((s) => s.teamId === ctx.requestingTeamId).length;
  if (teamSubs >= MAX_SUBS_PER_TEAM) return { ok: false, error: "sub-limit" };

  return { ok: true, crossTeam: ctx.candidateTeamId !== null };
}

export const SUB_ERROR_MESSAGES: Record<SubRuleError | string, string> = {
  locked: "The lineup is locked once a result has been reported.",
  "not-in-match": "Only the two teams in this match can request subs.",
  "in-match": "That player is already playing in this match.",
  banned: "That player is suspended from the league.",
  "not-signed-up": "Subs must be signed up for this season.",
  "already-subbing": "That player already has a sub request or slot in this match.",
  "not-on-roster": "The player sitting out must be on your roster.",
  "already-replaced": "Someone is already subbing in for that player.",
  "sub-limit": `A team can use at most ${MAX_SUBS_PER_TEAM} subs per match.`,
  "not-captain": "Only the team's captain (or an admin) can request subs.",
  "sub-not-found": "That sub request no longer exists.",
  "not-pending": "That request has already been decided.",
  "no-candidate": "Pick a player to sub in.",
  "ping-unavailable":
    "This match has no Discord thread yet, so the Sub list can't be pinged. Ask an admin to run Sync Discord.",
  "ping-failed": "Couldn't reach Discord. Try again in a minute.",
  "ping-too-soon": "You pinged the Sub list for this match recently. Try again in a bit.",
};
