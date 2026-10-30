import "server-only";

import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  notInArray,
  or,
  isNull,
} from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { drafts, teams } from "@/db/schema/drafts";
import { matchGames } from "@/db/schema/match-day";
import { matches } from "@/db/schema/matches";
import { seasons, seasonSignups } from "@/db/schema/seasons";
import { accountLinks } from "@/db/schema/stats";
import type { LiveMatch } from "@/lib/live-match";
import { loadLiveMatches } from "@/lib/match-day";
import { getPendingSubsBySeason } from "@/lib/substitutions";
import { getActiveTenMan } from "@/lib/ten-man";

export type ActionItem = { label: string; detail: string; href: string };
export type LiveMatchItem = { href: string; teams: string; seasonName: string; live: LiveMatch };

/**
 * Match night (docs/MATCH-DAY.md): LoL matches being played right now, and
 * the match-day games waiting on an admin — drafts paused because a pick ran
 * out with nothing hovered, and game results a captain flagged as wrong
 * (cleared by Edit result).
 */
async function getMatchNight() {
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const matchCols = {
    id: matches.id,
    state: matches.state,
    homeTeamId: matches.homeTeamId,
    awayTeamId: matches.awayTeamId,
    homeName: home.name,
    awayName: away.name,
    seasonName: seasons.name,
    seasonSlug: seasons.slug,
  };
  const [scheduled, waitingGames] = await Promise.all([
    db
      .select(matchCols)
      .from(matches)
      .innerJoin(seasons, eq(matches.seasonId, seasons.id))
      .innerJoin(home, eq(home.id, matches.homeTeamId))
      .innerJoin(away, eq(away.id, matches.awayTeamId))
      .where(and(eq(matches.state, "scheduled"), eq(seasons.game, "lol"))),
    db
      .select({
        ...matchCols,
        gameNumber: matchGames.gameNumber,
        draftState: matchGames.draftState,
        stepDeadline: matchGames.stepDeadline,
        flaggedAt: matchGames.resultFlaggedAt,
      })
      .from(matchGames)
      .innerJoin(matches, eq(matchGames.matchId, matches.id))
      .innerJoin(seasons, eq(matches.seasonId, seasons.id))
      .innerJoin(home, eq(home.id, matches.homeTeamId))
      .innerJoin(away, eq(away.id, matches.awayTeamId))
      .where(
        or(
          isNotNull(matchGames.resultFlaggedAt),
          and(
            eq(matches.state, "scheduled"),
            eq(matchGames.draftState, "drafting"),
            isNull(matchGames.stepDeadline),
          ),
        ),
      ),
  ]);

  const live = await loadLiveMatches(scheduled);
  const href = (m: { seasonSlug: string; id: string }) =>
    `/seasons/${m.seasonSlug}/matches/${m.id}`;
  const liveMatches: LiveMatchItem[] = scheduled
    .filter((m) => live.has(m.id))
    .map((m) => ({
      href: href(m),
      teams: `${m.homeName} vs ${m.awayName}`,
      seasonName: m.seasonName,
      live: live.get(m.id)!,
    }));
  const actionItems: ActionItem[] = waitingGames.map((g) =>
    g.flaggedAt
      ? {
          label: `Game ${g.gameNumber} result flagged`,
          detail: `${g.homeName} vs ${g.awayName} · ${g.seasonName} (saving Edit result clears it)`,
          href: href(g),
        }
      : {
          label: `Game ${g.gameNumber} draft paused`,
          detail: `${g.homeName} vs ${g.awayName} · ${g.seasonName}`,
          href: `${href(g)}/games/${g.gameNumber}`,
        },
  );
  return { liveMatches, actionItems };
}

