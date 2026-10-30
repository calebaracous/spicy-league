import "server-only";

import { and, asc, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import type { LiveMatch } from "@/lib/live-match";
import { loadLiveMatches, matchDayApplies } from "@/lib/match-day";
import { roundLabel } from "@/lib/match-format";
import { getTeamForCaptain } from "@/lib/schedule";

export type CurrentTeam = {
  season: { name: string; slug: string };
  team: { id: string; name: string };
  /** The match being played now, else the next scheduled one by round. */
  next: {
    id: string;
    opponentName: string;
    roundLabel: string;
    scheduledAt: Date | null;
    live: LiveMatch | null;
    /** This team is the away side (live scores read home–away). */
    isAway: boolean;
  } | null;
};

/**
 * The teams a player is on in seasons being played (group stage or playoffs),
 * with their next match, for the public profile. Rostered players only —
 * a sub booked into one match isn't on that team.
 */
export async function getCurrentTeams(userId: string): Promise<CurrentTeam[]> {
  const active = await db
    .select({ id: seasons.id, name: seasons.name, slug: seasons.slug, game: seasons.game })
    .from(seasons)
    .where(inArray(seasons.state, ["group_stage", "playoffs"]));

  const results = await Promise.all(
    active.map(async (season): Promise<CurrentTeam | null> => {
      const team = await getTeamForCaptain(season.id, userId);
      if (!team) return null;
      const scheduled = await db.query.matches.findMany({
        where: and(
          eq(matches.seasonId, season.id),
          eq(matches.state, "scheduled"),
          or(eq(matches.homeTeamId, team.id), eq(matches.awayTeamId, team.id)),
        ),
        orderBy: [asc(matches.round)],
      });
      const live = matchDayApplies(season)
        ? await loadLiveMatches(scheduled)
        : new Map<string, LiveMatch>();
      const next = scheduled.find((m) => live.has(m.id)) ?? scheduled[0] ?? null;
      const opponentId = next
        ? next.homeTeamId === team.id
          ? next.awayTeamId
          : next.homeTeamId
        : null;
      const opponent = opponentId
        ? await db.query.teams.findFirst({ where: eq(teams.id, opponentId) })
        : null;
      return {
        season: { name: season.name, slug: season.slug },
        team,
        next: next
          ? {
              id: next.id,
              opponentName: opponent?.name ?? "TBD",
              roundLabel: roundLabel(next.stage, next.round),
              scheduledAt: next.scheduledAt,
              live: live.get(next.id) ?? null,
              isAway: next.awayTeamId === team.id,
            }
          : null,
      };
    }),
  );
  return results.filter((r): r is CurrentTeam => r !== null);
}
