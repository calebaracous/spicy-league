import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { generateMatchSchedule, seedPlayoffsAction } from "./actions";
import { confirmMatch, disputeMatch, resetMatch } from "@/app/seasons/[slug]/matches/actions";
import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string | number; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "already-generated": "A schedule has already been generated for this season.",
  "playoffs-already-seeded": "Playoff bracket has already been seeded.",
};

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  reported: { label: "Reported", variant: "outline" },
  confirmed: { label: "Confirmed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
};

export const dynamic = "force-dynamic";

export default async function AdminMatchesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { saved, error } = await searchParams;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) notFound();

  const allMatches = await db
    .select({
      id: matches.id,
      round: matches.round,
      stage: matches.stage,
      state: matches.state,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      winnerTeamId: matches.winnerTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
    })
    .from(matches)
    .where(eq(matches.seasonId, season.id))
    .orderBy(asc(matches.round));

  const allTeams = await db.select().from(teams).where(eq(teams.seasonId, season.id));
  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));

  const generateWithSlug = generateMatchSchedule.bind(null, slug);
  const seedPlayoffsWithSlug = seedPlayoffsAction.bind(null, slug);
  const confirmWithSlug = confirmMatch.bind(null, slug);
  const disputeWithSlug = disputeMatch.bind(null, slug);
  const resetWithSlug = resetMatch.bind(null, slug);

  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  const reportedCount = allMatches.filter((m) => m.state === "reported").length;
  const groupMatches = allMatches.filter((m) => m.stage === "group");
  const playoffMatches = allMatches.filter((m) => m.stage !== "group");
  const canSeedPlayoffs =
    season.state === "playoffs" && playoffMatches.length === 0 && groupMatches.length > 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-1">
        <Link
          href={`/admin/seasons/${slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to {season.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
          <Link
            href={`/seasons/${slug}/matches`}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Public view
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {allMatches.length} match{allMatches.length !== 1 ? "es" : ""}
          {reportedCount > 0 ? ` · ${reportedCount} awaiting confirmation` : ""}
        </p>
      </header>

      {saved ? (
        <Alert>
          <AlertDescription>
            {saved === "seeded"
              ? "Playoff bracket seeded."
              : typeof saved === "string" && /^\d+$/.test(saved)
                ? `Generated ${saved} matches.`
                : "Saved."}
          </AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {groupMatches.length === 0 && playoffMatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate schedule</CardTitle>
            <CardDescription>
              Creates a round-robin schedule for all teams. Each team plays every other team once.
              This can only be done once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allTeams.length < 2 ? (
              <p className="text-muted-foreground text-sm">
                Need at least 2 teams. Complete the draft first.
              </p>
            ) : (
              <form action={generateWithSlug}>
                <Button type="submit">
                  Generate schedule ({allTeams.length} teams,{" "}
                  {(allTeams.length * (allTeams.length - 1)) / 2} matches)
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {canSeedPlayoffs ? (
            <Card>
              <CardHeader>
                <CardTitle>Seed playoff bracket</CardTitle>
                <CardDescription>
                  Seeds top 4 teams from group standings into a single-elimination bracket
                  (Semifinals + Final). This can only be done once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form action={seedPlayoffsWithSlug}>
                  <Button type="submit">Seed playoffs (top 4)</Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          {playoffMatches.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Playoffs
              </h2>
              {[
                { label: "Semifinals", stage: "semis" },
                { label: "Final", stage: "final" },
              ].map(({ label, stage }) => {
                const stageMatches = playoffMatches.filter((m) => m.stage === stage);
                if (stageMatches.length === 0) return null;
                return (
                  <Card key={stage}>
                    <CardHeader>
                      <CardTitle className="text-sm">{label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {stageMatches.map((m) => {
                          const sb = STATE_BADGE[m.state] ?? STATE_BADGE.scheduled;
                          const homeName = teamName.get(m.homeTeamId) ?? "?";
                          const awayName = teamName.get(m.awayTeamId) ?? "?";
                          const winnerName = m.winnerTeamId ? teamName.get(m.winnerTeamId) : null;
                          return (
                            <div
                              key={m.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2"
                            >
                              <div className="space-y-0.5">
                                <p className="text-sm">
                                  <span
                                    className={m.winnerTeamId === m.homeTeamId ? "font-bold" : ""}
                                  >
                                    {homeName}
                                  </span>
                                  <span className="text-muted-foreground mx-2">vs</span>
                                  <span
                                    className={m.winnerTeamId === m.awayTeamId ? "font-bold" : ""}
                                  >
                                    {awayName}
                                  </span>
                                  {m.homeScore !== null && m.awayScore !== null ? (
                                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                                      {m.homeScore}–{m.awayScore}
                                    </span>
                                  ) : null}
                                </p>
                                {winnerName ? (
                                  <p className="text-muted-foreground text-xs">
                                    Winner: {winnerName}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={sb.variant}>{sb.label}</Badge>
                                <Link
                                  href={`/seasons/${slug}/matches/${m.id}`}
                                  className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                                >
                                  View
                                </Link>
                                {m.state === "reported" ? (
                                  <>
                                    <form action={confirmWithSlug.bind(null, m.id)}>
                                      <Button type="submit" size="sm" variant="default">
                                        Confirm
                                      </Button>
                                    </form>
                                    <form action={disputeWithSlug.bind(null, m.id)}>
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        Dispute
                                      </Button>
                                    </form>
                                  </>
                                ) : null}
                                {m.state === "disputed" || m.state === "confirmed" ? (
                                  <form action={resetWithSlug.bind(null, m.id)}>
                                    <Button
                                      type="submit"
                                      size="sm"
                                      variant="ghost"
                                      className="text-muted-foreground"
                                    >
                                      Reset
                                    </Button>
                                  </form>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : null}

          {groupMatches.length > 0 ? (
            <div className="space-y-4">
              {playoffMatches.length > 0 ? (
                <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Group stage
                </h2>
              ) : null}
              <div className="space-y-4">
                {[...new Set(groupMatches.map((m) => m.round))]
                  .sort((a, b) => a - b)
                  .map((round) => {
                    const roundMatches = groupMatches.filter((m) => m.round === round);
                    return (
                      <Card key={round}>
                        <CardHeader>
                          <CardTitle className="text-sm">Round {round}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {roundMatches.map((m) => {
                              const sb = STATE_BADGE[m.state] ?? STATE_BADGE.scheduled;
                              const homeName = teamName.get(m.homeTeamId) ?? "?";
                              const awayName = teamName.get(m.awayTeamId) ?? "?";
                              const winnerName = m.winnerTeamId
                                ? teamName.get(m.winnerTeamId)
                                : null;
                              return (
                                <div
                                  key={m.id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2"
                                >
                                  <div className="space-y-0.5">
                                    <p className="text-sm">
                                      <span
                                        className={
                                          m.winnerTeamId === m.homeTeamId ? "font-bold" : ""
                                        }
                                      >
                                        {homeName}
                                      </span>
                                      <span className="text-muted-foreground mx-2">vs</span>
                                      <span
                                        className={
                                          m.winnerTeamId === m.awayTeamId ? "font-bold" : ""
                                        }
                                      >
                                        {awayName}
                                      </span>
                                      {m.homeScore !== null && m.awayScore !== null ? (
                                        <span className="text-muted-foreground ml-2 font-mono text-xs">
                                          {m.homeScore}–{m.awayScore}
                                        </span>
                                      ) : null}
                                    </p>
                                    {winnerName ? (
                                      <p className="text-muted-foreground text-xs">
                                        Winner: {winnerName}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={sb.variant}>{sb.label}</Badge>
                                    <Link
                                      href={`/seasons/${slug}/matches/${m.id}`}
                                      className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
                                    >
                                      View
                                    </Link>
                                    {m.state === "reported" ? (
                                      <>
                                        <form action={confirmWithSlug.bind(null, m.id)}>
                                          <Button type="submit" size="sm" variant="default">
                                            Confirm
                                          </Button>
                                        </form>
                                        <form action={disputeWithSlug.bind(null, m.id)}>
                                          <Button
                                            type="submit"
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            Dispute
                                          </Button>
                                        </form>
                                      </>
                                    ) : null}
                                    {m.state === "disputed" || m.state === "confirmed" ? (
                                      <form action={resetWithSlug.bind(null, m.id)}>
                                        <Button
                                          type="submit"
                                          size="sm"
                                          variant="ghost"
                                          className="text-muted-foreground"
                                        >
                                          Reset
                                        </Button>
                                      </form>
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </main>
  );
}
