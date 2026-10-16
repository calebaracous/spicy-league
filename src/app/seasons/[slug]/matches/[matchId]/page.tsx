import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { reportMatch } from "../actions";
import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";
import { FlashToast } from "@/components/flash-toast";
import { seasonPageMetadata } from "@/lib/season-meta";
import { getTeamForCaptain } from "@/lib/schedule";
import { SUB_ERROR_MESSAGES } from "@/lib/substitution-rules";
import { getMatchLineups, getSubCandidates } from "@/lib/substitutions";
import { MatchLineups } from "./_components/lineups";

export const generateMetadata = seasonPageMetadata("Match");

type Params = Promise<{ slug: string; matchId: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Match not found.",
  "already-confirmed": "This match has already been confirmed.",
  "not-on-team": "You aren't on a team in this season.",
  "not-your-match": "That match doesn't involve your team.",
  "invalid-winner": "Select a valid winner.",
  "invalid-score": "Scores must be whole numbers from 0 to 10.",
  "partial-score": "Enter both scores, or leave both blank.",
  "score-mismatch": "The winner needs the higher score.",
  ...SUB_ERROR_MESSAGES,
};

const SAVED_MESSAGES: Record<string, string> = {
  "sub-requested": "Sub requested. An admin will review it.",
  "sub-withdrawn": "Sub request withdrawn.",
  "sub-approved": "Sub approved.",
  "sub-rejected": "Sub rejected.",
  "sub-revoked": "Sub revoked.",
};

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "outline" },
  reported: { label: "Reported — awaiting confirmation", variant: "default" },
  confirmed: { label: "Confirmed", variant: "secondary" },
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

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";

  const myTeam = userId ? await getTeamForCaptain(season.id, userId) : null;
  const isOnThisMatch =
    myTeam && (myTeam.id === match.homeTeamId || myTeam.id === match.awayTeamId);
  const canReport = (isOnThisMatch || isAdmin) && match.state !== "confirmed";

  // Subs: captains manage their own team; admins either team.
  const managedTeamIds = isAdmin
    ? [match.homeTeamId, match.awayTeamId]
    : [homeTeam, awayTeam].filter((t) => t && t.captainUserId === userId).map((t) => t!.id);
  const [lineups, candidates] = await Promise.all([
    getMatchLineups(match),
    match.state === "scheduled" && managedTeamIds.length > 0
      ? getSubCandidates(match)
      : Promise.resolve([]),
  ]);

  const reportWithIds = reportMatch.bind(null, slug, matchId);
  const sb = STATE_BADGE[match.state] ?? STATE_BADGE.scheduled;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  // Reporter display name
  let reporterName: string | null = null;
  if (match.reportedBy) {
    const reporter = await db.query.users.findFirst({ where: eq(users.id, match.reportedBy) });
    // Never fall back to the email — this page is public.
    reporterName = reporter?.name ?? reporter?.username ?? null;
  }

  return (
    <div className="page flex-1 space-y-6 [--page-max:42rem]">
      <header className="space-y-2">
        <Link
          href={`/seasons/${slug}/matches`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← All matches
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">
            {homeTeam?.name ?? "?"} vs {awayTeam?.name ?? "?"}
          </h1>
          <Badge variant={sb.variant}>{sb.label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} ·{" "}
          {match.stage === "final"
            ? "Final"
            : match.stage === "semis"
              ? "Semifinal"
              : `Round ${match.round}`}
          {match.scheduledAt ? (
            <>
              {" "}
              · <LocalTime date={match.scheduledAt} preset="weekday-datetime" />
            </>
          ) : null}
          {match.confirmedAt ? (
            <>
              {" "}
              · Confirmed <LocalTime date={match.confirmedAt} preset="date-short" />
            </>
          ) : match.reportedAt ? (
            <>
              {" "}
              · Reported <LocalTime date={match.reportedAt} preset="date-short" />
            </>
          ) : null}
        </p>
      </header>

      {saved ? <FlashToast message={SAVED_MESSAGES[saved] ?? "Saved."} /> : null}
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

      {homeTeam && awayTeam ? (
        <MatchLineups
          slug={slug}
          matchId={matchId}
          matchState={match.state}
          home={{ id: homeTeam.id, name: homeTeam.name }}
          away={{ id: awayTeam.id, name: awayTeam.name }}
          lineups={lineups}
          managedTeamIds={managedTeamIds}
          isAdmin={isAdmin}
          candidates={candidates}
        />
      ) : null}

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
    </div>
  );
}
