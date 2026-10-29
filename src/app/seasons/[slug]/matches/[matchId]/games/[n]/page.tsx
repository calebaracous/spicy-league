import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { getChampionCatalog } from "@/lib/champions";
import { getMatchDaySnapshot, getMatchDayViewer, matchDayApplies } from "@/lib/match-day";
import { seasonPageMetadata } from "@/lib/season-meta";
import { DraftRoom } from "../../_components/draft-room";

export const generateMetadata = seasonPageMetadata("Draft room");
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string; matchId: string; n: string }>;

/** The match-day draft room for game `n` (docs/MATCH-DAY.md). Public; captains act. */
export default async function DraftRoomPage({ params }: { params: Params }) {
  const { slug, matchId, n } = await params;
  const gameNumber = Number(n);
  if (!Number.isInteger(gameNumber) || gameNumber < 1) notFound();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season || !matchDayApplies(season)) notFound();
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) notFound();

  const [snap, catalog] = await Promise.all([
    getMatchDayViewer(match).then((viewer) => getMatchDaySnapshot(match.id, viewer)),
    getChampionCatalog(),
  ]);
  const game = snap?.games.find((g) => g.gameNumber === gameNumber);
  if (!snap || !game?.blueTeamId) notFound();

  return (
    <div className="page flex-1 [--page-max:72rem]">
      {catalog ? (
        <DraftRoom
          initial={snap}
          catalog={{
            version: catalog.version,
            champions: catalog.champions.map(({ key, name }) => ({ key, name })),
          }}
          slug={slug}
          matchId={matchId}
          gameNumber={gameNumber}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          Couldn&apos;t load the champion list from Riot. Refresh in a moment.
        </p>
      )}
    </div>
  );
}
