import "server-only";

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db/client";
import {
  seasonCaptains,
  seasonSignups,
  seasons,
  teams,
  matches,
  riotStatSnapshots,
  users,
} from "@/db/schema";
import type { Season } from "@/db/schema/seasons";

// ─── Public types ─────────────────────────────────────────────────────────────

export type PlayerInfo = {
  username: string;
  rank: string | null;
};

export type CaptainInfo = {
  username: string;
};

export type NextMatchInfo = {
  homeTeamName: string;
  awayTeamName: string;
  round: number;
  stage: "group" | "semis" | "final";
  scheduledAt: Date | null;
};

export type PodiumEntry = {
  rank: 1 | 2 | 3 | 4;
  teamName: string;
  label: string;
};

export type PastSeasonCard = {
  id: string;
  slug: string;
  name: string;
  game: "lol" | "cs2";
  championName: string | null;
};

export type HomepageData =
  | {
      state: "signup_lol";
      season: Season;
      signupCount: number;
      topPlayers: PlayerInfo[];
      pastSeasons: PastSeasonCard[];
    }
  | {
      state: "signup_cs2";
      season: Season;
      signupCount: number;
      highlightedPlayers: PlayerInfo[];
      pastSeasons: PastSeasonCard[];
    }
  | {
      state: "draft";
      season: Season;
      captains: CaptainInfo[];
      topNonCaptains: PlayerInfo[];
      pastSeasons: PastSeasonCard[];
    }
  | {
      state: "live";
      season: Season;
      nextMatch: NextMatchInfo | null;
      topPlayers: PlayerInfo[];
      pastSeasons: PastSeasonCard[];
    }
  | {
      state: "upcoming";
      season: Season;
      pastSeasons: PastSeasonCard[];
    }
  | {
      state: "off_season";
      lastSeason: Season | null;
      podium: PodiumEntry[];
      pastSeasons: PastSeasonCard[];
    };

// ─── Rank helpers ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function formatRank(
  tier: string | null,
  division: string | null,
  lp: number | null,
): string {
  if (!tier) return "Unranked";
  const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  if (apex.includes(tier)) return `${capitalize(tier)} · ${lp ?? 0} LP`;
  return `${capitalize(tier)} ${division ?? ""} · ${lp ?? 0} LP`;
}

const TIER_WEIGHT: Record<string, number> = {
  CHALLENGER: 0,
  GRANDMASTER: 1,
  MASTER: 2,
  DIAMOND: 3,
  EMERALD: 4,
  PLATINUM: 5,
  GOLD: 6,
  SILVER: 7,
  BRONZE: 8,
  IRON: 9,
};

const DIVISION_WEIGHT: Record<string, number> = { I: 0, II: 1, III: 2, IV: 3 };

