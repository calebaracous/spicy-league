import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { getRankEntries, getTopChampions } from "@/lib/riot-api";

async function refreshRiotLink(link: {
  id: string;
  userId: string;
  externalId: string;
}): Promise<boolean> {
  const [rankEntries, topChamps] = await Promise.all([
    getRankEntries(link.externalId),
    getTopChampions(link.externalId, 3),
  ]);

  if (!rankEntries) return false;

  // Replace all snapshots for this specific account link.
  await db.delete(riotStatSnapshots).where(eq(riotStatSnapshots.accountLinkId, link.id));

  const soloEntry = rankEntries.find((e) => e.queueType === "RANKED_SOLO_5x5");
  const flexEntry = rankEntries.find((e) => e.queueType === "RANKED_FLEX_SR");
  const entries = [soloEntry, flexEntry].filter((e) => e !== undefined);

  if (entries.length === 0) {
    await db.insert(riotStatSnapshots).values({
      userId: link.userId,
      accountLinkId: link.id,
      queue: "solo",
      tier: null,
      rankDivision: null,
      lp: null,
      wins: null,
      losses: null,
      topChamps: topChamps ?? [],
    });
  } else {
    for (const entry of entries) {
      await db.insert(riotStatSnapshots).values({
        userId: link.userId,
        accountLinkId: link.id,
        queue: entry.queueType === "RANKED_SOLO_5x5" ? "solo" : "flex",
        tier: entry.tier,
        rankDivision: entry.rank,
        lp: entry.leaguePoints,
        wins: entry.wins,
        losses: entry.losses,
        topChamps: topChamps ?? [],
      });
    }
  }

  return true;
}

export async function refreshRiotStats(userId: string): Promise<boolean> {
  const links = await db.query.accountLinks.findMany({
    where: and(eq(accountLinks.userId, userId), eq(accountLinks.provider, "riot")),
  });
  if (links.length === 0) return false;

  let anyOk = false;
  for (const link of links) {
    const ok = await refreshRiotLink(link);
    if (ok) anyOk = true;
    await new Promise((r) => setTimeout(r, 1200));
  }
  return anyOk;
}

export async function refreshAllRiotStats(): Promise<number> {
  const links = await db.query.accountLinks.findMany({
    where: eq(accountLinks.provider, "riot"),
  });

  let refreshed = 0;
  for (const link of links) {
    const ok = await refreshRiotLink(link);
    if (ok) refreshed++;
    // ~50 req/min — stay well under the 100 req/2min personal key limit
    await new Promise((r) => setTimeout(r, 1200));
  }
  return refreshed;
}
