import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { matchDraftActions, matchGamePlayerStats, matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { accountLinks } from "@/db/schema/stats";
import { logEvent, matchEventData } from "@/lib/events";
import { GameResultError, recordGameWinner } from "@/lib/match-day-results";
import {
  draftMismatches,
  parseMatchResult,
  riotMatchId,
  type TournamentCallback,
} from "@/lib/riot-tournament-parse";
import { getMatch } from "@/lib/riot-tournament";
import { getMatchLineups } from "@/lib/substitutions";

// Riot's tournament callback → our game result (docs/MATCH-DAY.md, phase 6).
// Riot only says "game X with code Y ended"; the result comes from Match-v5.

export type CallbackOutcome =
  /** Not one of our codes, or nothing usable in the match — don't retry. */
  | { status: "ignored"; reason: string }
  /** Match-v5 isn't ready (or Riot errored) — ask Riot to retry. */
  | { status: "retry"; reason: string }
  | { status: "recorded"; gameId: string; winnerTeamId: string };

export async function applyTournamentCallback(cb: TournamentCallback): Promise<CallbackOutcome> {
  const game = await db.query.matchGames.findFirst({
    where: eq(matchGames.tournamentCode, cb.shortCode),
  });
  if (!game?.blueTeamId || !game.redTeamId) return { status: "ignored", reason: "unknown code" };
  const match = await db.query.matches.findFirst({ where: eq(matches.id, game.matchId) });
  if (!match) return { status: "ignored", reason: "match gone" };

  const riotId = riotMatchId(cb);
  const res = await getMatch(riotId);
  if (!res.ok) return { status: "retry", reason: res.error };
  const parsed = parseMatchResult(res.data);
  if (!parsed) return { status: "ignored", reason: "no winner in Match-v5" };

  // Who's who: linked Riot accounts → users → which team's lineup they're in.
  const puuids = parsed.players.map((p) => p.puuid);
  const links = await db
    .select({ userId: accountLinks.userId, puuid: accountLinks.externalId })
    .from(accountLinks)
    .where(and(eq(accountLinks.provider, "riot"), inArray(accountLinks.externalId, puuids)));
  const userOf = new Map(links.map((l) => [l.puuid, l.userId]));
  const lineups = await getMatchLineups(match);
  const teamOf = (userId: string | undefined) =>
    !userId
      ? null
      : lineups.home.some((p) => p.userId === userId && !p.satOut)
        ? match.homeTeamId
        : lineups.away.some((p) => p.userId === userId && !p.satOut)
          ? match.awayTeamId
          : null;

  // Winner by the players who won, not the lobby side: teams sometimes join
  // the wrong side. Falls back to the side we recorded.
  const votes = new Map<string, number>();
  for (const p of parsed.players.filter((p) => p.win)) {
    const t = teamOf(userOf.get(p.puuid));
    if (t) votes.set(t, (votes.get(t) ?? 0) + 1);
  }
  const byPlayers = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const winnerTeamId =
    byPlayers ?? (parsed.winnerSide === "blue" ? game.blueTeamId : game.redTeamId);

  await db.update(matchGames).set({ riotMatchId: riotId }).where(eq(matchGames.id, game.id));
  await db
    .insert(matchGamePlayerStats)
    .values(
      parsed.players.map((p) => ({ ...p, gameId: game.id, userId: userOf.get(p.puuid) ?? null })),
    )
    .onConflictDoNothing();

  // Flags for admins: champions nobody drafted for that side (blind pick lets
  // anyone lock anything) and players we can't place in either lineup.
  const picks = await db
    .select({ side: matchDraftActions.side, championKey: matchDraftActions.championKey })
    .from(matchDraftActions)
    .where(and(eq(matchDraftActions.gameId, game.id), eq(matchDraftActions.kind, "pick")));
  const mismatches = draftMismatches(picks, parsed.players);
  const unknown = parsed.players.filter((p) => !teamOf(userOf.get(p.puuid))).length;
  if (mismatches.length || unknown) {
    await logEvent("match.riot_flag", {
      seasonId: match.seasonId,
      data: {
        ...(await matchEventData(match.id)),
        gameNumber: game.gameNumber,
        riotMatchId: riotId,
        notDrafted: mismatches.map((m) => `${m.side} ${m.championKey}`).join(", ") || null,
        unknownPlayers: unknown || null,
      },
    });
  }

  try {
    await recordGameWinner({
      matchId: match.id,
      gameNumber: game.gameNumber,
      winnerTeamId,
      actorId: null,
      privileged: true,
    });
  } catch (err) {
    // Already decided by hand (match confirmed, etc.): keep the stats, skip the result.
    if (!(err instanceof GameResultError)) throw err;
    return { status: "ignored", reason: err.message };
  }
  return { status: "recorded", gameId: game.id, winnerTeamId };
}