/** Everything the /admin overview shows, in one round of parallel queries. */
export async function getAdminOverview() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  const [
    [{ totalUsers }],
    [{ newUsers }],
    [{ unverified }],
    [{ activeBans }],
    [{ riotLinked }],
    latestUsers,
    latestSignups,
    activeSeasons,
    pendingMatches,
    pausedDrafts,
    activeTenMan,
    matchNight,
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(users),
    db.select({ newUsers: count() }).from(users).where(gt(users.createdAt, weekAgo)),
    db.select({ unverified: count() }).from(users).where(eq(users.emailVerified, false)),
    db
      .select({ activeBans: count() })
      .from(users)
      .where(
        and(isNotNull(users.bannedAt), or(isNull(users.banExpiresAt), gt(users.banExpiresAt, now))),
      ),
    db
      .select({ riotLinked: countDistinct(accountLinks.userId) })
      .from(accountLinks)
      .where(eq(accountLinks.provider, "riot")),
    db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(8),
    db
      .select({
        id: seasonSignups.id,
        createdAt: seasonSignups.createdAt,
        username: users.username,
        name: users.name,
        seasonName: seasons.name,
        seasonSlug: seasons.slug,
      })
      .from(seasonSignups)
      .innerJoin(users, eq(seasonSignups.userId, users.id))
      .innerJoin(seasons, eq(seasonSignups.seasonId, seasons.id))
      .orderBy(desc(seasonSignups.createdAt))
      .limit(10),
    db
      .select({
        id: seasons.id,
        name: seasons.name,
        slug: seasons.slug,
        state: seasons.state,
        game: seasons.game,
        signupClosesAt: seasons.signupClosesAt,
        signups: count(seasonSignups.id),
      })
      .from(seasons)
      .leftJoin(seasonSignups, eq(seasonSignups.seasonId, seasons.id))
      .where(notInArray(seasons.state, ["draft", "complete"]))
      .groupBy(seasons.id)
      .orderBy(desc(seasons.createdAt)),
    db
      .select({
        id: matches.id,
        state: matches.state,
        seasonName: seasons.name,
        seasonSlug: seasons.slug,
      })
      .from(matches)
      .innerJoin(seasons, eq(matches.seasonId, seasons.id))
      .where(inArray(matches.state, ["reported", "disputed"])),
    db
      .select({ seasonName: seasons.name, seasonSlug: seasons.slug })
      .from(drafts)
      .innerJoin(seasons, eq(drafts.seasonId, seasons.id))
      .where(eq(drafts.state, "paused")),
    getActiveTenMan(),
    getMatchNight(),
  ]);

  const pendingSubs = await getPendingSubsBySeason();

  // Signup windows that have closed while the season still says "open".
  const staleSignups = await db
    .select({ name: seasons.name, slug: seasons.slug })
    .from(seasons)
    .where(and(eq(seasons.state, "signups_open"), lt(seasons.signupClosesAt, now)));

  const actionItems: ActionItem[] = [...matchNight.actionItems];
  const bySeason = new Map<string, { name: string; reported: number; disputed: number }>();
  for (const m of pendingMatches) {
    const entry = bySeason.get(m.seasonSlug) ?? { name: m.seasonName, reported: 0, disputed: 0 };
    if (m.state === "reported") entry.reported++;
    else entry.disputed++;
    bySeason.set(m.seasonSlug, entry);
  }
  for (const [slug, e] of bySeason) {
    if (e.disputed) {
      actionItems.push({
        label: `${e.disputed} disputed match${e.disputed > 1 ? "es" : ""}`,
        detail: e.name,
        href: `/admin/seasons/${slug}/matches`,
      });
    }
    if (e.reported) {
      actionItems.push({
        label: `${e.reported} result${e.reported > 1 ? "s" : ""} to confirm`,
        detail: e.name,
        href: `/admin/seasons/${slug}/matches`,
      });
    }
  }
  for (const d of pausedDrafts) {
    actionItems.push({
      label: "Draft is paused",
      detail: d.seasonName,
      href: `/admin/seasons/${d.seasonSlug}/draft`,
    });
  }
  for (const s of staleSignups) {
    actionItems.push({
      label: "Signup window has closed",
      detail: `${s.name} is still "Signups open"`,
      href: `/admin/seasons/${s.slug}`,
    });
  }
  const subsBySeason = new Map<string, { name: string; count: number; matchId: string }>();
  for (const p of pendingSubs) {
    const e = subsBySeason.get(p.seasonSlug) ?? {
      name: p.seasonName,
      count: 0,
      matchId: p.matchId,
    };
    e.count++;
    subsBySeason.set(p.seasonSlug, e);
  }
  for (const [slug, e] of subsBySeason) {
    actionItems.push({
      label: `${e.count} sub request${e.count > 1 ? "s" : ""}`,
      detail: e.name,
      href: `/admin/seasons/${slug}/matches`,
    });
  }
  if (activeTenMan) {
    actionItems.push({
      label: `10-man in progress (${activeTenMan.state})`,
      detail: activeTenMan.lobbyCode ?? "",
      href: `/10-man/${activeTenMan.id}`,
    });
  }

  return {
    stats: { totalUsers, newUsers, unverified, activeBans, riotLinked },
    latestUsers,
    latestSignups,
    activeSeasons,
    actionItems,
    liveMatches: matchNight.liveMatches,
  };
}
