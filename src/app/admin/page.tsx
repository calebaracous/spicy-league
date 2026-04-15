import { desc } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAME_LABELS, SEASON_STATE_LABELS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const allSeasons = await db.query.seasons.findMany({
    orderBy: [desc(seasons.createdAt)],
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-muted-foreground text-sm">
            Manage seasons, signups, and the tournament lifecycle.
          </p>
        </div>
        <Link href="/admin/seasons/new" className={cn(buttonVariants({ size: "lg" }))}>
          New season
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Seasons
        </h2>
        {allSeasons.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No seasons yet</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Create your first season to begin the lifecycle.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {allSeasons.map((season) => (
              <Link
                key={season.id}
                href={`/admin/seasons/${season.slug}`}
                className="group bg-card hover:bg-muted/40 rounded-xl border px-5 py-4 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg leading-tight font-semibold group-hover:underline">
                        {season.name}
                      </h3>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {season.slug}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {GAME_LABELS[season.game]} · created {season.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={season.state === "draft" ? "secondary" : "default"}>
                    {SEASON_STATE_LABELS[season.state]}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
