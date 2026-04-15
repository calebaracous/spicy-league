import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { seasons, type SeasonState } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GAME_LABELS, SEASON_STATE_LABELS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

function StatusPanel({ state, slug }: { state: SeasonState; slug: string }) {
  switch (state) {
    case "signups_open":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Signups are open</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Grab a spot now — captains will pick from everyone who signs up.
            </p>
            <Link href={`/seasons/${slug}/signup`} className={cn(buttonVariants({ size: "lg" }))}>
              Sign up
            </Link>
          </CardContent>
        </Card>
      );
    case "signups_closed":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Signups closed</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            The roster is locked. Captains are being selected next.
          </CardContent>
        </Card>
      );
    case "captains_selected":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Captains announced</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Draft order is being finalized. The live draft starts soon.
          </CardContent>
        </Card>
      );
    case "drafting":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Draft in progress</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Teams are being drafted live. Watch the board for your name.
          </CardContent>
        </Card>
      );
    case "group_stage":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Group stage</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Round-robin matches are being played. Standings update as results come in.
          </CardContent>
        </Card>
      );
    case "playoffs":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Playoffs</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Top 4 teams advanced. Single-elimination bracket to crown the champion.
          </CardContent>
        </Card>
      );
    case "complete":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Season complete</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Congrats to the champion. Scroll for the final standings.
          </CardContent>
        </Card>
      );
    default:
      return null;
  }
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function SeasonDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) notFound();

  const signupOpens = formatDate(season.signupOpensAt);
  const signupCloses = formatDate(season.signupClosesAt);
  const seasonStart = formatDate(season.seasonStartAt);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
      <header className="space-y-3">
        <Link href="/seasons" className="text-muted-foreground text-xs hover:underline">
          ← All seasons
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-bold tracking-tight">{season.name}</h1>
          <Badge>{SEASON_STATE_LABELS[season.state]}</Badge>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        {season.description ? (
          <p className="text-muted-foreground text-lg">{season.description}</p>
        ) : null}
      </header>

      <StatusPanel state={season.state} slug={season.slug} />

      {signupOpens || signupCloses || seasonStart ? (
        <section className="grid gap-3 sm:grid-cols-3">
          {signupOpens ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Signups open</p>
              <p className="mt-1 text-sm">{signupOpens}</p>
            </div>
          ) : null}
          {signupCloses ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Signups close</p>
              <p className="mt-1 text-sm">{signupCloses}</p>
            </div>
          ) : null}
          {seasonStart ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Season starts</p>
              <p className="mt-1 text-sm">{seasonStart}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {season.rules ? (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Rules
          </h2>
          <div className="bg-card rounded-xl border p-5 text-sm whitespace-pre-wrap">
            {season.rules}
          </div>
        </section>
      ) : null}
    </main>
  );
}
