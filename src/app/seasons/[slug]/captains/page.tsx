import { asc, eq, ne, and } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonCaptains } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { Badge } from "@/components/ui/badge";
import { GAME_LABELS } from "@/lib/seasons";

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
      displayName: users.displayName,
      id: users.id,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder));

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 px-6 py-12">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Captains</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {captains.length} captain{captains.length !== 1 ? "s" : ""}
        </p>
      </header>

      {captains.length === 0 ? (
        <p className="text-muted-foreground text-sm">No captains have been announced yet.</p>
      ) : (
        <ol className="space-y-3">
          {captains.map((c) => (
            <li key={c.id} className="flex items-center gap-4 rounded-xl border px-5 py-3">
              <span className="text-muted-foreground w-6 text-right font-mono text-sm">
                {c.captainOrder}.
              </span>
              <Link
                href={`/u/${c.displayName}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {c.displayName}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
