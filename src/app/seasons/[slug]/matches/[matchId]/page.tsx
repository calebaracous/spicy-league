import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { adminEditResult, reportMatch } from "../actions";
import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";
import { FlashToast } from "@/components/flash-toast";
import {
  BO2_RESULTS,
  bestOfLabel,
  FEARLESS_DRAFT_RULE,
  fearlessApplies,
  isDraw,
  roundLabel,
  type Bo2Result,
} from "@/lib/match-format";
import { seasonPageMetadata } from "@/lib/season-meta";
import { getCaptainedTeamId, getTeamForCaptain } from "@/lib/schedule";
import { SUB_ERROR_MESSAGES } from "@/lib/substitution-rules";
import { getMatchLineups, getSubCandidates } from "@/lib/substitutions";
import { getChampionCatalog } from "@/lib/champions";
import { getMatchDaySnapshot, inMatchLineup, matchDayApplies } from "@/lib/match-day";
import { MatchLineups } from "./_components/lineups";
import { MatchDayCard } from "./_components/match-day";

export const generateMetadata = seasonPageMetadata("Match");

type Params = Promise<{ slug: string; matchId: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Match not found.",
  "already-confirmed": "This match has already been confirmed.",
  "not-on-team": "You aren't on a team in this season.",
  "not-your-match": "That match doesn't involve your team.",
  "invalid-winner": "Select a valid winner.",
  "invalid-result": "Pick the series result: 2–0, 1–1 or 0–2.",
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
  "sub-pinged": "Pinged the Sub list in the match's Discord thread.",
  "result-edited": "Result saved and confirmed.",
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

  const [myTeam, captainedTeamId] = userId
    ? await Promise.all([
        getTeamForCaptain(season.id, userId),
        getCaptainedTeamId(season.id, userId),
      ])
    : [null, null];
  const isOnThisMatch =
    myTeam && (myTeam.id === match.homeTeamId || myTeam.id === match.awayTeamId);
  // Captains report until it's confirmed; admins get Edit result at any time.
  const canReport = (isOnThisMatch && match.state !== "confirmed") || isAdmin;

  // Subs: captains (either of a duo) manage their own team; admins either team.
  const managedTeamIds = isAdmin
    ? [match.homeTeamId, match.awayTeamId]
    : [match.homeTeamId, match.awayTeamId].filter((id) => id === captainedTeamId);
  const [lineups, candidates] = await Promise.all([
    getMatchLineups(match),
    match.state === "scheduled" && managedTeamIds.length > 0
      ? getSubCandidates(match)
      : Promise.resolve([]),
  ]);

  // Side selection (LoL): live while scheduled; afterwards only if it was played.
  const matchDay = matchDayApplies(season)
    ? await getMatchDaySnapshot(match.id, {
        userId,
        teamId:
          captainedTeamId === match.homeTeamId || captainedTeamId === match.awayTeamId
            ? captainedTeamId
            : null,
        isAdmin,
        inLineup: inMatchLineup(lineups, userId),
      })
    : null;
  const showMatchDay = matchDay && (matchDay.open || matchDay.games.length > 0);
  // Draft recaps need champion names; only fetched once a game has a draft.
  const catalog = matchDay?.games.some((g) => g.draft.actions.length > 0)
    ? await getChampionCatalog()
    : null;
  const champions = catalog
    ? {
        version: catalog.version,
        names: Object.fromEntries(catalog.champions.map((c) => [c.key, c.name])),
      }
    : null;
  // Who played (approved subs in, sat-out players out), for assigning picks.
  const playing = (players: typeof lineups.home) =>
    players
      .filter((p) => !p.satOut)
      .map((p) => ({ userId: p.userId, name: p.name ?? p.username ?? "?" }));

  const reportWithIds = isAdmin
    ? adminEditResult.bind(null, slug, matchId)
    : reportMatch.bind(null, slug, matchId);
  // Before anything's reported, pre-fill from match-day game results.
  const series = matchDay?.series.played ? matchDay.series : null;
  const reported = match.state !== "scheduled";
  const defaultHome = reported ? match.homeScore : (series?.homeWins ?? null);
  const defaultAway = reported ? match.awayScore : (series?.awayWins ?? null);
  const defaultWinner = reported ? match.winnerTeamId : (series?.winnerTeamId ?? null);
  const gameRows = isAdmin ? (matchDay?.games.filter((g) => g.blueTeamId) ?? []) : [];
  // Bo2 group series: report one of 2–0 / 1–1 / 0–2 (a 1–1 is a draw).
  const bo2 = match.stage === "group" && season.groupBestOf === 2;
  const draw = isDraw(match);
  const bo2Current = (Object.keys(BO2_RESULTS) as Bo2Result[]).find(
    (k) => BO2_RESULTS[k].homeScore === defaultHome && BO2_RESULTS[k].awayScore === defaultAway,
  );
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
          {season.name} · {roundLabel(match.stage, match.round)}
          {bo2
            ? " · Best of 2"
            : match.stage === "tiebreaker"
              ? " · Best of 1"
              : match.stage === "semis"
                ? ` · ${bestOfLabel(season.playoffBestOf)}`
                : match.stage === "final"
                  ? ` · ${bestOfLabel(season.finalBestOf)}`
                  : ""}
          {fearlessApplies(season, match.stage) ? (
            <span title={`Fearless draft: ${FEARLESS_DRAFT_RULE}`}> · Fearless draft</span>
          ) : null}
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
      {match.state !== "scheduled" && (match.winnerTeamId || draw) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Result</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {draw ? (
              <p className="font-medium">Draw</p>
            ) : (
              <p>
                Winner:{" "}
                <span className="font-medium">
                  {match.winnerTeamId === match.homeTeamId ? homeTeam?.name : awayTeam?.name}
                </span>
              </p>
            )}
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

      {showMatchDay ? (
        <MatchDayCard
          initial={matchDay}
          slug={slug}
          matchId={matchId}
          champions={champions}
          lineups={{
            [match.homeTeamId]: playing(lineups.home),
            [match.awayTeamId]: playing(lineups.away),
          }}
        />
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
              {isAdmin
                ? "Edit result"
                : match.state === "reported"
                  ? "Update result"
                  : "Report result"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isAdmin ? (
              <p className="text-muted-foreground text-xs">
                Admin: saves and confirms straight away, whatever state the match is in. Standings,
                the bracket and the champion follow.
              </p>
            ) : null}
            {bo2 ? (
              <form action={reportWithIds} className="space-y-4">
                {gameRows.length > 0 ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-1.5 text-sm font-medium">Game winners</legend>
                    {gameRows.map((g) => (
                      <div key={g.gameNumber} className="flex items-center gap-3">
                        <Label htmlFor={`game-${g.gameNumber}`} className="w-16 shrink-0">
                          Game {g.gameNumber}
                          {g.resultFlagged ? " ⚑" : ""}
                        </Label>
                        <select
                          id={`game-${g.gameNumber}`}
                          name={`game-${g.gameNumber}`}
                          defaultValue={g.winnerTeamId ?? ""}
                          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                        >
                          <option value="">No result</option>
                          <option value={match.homeTeamId}>{homeTeam?.name}</option>
                          <option value={match.awayTeamId}>{awayTeam?.name}</option>
                        </select>
                      </div>
                    ))}
                  </fieldset>
                ) : null}
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-sm font-medium">Series result (maps won)</legend>
                  {(
                    [
                      ["home-2-0", `${homeTeam?.name} 2–0`],
                      ["draw-1-1", "1–1 draw"],
                      ["away-0-2", `${awayTeam?.name} 2–0`],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="result"
                        value={value}
                        required
                        defaultChecked={bo2Current === value}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
                <p className="text-muted-foreground text-xs">
                  Both maps are always played. A 1–1 is a draw: one map win each.
                </p>
                <PendingSubmitButton>
                  {isAdmin ? "Save and confirm" : "Submit result"}
                </PendingSubmitButton>
              </form>
            ) : (
              <form action={reportWithIds} className="space-y-4">
                {gameRows.length > 0 ? (
                  <fieldset className="space-y-2">
                    <legend className="mb-1.5 text-sm font-medium">Game winners</legend>
                    {gameRows.map((g) => (
                      <div key={g.gameNumber} className="flex items-center gap-3">
                        <Label htmlFor={`game-${g.gameNumber}`} className="w-16 shrink-0">
                          Game {g.gameNumber}
                          {g.resultFlagged ? " ⚑" : ""}
                        </Label>
                        <select
                          id={`game-${g.gameNumber}`}
                          name={`game-${g.gameNumber}`}
                          defaultValue={g.winnerTeamId ?? ""}
                          className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                        >
                          <option value="">No result</option>
                          <option value={match.homeTeamId}>{homeTeam?.name}</option>
                          <option value={match.awayTeamId}>{awayTeam?.name}</option>
                        </select>
                      </div>
                    ))}
                  </fieldset>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="winnerTeamId">Winner</Label>
                  <select
                    id="winnerTeamId"
                    name="winnerTeamId"
                    required
                    defaultValue={defaultWinner ?? ""}
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
                      defaultValue={defaultHome ?? ""}
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
                      defaultValue={defaultAway ?? ""}
                      placeholder="0"
                      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                    />
                  </div>
                </div>
                <PendingSubmitButton>
                  {isAdmin ? "Save and confirm" : "Submit result"}
                </PendingSubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
