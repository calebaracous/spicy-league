import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createTiebreakersAction, generateMatchSchedule, seedPlayoffsAction } from "./actions";
import { confirmMatch, disputeMatch, resetMatch } from "@/app/seasons/[slug]/matches/actions";
import { decideSub } from "@/app/seasons/[slug]/matches/sub-actions";
import { isDraw } from "@/lib/match-format";
import { computeStandings } from "@/lib/schedule";
import { getPendingSubsForSeason } from "@/lib/substitutions";
import { SUB_ERROR_MESSAGES } from "@/lib/substitution-rules";
import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { seasonPageMetadata } from "@/lib/season-meta";
import { requireAdmin } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashToast } from "@/components/flash-toast";
import { cn } from "@/lib/utils";

export const generateMetadata = seasonPageMetadata("Matches · Admin");

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string | number; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "already-generated": "A schedule has already been generated for this season.",
  "playoffs-already-seeded": "Playoff bracket has already been seeded.",
  "group-unfinished":
    "Every group match needs a confirmed result before the playoffs can be seeded.",
  "no-winner": "That match has no reported result yet, so it can't be confirmed.",
  "needs-tiebreaker":
    "Teams are still level on every tiebreaker inside the top 4. Play the tiebreaker games first.",
  "tiebreaker-pending": "Confirm the current tiebreaker games before creating more.",
  "no-tiebreaker-needed": "No tie inside the top 4 needs a tiebreaker game.",
  "not-found": "Match not found.",
  ...SUB_ERROR_MESSAGES,
};

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  scheduled: { label: "Scheduled", variant: "outline" },
  reported: { label: "Reported", variant: "default" },
  confirmed: { label: "Confirmed", variant: "secondary" },
  disputed: { label: "Disputed", variant: "destructive" },
};

export const dynamic = "force-dynamic";