function rankScore(tier: string | null, division: string | null, lp: number | null): number {
  if (!tier) return 999_999;
  const w = (TIER_WEIGHT[tier] ?? 10) * 10_000;
  const d = (DIVISION_WEIGHT[division ?? ""] ?? 0) * 1_000;
  return w + d - (lp ?? 0);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function getPastSeasons(): Promise<PastSeasonCard[]> {
  const champTeam = alias(teams, "champ_team");
  const rows = await db
    .select({
      id: seasons.id,
      slug: seasons.slug,
      name: seasons.name,
      game: seasons.game,
      championName: champTeam.name,
    })
    .from(seasons)
    .leftJoin(champTeam, eq(champTeam.id, seasons.championTeamId))
    .where(eq(seasons.state, "complete"))
    .orderBy(desc(seasons.createdAt))
    .limit(3);
  return rows as PastSeasonCard[];
}

async function getSignupCount(seasonId: string): Promise<number> {
  const rows = await db
    .select({ userId: seasonSignups.userId })
    .from(seasonSignups)
    .where(eq(seasonSignups.seasonId, seasonId));
  return rows.length;
}

async function getTopRankedPlayers(
  seasonId: string,
  excludeUserIds: string[],
  limit: number,
): Promise<PlayerInfo[]> {
  const signupRows = await db
    .select({ userId: seasonSignups.userId })
    .from(seasonSignups)
    .where(eq(seasonSignups.seasonId, seasonId));

  const allUserIds = signupRows.map((r) => r.userId);
  const eligibleIds = excludeUserIds.length
    ? allUserIds.filter((id) => !excludeUserIds.includes(id))
    : allUserIds;

  if (eligibleIds.length === 0) return [];

  const snapshots = await db
    .select({
      userId: riotStatSnapshots.userId,
      username: users.username,
      tier: riotStatSnapshots.tier,
      rankDivision: riotStatSnapshots.rankDivision,
      lp: riotStatSnapshots.lp,
      capturedAt: riotStatSnapshots.capturedAt,
    })
    .from(riotStatSnapshots)
    .innerJoin(users, eq(users.id, riotStatSnapshots.userId))
    .where(and(inArray(riotStatSnapshots.userId, eligibleIds), eq(riotStatSnapshots.queue, "solo")))
    .orderBy(desc(riotStatSnapshots.capturedAt));

  // Keep only the most recent snapshot per user
  const seen = new Set<string>();
  const deduped = snapshots.filter((s) => {
    if (seen.has(s.userId)) return false;
    seen.add(s.userId);
    return true;
  });

  deduped.sort(
    (a, b) => rankScore(a.tier, a.rankDivision, a.lp) - rankScore(b.tier, b.rankDivision, b.lp),
  );

  return deduped.slice(0, limit).map((s) => ({
    username: s.username ?? s.userId,
    rank: formatRank(s.tier, s.rankDivision, s.lp),
  }));
}

type CaptainFull = { userId: string; username: string };

async function getCaptains(seasonId: string): Promise<CaptainFull[]> {
  const rows = await db
    .select({
      userId: seasonCaptains.userId,
      username: users.username,
      captainOrder: seasonCaptains.captainOrder,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(users.id, seasonCaptains.userId))
    .where(eq(seasonCaptains.seasonId, seasonId))
    .orderBy(asc(seasonCaptains.captainOrder));
  return rows.map((r) => ({ userId: r.userId, username: r.username ?? "unknown" }));
}

async function getRandomSignups(seasonId: string, count: number): Promise<PlayerInfo[]> {
  const signupRows = await db
    .select({ userId: seasonSignups.userId })
    .from(seasonSignups)
    .where(eq(seasonSignups.seasonId, seasonId));

  if (signupRows.length === 0) return [];

  // Fisher-Yates shuffle
  const shuffled = [...signupRows];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }

  const selectedIds = shuffled.slice(0, count).map((r) => r.userId);
  const userRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, selectedIds));

  return userRows.map((u) => ({ username: u.username ?? u.id, rank: null }));
}

async function getNextMatch(seasonId: string): Promise<NextMatchInfo | null> {
  const homeAlias = alias(teams, "home");
  const awayAlias = alias(teams, "away");

  const rows = await db
    .select({
      homeTeamName: homeAlias.name,
      awayTeamName: awayAlias.name,
      round: matches.round,
      stage: matches.stage,
      scheduledAt: matches.scheduledAt,
    })
    .from(matches)
    .innerJoin(homeAlias, eq(homeAlias.id, matches.homeTeamId))
    .innerJoin(awayAlias, eq(awayAlias.id, matches.awayTeamId))
    .where(and(eq(matches.seasonId, seasonId), eq(matches.state, "scheduled")))
    .orderBy(asc(matches.scheduledAt))
    .limit(1);

  return (rows[0] as NextMatchInfo) ?? null;
}

