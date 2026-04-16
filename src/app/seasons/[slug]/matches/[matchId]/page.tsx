import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { reportMatch } from "../actions";
import { db } from "@/db/client";
import { teams, teamMembers } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getTeamForCaptain } from "@/lib/schedule";

type Params = Promise<{ slug: string; matchId: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Match not found.",
  "already-confirmed": "This match has already been confirmed.",
  "not-on-team": "You aren't on a team in this season.",
  "not-your-match": "That match doesn't involve your team.",
  "invalid-winner": "Select a valid winner.",
};

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  reported: { label: "Reported — awaiting confirmation", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
};

export const dynamic = "force-dynamic";

export default async function MatchDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug, matchId } = await params;
  const { saved, error } = await searchParams;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) notFound();

  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) notFound();

  const [homeTeam, awayTeam] = await Promise.all([
    db.query.teams.findFirst({ where: eq(teams.id, match.homeTeamId) }),
    db.query.teams.findFirst({ where: eq(teams.id, match.awayTeamId) }),
  ]);

  // Load rosters
  const loadRoster = async (teamId: string) => {
    const members = await db
      .select({
        userId: teamMembers.userId,
        displayName: users.displayName,
        pickNumber: teamMembers.pickNumber,
      })
      .from(teamMembers)
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(teamMembers.pickNumber);
    return members;
  };

  const [homeRoster, awayRoster] = await Promise.all([
    loadRoster(match.homeTeamId),
    loadRoster(match.awayTeamId),
  ]);

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";

  const myTeam = userId ? await getTeamForCaptain(season.id, userId) : null;
  const isOnThisMatch =
    myTeam && (myTeam.id === match.homeTeamId || myTeam.id === match.awayTeamId);
  const canReport = (isOnThisMatch || isAdmin) && match.state !== "confirmed";

  const reportWithIds = reportMatch.bind(null, slug, matchId);
  const sb = STATE_BADGE[match.state] ?? STATE_BADGE.scheduled;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  // Reporter display name
  let reporterName: string | null = null;
  if (match.reportedBy) {
    const reporter = await db.query.users.findFirst({ where: eq(users.id, match.reportedBy) });
    reporterName = reporter?.displayName ?? reporter?.email ?? null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-2">
        <Link
          href={`/seasons/${slug}/matches`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← All matches
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {homeTeam?.name ?? "?"} vs {awayTeam?.name ?? "?"}
          </h1>
          <Badge variant={sb.variant}>{sb.label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · Round {match.round}
          {match.confirmedAt
            ? ` · Confirmed ${match.confirmedAt.toLocaleDateString()}`
            : match.reportedAt
              ? ` · Reported ${match.reportedAt.toLocaleDateString()}`
              : ""}
        </p>
      </header>

      {saved ? (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Result card */}
      {match.state !== "scheduled" && match.winnerTeamId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              Winner:{" "}
              <span className="font-medium">
                {match.winnerTeamId === match.homeTeamId ? homeTeam?.name : awayTeam?.name}
              </span>
            </p>
            {match.homeScore !== null && match.awayScore !== null ? (
              <p className="text-muted-foreground">
                Score: {homeTeam?.name} {match.homeScore} – {match.awayScore} {awayTeam?.name}
              </p>
            ) : null}
            {reporterName ? (
              <p className="text-muted-foreground text-xs">Reported by {reporterName}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Rosters */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { team: homeTeam, roster: homeRoster, label: "Home" },
          { team: awayTeam, roster: awayRoster, label: "Away" },
        ].map(({ team, roster, label }) => (
          <Card key={team?.id}>
            <CardHeader>
              <CardTitle className="text-sm">
                {team?.name ?? "?"}{" "}
                <span className="text-muted-foreground text-xs font-normal">({label})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {roster.map((m) => (
                  <li key={m.userId} className="flex items-center gap-2">
                    {m.pickNumber === null ? (
                      <Badge variant="secondary" className="text-xs">
                        C
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground w-5 text-right font-mono text-xs">
                        #{m.pickNumber}
                      </span>
                    )}
                    <Link
                      href={`/u/${m.displayName}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {m.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Report form */}
      {canReport ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {match.state === "reported" ? "Update result" : "Report result"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={reportWithIds} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="winnerTeamId">Winner</Label>
                <select
                  id="winnerTeamId"
                  name="winnerTeamId"
                  required
                  defaultValue={match.winnerTeamId ?? ""}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  <option value="">Select winner…</option>
                  <option value={match.homeTeamId}>{homeTeam?.name} (Home)</option>
                  <option value={match.awayTeamId}>{awayTeam?.name} (Away)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="homeScore">{homeTeam?.name} score</Label>
                  <input
                    id="homeScore"
                    name="homeScore"
                    type="number"
                    min="0"
                    max="10"
                    defaultValue={match.homeScore ?? ""}
                    placeholder="0"
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="awayScore">{awayTeam?.name} score</Label>
                  <input
                    id="awayScore"
                    name="awayScore"
                    type="number"
                    min="0"
                    max="10"
                    defaultValue={match.awayScore ?? ""}
                    placeholder="0"
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                  />
                </div>
              </div>
              <Button type="submit">Submit result</Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
