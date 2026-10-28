import { asc, eq, ne, and } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonCaptains } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { Badge } from "@/components/ui/badge";
import { SeasonNav } from "@/components/season-nav";
import { PlayerLink } from "@/components/player-link";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS } from "@/lib/seasons";

export const generateMetadata = seasonPageMetadata("Captains");

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

const CAPTAIN_STATES = [
  "captains_selected",
  "drafting",
  "group_stage",
  "playoffs",
  "complete",
] as const;

export default async function CaptainsPage({ params }: { params: Params }) {
  const { slug } = await params;

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) notFound();

  const isCaptainsVisible = (CAPTAIN_STATES as readonly string[]).includes(season.state);
  if (!isCaptainsVisible) notFound();

  const captains = await db
    .select({
      captainOrder: seasonCaptains.captainOrder,
      username: users.username,
      name: users.name,
      id: users.id,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder), asc(seasonCaptains.createdAt));

  // Captains sharing a captainOrder are duo captains of one team.
  const captainTeams = [...new Set(captains.map((c) => c.captainOrder))].map((order) => ({
    order,
    captains: captains.filter((c) => c.captainOrder === order),
  }));

  return (
    <div className="page flex-1 space-y-8 [--page-max:42rem]">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">Captains</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {captains.length} captain{captains.length !== 1 ? "s" : ""}
        </p>
      </header>

      <SeasonNav slug={slug} state={season.state} current="captains" />

      {captains.length === 0 ? (
        <p className="text-muted-foreground text-sm">No captains have been announced yet.</p>
      ) : (
        <ol className="space-y-3">
          {captainTeams.map((team) => (
            <li key={team.order} className="flex items-center gap-4 rounded-xl border px-5 py-3">
              <span className="text-muted-foreground w-6 text-right font-mono text-sm">
                {team.order}.
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5">
                {team.captains.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 ? <span className="text-muted-foreground">&amp; </span> : null}
                    <PlayerLink
                      username={c.username}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {c.name ?? c.username}
                    </PlayerLink>
                  </span>
                ))}
              </span>
              {team.captains.length > 1 ? (
                <Badge variant="outline" className="ml-auto">
                  Duo
                </Badge>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