/** `?saved=` codes from the match actions → toast text. */
function flashMessage(saved: string): string {
  if (saved === "seeded") return "Playoff bracket seeded.";
  if (saved === "confirmed") return "Result confirmed.";
  if (saved === "disputed") return "Result marked as disputed.";
  if (saved === "reset") return "Match reset to scheduled.";
  if (saved === "sub-approved") return "Sub approved.";
  if (saved === "sub-rejected") return "Sub rejected.";
  if (saved === "sub-revoked") return "Sub revoked.";
  const tiebreakers = saved.match(/^tiebreakers-(\d+)$/);
  if (tiebreakers) {
    return `Created ${tiebreakers[1]} tiebreaker game${tiebreakers[1] === "1" ? "" : "s"}.`;
  }
  const generated = saved.match(/^generated-(\d+)$/);
  if (generated) return `Generated ${generated[1]} matches.`;
  return "Saved.";
}

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
  const createTiebreakersWithSlug = createTiebreakersAction.bind(null, slug);
  const confirmWithSlug = confirmMatch.bind(null, slug);
  const disputeWithSlug = disputeMatch.bind(null, slug);
  const resetWithSlug = resetMatch.bind(null, slug);

  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  const reportedCount = allMatches.filter((m) => m.state === "reported").length;
  const groupMatches = allMatches.filter((m) => m.stage === "group");
  const tiebreakerMatches = allMatches.filter((m) => m.stage === "tiebreaker");
  const playoffMatches = allMatches.filter((m) => m.stage === "semis" || m.stage === "final");
  const knockoutMatches = [...tiebreakerMatches, ...playoffMatches];
  // Seeding is offered from the group stage once every group match is
  // confirmed (seeding then moves the season to Playoffs), or from Playoffs
  // if an admin transitioned first.
  const unconfirmedGroup = groupMatches.filter((m) => m.state !== "confirmed").length;
  const canSeedPlayoffs =
    (season.state === "group_stage" || season.state === "playoffs") &&
    playoffMatches.length === 0 &&
    groupMatches.length > 0;
  // Ties that decide the top 4 only matter once the group stage is done.
  const tiebreakersNeeded =
    canSeedPlayoffs && unconfirmedGroup === 0
      ? (await computeStandings(season.id)).tiebreakersNeeded
      : [];
  const unconfirmedTiebreakers = tiebreakerMatches.filter((m) => m.state !== "confirmed").length;
  const pendingSubs = await getPendingSubsForSeason(season.id);
  const here = `/admin/seasons/${slug}/matches`;

  return (
    <div className="page flex-1 space-y-6 [--page-max:64rem]">
      <header className="space-y-1">
        <Link
          href={`/admin/seasons/${slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to {season.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading">Matches</h1>
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

      {saved ? <FlashToast message={flashMessage(String(saved))} /> : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {pendingSubs.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Sub requests</CardTitle>
            <CardDescription>
              Captains asked to bring these players in. Approving re-checks eligibility.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {pendingSubs.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{p.subName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      → {p.teamName}
                      {p.replacingName ? `, for ${p.replacingName}` : ", extra slot"}
                    </span>
                    <p className="text-muted-foreground text-xs">
                      <Link
                        href={`/seasons/${slug}/matches/${p.matchId}`}
                        className="hover:underline"
                      >
                        {p.matchLabel}
                      </Link>
                      {p.reason ? ` · “${p.reason}”` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <form action={decideSub.bind(null, slug, p.matchId, p.id)}>
                      <input type="hidden" name="decision" value="approve" />
                      <input type="hidden" name="back" value={here} />
                      <PendingSubmitButton size="sm">Approve</PendingSubmitButton>
                    </form>
                    <form action={decideSub.bind(null, slug, p.matchId, p.id)}>
                      <input type="hidden" name="decision" value="reject" />
                      <input type="hidden" name="back" value={here} />
                      <PendingSubmitButton size="sm" variant="ghost">
                        Reject
                      </PendingSubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {groupMatches.length === 0 && playoffMatches.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate schedule</CardTitle>
            <CardDescription>
              Creates a round-robin schedule for all teams. Each team plays every other team once
              {season.groupBestOf === 2 ? " in a best-of-2 series (2–0, 1–1 or 0–2)" : ""}. This can
              only be done once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allTeams.length < 2 ? (
              <p className="text-muted-foreground text-sm">
                Need at least 2 teams. Complete the draft first.
              </p>
            ) : (
              <form action={generateWithSlug}>
                <PendingSubmitButton>
                  Generate schedule ({allTeams.length} teams,{" "}
                  {(allTeams.length * (allTeams.length - 1)) / 2} matches)
                </PendingSubmitButton>
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
                  (Semifinals + Final) and moves the season to Playoffs. This can only be done once.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {unconfirmedGroup > 0 ? (
                  <p className="text-muted-foreground text-sm">
                    {unconfirmedGroup} group match{unconfirmedGroup !== 1 ? "es" : ""} still need
                    {unconfirmedGroup === 1 ? "s" : ""} a confirmed result before seeding.
                  </p>
                ) : tiebreakersNeeded.length > 0 ? (
                  <div className="space-y-3 text-sm">
                    <p>
                      These teams are still level after head-to-head, series wins and map
                      difference, and the tie decides the top 4. Each pair plays a Bo1 tiebreaker.
                    </p>
                    <ul className="list-disc space-y-1 pl-5">
                      {tiebreakersNeeded.map((group) => (
                        <li key={group.join()}>
                          {group.map((id) => teamName.get(id) ?? "?").join(" vs ")}
                        </li>
                      ))}
                    </ul>
                    {unconfirmedTiebreakers > 0 ? (
                      <p className="text-muted-foreground">
                        {unconfirmedTiebreakers} tiebreaker game
                        {unconfirmedTiebreakers !== 1 ? "s" : ""} still need
                        {unconfirmedTiebreakers === 1 ? "s" : ""} a confirmed result.
                      </p>
                    ) : (
                      <form action={createTiebreakersWithSlug}>
                        <ConfirmSubmitButton confirmMessage="Create a Bo1 tiebreaker game between each pair of tied teams?">
                          Create tiebreaker games
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                ) : (
                  <form action={seedPlayoffsWithSlug}>
                    <ConfirmSubmitButton confirmMessage="Seed the playoffs from the final group standings and move the season to Playoffs? This can only be done once.">
                      Seed playoffs (top 4)
                    </ConfirmSubmitButton>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : null}

          {knockoutMatches.length > 0 ? (
            <div className="space-y-4">
              <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {playoffMatches.length > 0 ? "Playoffs" : "Tiebreakers"}
              </h2>
              {[
                { label: "Tiebreakers (Bo1)", stage: "tiebreaker" },
                { label: "Semifinals", stage: "semis" },
                { label: "Final", stage: "final" },
              ].map(({ label, stage }) => {
                const stageMatches = knockoutMatches.filter((m) => m.stage === stage);
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
                                      <PendingSubmitButton size="sm" variant="default">
                                        Confirm
                                      </PendingSubmitButton>
                                    </form>
                                    <form action={disputeWithSlug.bind(null, m.id)}>
                                      <ConfirmSubmitButton
                                        confirmMessage="Mark this result as disputed?"
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                      >
                                        Dispute
                                      </ConfirmSubmitButton>
                                    </form>
                                  </>
                                ) : null}
                                {m.state === "disputed" || m.state === "confirmed" ? (
                                  <form action={resetWithSlug.bind(null, m.id)}>
                                    <ConfirmSubmitButton
                                      confirmMessage="Reset this match? Its result is cleared and it goes back to scheduled."
                                      size="sm"
                                      variant="ghost"
                                      className="text-muted-foreground"
                                    >
                                      Reset
                                    </ConfirmSubmitButton>
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
              {knockoutMatches.length > 0 ? (
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
                                    ) : isDraw(m) ? (
                                      <p className="text-muted-foreground text-xs">Draw</p>
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
                                          <PendingSubmitButton size="sm" variant="default">
                                            Confirm
                                          </PendingSubmitButton>
                                        </form>
                                        <form action={disputeWithSlug.bind(null, m.id)}>
                                          <ConfirmSubmitButton
                                            confirmMessage="Mark this result as disputed?"
                                            size="sm"
                                            variant="ghost"
                                            className="text-destructive hover:text-destructive"
                                          >
                                            Dispute
                                          </ConfirmSubmitButton>
                                        </form>
                                      </>
                                    ) : null}
                                    {m.state === "disputed" || m.state === "confirmed" ? (
                                      <form action={resetWithSlug.bind(null, m.id)}>
                                        <ConfirmSubmitButton
                                          confirmMessage="Reset this match? Its result is cleared and it goes back to scheduled."
                                          size="sm"
                                          variant="ghost"
                                          className="text-muted-foreground"
                                        >
                                          Reset
                                        </ConfirmSubmitButton>
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
    </div>
  );
}