async function getOffSeasonPodium(lastSeason: Season): Promise<PodiumEntry[]> {
  if (!lastSeason.championTeamId) return [];

  const championRow = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, lastSeason.championTeamId))
    .limit(1);
  const championName = championRow[0]?.name ?? "Unknown";

  const homeAlias = alias(teams, "home");
  const awayAlias = alias(teams, "away");

  const finalRows = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      winnerTeamId: matches.winnerTeamId,
      homeTeamName: homeAlias.name,
      awayTeamName: awayAlias.name,
    })
    .from(matches)
    .innerJoin(homeAlias, eq(homeAlias.id, matches.homeTeamId))
    .innerJoin(awayAlias, eq(awayAlias.id, matches.awayTeamId))
    .where(
      and(
        eq(matches.seasonId, lastSeason.id),
        eq(matches.stage, "final"),
        eq(matches.state, "confirmed"),
      ),
    )
    .limit(1);

  const finalMatch = finalRows[0];
  if (!finalMatch) {
    return [{ rank: 1, teamName: championName, label: "Champion" }];
  }

  const runnerUpName =
    finalMatch.winnerTeamId === finalMatch.homeTeamId
      ? finalMatch.awayTeamName
      : finalMatch.homeTeamName;

  const semiRows = await db
    .select({
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      winnerTeamId: matches.winnerTeamId,
      homeTeamName: homeAlias.name,
      awayTeamName: awayAlias.name,
    })
    .from(matches)
    .innerJoin(homeAlias, eq(homeAlias.id, matches.homeTeamId))
    .innerJoin(awayAlias, eq(awayAlias.id, matches.awayTeamId))
    .where(
      and(
        eq(matches.seasonId, lastSeason.id),
        eq(matches.stage, "semis"),
        eq(matches.state, "confirmed"),
      ),
    );

  const thirdFourth = semiRows.map((m) =>
    m.winnerTeamId === m.homeTeamId ? m.awayTeamName : m.homeTeamName,
  );

  const podium: PodiumEntry[] = [
    { rank: 1, teamName: championName, label: "Champion" },
    { rank: 2, teamName: runnerUpName, label: "Runner-up" },
  ];
  if (thirdFourth[0]) podium.push({ rank: 3, teamName: thirdFourth[0], label: "Semifinalist" });
  if (thirdFourth[1]) podium.push({ rank: 4, teamName: thirdFourth[1], label: "Semifinalist" });

  return podium;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getHomepageData(): Promise<HomepageData> {
  const [activeRows, pastSeasons] = await Promise.all([
    db.query.seasons.findMany({
      where: inArray(seasons.state, [
        "signups_open",
        "signups_closed",
        "captains_selected",
        "drafting",
        "group_stage",
        "playoffs",
      ]),
      orderBy: [desc(seasons.createdAt)],
      limit: 1,
    }),
    getPastSeasons(),
  ]);

  const active = activeRows[0] ?? null;

  if (!active) {
    const lastRows = await db.query.seasons.findMany({
      where: eq(seasons.state, "complete"),
      orderBy: [desc(seasons.createdAt)],
      limit: 1,
    });
    const lastSeason = lastRows[0] ?? null;
    const podium = lastSeason ? await getOffSeasonPodium(lastSeason) : [];
    return { state: "off_season", lastSeason, podium, pastSeasons };
  }

  const now = new Date();

  // Upcoming: signups announced but not yet open
  if (active.state === "signups_open" && active.signupOpensAt && active.signupOpensAt > now) {
    return { state: "upcoming", season: active, pastSeasons };
  }

  // Signup phase
  if (active.state === "signups_open") {
    const signupCount = await getSignupCount(active.id);
    if (active.game === "lol") {
      const topPlayers = await getTopRankedPlayers(active.id, [], 8);
      return { state: "signup_lol", season: active, signupCount, topPlayers, pastSeasons };
    }
    const highlightedPlayers = await getRandomSignups(active.id, 3);
    return { state: "signup_cs2", season: active, signupCount, highlightedPlayers, pastSeasons };
  }

  // Draft phase
  if (
    active.state === "signups_closed" ||
    active.state === "captains_selected" ||
    active.state === "drafting"
  ) {
    const captainsFull = await getCaptains(active.id);
    const captainUserIds = captainsFull.map((c) => c.userId);
    const topNonCaptains =
      active.game === "lol" ? await getTopRankedPlayers(active.id, captainUserIds, 8) : [];
    return {
      state: "draft",
      season: active,
      captains: captainsFull.map((c) => ({ username: c.username })),
      topNonCaptains,
      pastSeasons,
    };
  }

  // Live phase (group_stage | playoffs)
  const [nextMatch, topPlayers] = await Promise.all([
    getNextMatch(active.id),
    active.game === "lol" ? getTopRankedPlayers(active.id, [], 3) : Promise.resolve([]),
  ]);
  return { state: "live", season: active, nextMatch, topPlayers, pastSeasons };
}
