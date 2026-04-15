import { desc, ne } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAME_LABELS, SEASON_STATE_LABELS } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function SeasonsIndexPage() {
  const publicSeasons = await db.query.seasons.findMany({
    where: ne(seasons.state, "draft"),
    orderBy: [desc(seasons.createdAt)],
  });

  const active = publicSeasons.filter((s) => s.state !== "complete");
  const past = publicSeasons.filter((s) => s.state === "complete");

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-10 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Seasons</h1>
        <p className="text-muted-foreground">
          Every Spicy League season, from signups through championship.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Active
        </h2>
        {active.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No active seasons</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Check back soon — the next season will open signups here.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map((season) => (
              <Link
                key={season.id}
                href={`/seasons/${season.slug}`}
                className="group bg-card hover:bg-muted/40 rounded-xl border p-5 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xl leading-tight font-semibold group-hover:underline">
                    {season.name}
                  </h3>
                  <Badge>{SEASON_STATE_LABELS[season.state]}</Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">{GAME_LABELS[season.game]}</p>
                {season.description ? (
                  <p className="mt-3 line-clamp-2 text-sm">{season.description}</p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Past
          </h2>
          <ul className="divide-y rounded-xl border">
            {past.map((season) => (
              <li key={season.id}>
                <Link
                  href={`/seasons/${season.slug}`}
                  className="hover:bg-muted/40 flex items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="font-medium">{season.name}</span>
                  <span className="text-muted-foreground text-xs">{GAME_LABELS[season.game]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
