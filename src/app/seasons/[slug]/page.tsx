import { and, asc, eq, ne, or } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons, seasonSignups, type SeasonState } from "@/db/schema/seasons";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LocalTime } from "@/components/ui/local-time";
import { SeasonNav } from "@/components/season-nav";
import { FlashToast } from "@/components/flash-toast";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { leaveSubList } from "./signup/actions";
import { seasonPageMetadata } from "@/lib/season-meta";
import { getTeamForCaptain } from "@/lib/schedule";
import { GAME_LABELS, openSignupKind, SEASON_STATE_LABELS } from "@/lib/seasons";
import { signInHref } from "@/lib/safe-redirect";
import { cn } from "@/lib/utils";

export const generateMetadata = seasonPageMetadata(null);

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ "signed-up"?: string; "left-subs"?: string; error?: string }>;

export const dynamic = "force-dynamic";

// Codes the signup action redirects here with (`submitSignup`).
const SIGNUP_ERRORS: Record<string, string> = {
  "signups-closed": "Signups for this season are closed.",
  "signups-not-open": "Signups for this season haven't opened yet.",
  "already-signed-up": "You're already signed up for this season.",
  banned: "Your account is suspended from Spicy League, so you can't sign up.",
  "sub-booked":
    "You're approved to sub in a match that hasn't been played yet. Ask the captain or an admin to release you first.",
};

function StatusPanel({
  state,
  slug,
  alreadySignedUp,
  championName,
}: {
  state: SeasonState;
  slug: string;
  alreadySignedUp: boolean;
  championName?: string | null;
}) {
  switch (state) {
    case "signups_open":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Signups are open</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            {alreadySignedUp ? (
              <p className="text-muted-foreground text-sm">
                You are signed up. Captains draft from the signup list after signups close.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  All signed-up players are eligible to be drafted by captains.
                </p>
                <Link
                  href={`/seasons/${slug}/signup`}
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  Sign up
                </Link>
              </>
            )}
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
            Signups are closed. Captains have not been announced yet.
          </CardContent>
        </Card>
      );
    case "captains_selected":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Captains announced</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Captains have been selected. The draft has not started yet.
            </p>
            <Link
              href={`/seasons/${slug}/captains`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              View captains
            </Link>
          </CardContent>
        </Card>
      );
    case "drafting":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Draft in progress</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Captains are drafting teams. Picks appear on the draft page as they are made.
            </p>
            <Link href={`/seasons/${slug}/draft`} className={cn(buttonVariants({ size: "lg" }))}>
              View the draft
            </Link>
          </CardContent>
        </Card>
      );
    case "group_stage":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Group stage</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              Teams are playing round-robin matches. Standings update when results are confirmed.
            </p>
            <Link
              href={`/seasons/${slug}/matches`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Matches &amp; standings
            </Link>
          </CardContent>
        </Card>
      );
    case "playoffs":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Playoffs</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              The top 4 teams from the group stage play a single-elimination bracket.
            </p>
            <Link
              href={`/seasons/${slug}/matches`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Matches &amp; standings
            </Link>
          </CardContent>
        </Card>
      );
    case "complete":
      return (
        <Card>
          <CardHeader>
            <CardTitle>Season complete</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {championName ? (
                <>
                  Champion: <span className="text-foreground font-semibold">{championName}</span>
                </>
              ) : (
                "Season complete."
              )}
            </p>
            <Link
              href={`/seasons/${slug}/matches`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Final standings
            </Link>
          </CardContent>
        </Card>
      );
    default:
      return null;
  }
}

export default async function SeasonDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { "signed-up": signedUp, "left-subs": leftSubs, error } = await searchParams;
  const errorMessage = error ? (SIGNUP_ERRORS[error] ?? null) : null;

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) notFound();

  const session = await auth();
  const mySignup = session?.user?.id
    ? await db.query.seasonSignups.findFirst({
        where: and(
          eq(seasonSignups.seasonId, season.id),
          eq(seasonSignups.userId, session.user.id),
        ),
        columns: { kind: true },
      })
    : undefined;
  const alreadySignedUp = !!mySignup;
  // Late joiners can sign up as subs once regular signups have closed.
  const subSignupsOpen = openSignupKind(season) === "sub";

  let championName: string | null = null;
  if (season.state === "complete") {
    const finalMatch = await db.query.matches.findFirst({
      where: and(
        eq(matches.seasonId, season.id),
        eq(matches.stage, "final"),
        eq(matches.state, "confirmed"),
      ),
    });
    if (finalMatch?.winnerTeamId) {
      const champ = await db.query.teams.findFirst({
        where: eq(teams.id, finalMatch.winnerTeamId),
      });
      championName = champ?.name ?? null;
    }
  }

  // "Your team" + next match for signed-in players once teams exist.
  const myTeam =
    session?.user?.id && ["group_stage", "playoffs", "complete"].includes(season.state)
      ? await getTeamForCaptain(season.id, session.user.id)
      : null;
  const myNextMatch = myTeam
    ? await db.query.matches.findFirst({
        where: and(
          eq(matches.seasonId, season.id),
          eq(matches.state, "scheduled"),
          or(eq(matches.homeTeamId, myTeam.id), eq(matches.awayTeamId, myTeam.id)),
        ),
        orderBy: [asc(matches.round)],
      })
    : null;
  const myOpponent = myNextMatch
    ? await db.query.teams.findFirst({
        where: eq(
          teams.id,
          myNextMatch.homeTeamId === myTeam!.id ? myNextMatch.awayTeamId : myNextMatch.homeTeamId,
        ),
      })
    : null;

  const signupOpens = season.signupOpensAt;
  const signupCloses = season.signupClosesAt;
  const seasonStart = season.seasonStartAt;

  return (
    <div className="page flex-1 space-y-8 [--page-max:48rem]">
      <header className="space-y-3">
        <Link href="/seasons" className="text-muted-foreground text-xs hover:underline">
          ← All seasons
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">{season.name}</h1>
          <Badge>{SEASON_STATE_LABELS[season.state]}</Badge>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        {season.description ? (
          <p className="text-muted-foreground text-lg">{season.description}</p>
        ) : null}
      </header>

      <SeasonNav slug={season.slug} state={season.state} current="overview" />

      {leftSubs ? <FlashToast param="left-subs" message="You've left the sub list." /> : null}
      {signedUp ? (
        <FlashToast
          param="signed-up"
          message={
            signedUp === "sub"
              ? `You're on the sub list for ${season.name}.`
              : `You're signed up for ${season.name}.`
          }
        />
      ) : null}

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <StatusPanel
        state={season.state}
        slug={season.slug}
        alreadySignedUp={alreadySignedUp}
        championName={championName}
      />

      {mySignup?.kind === "sub" && season.state !== "complete" ? (
        <section
          aria-label="Sub list"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
        >
          <div className="space-y-1">
            <p className="text-label" style={{ color: "var(--accent-text)" }}>
              You&apos;re on the sub list
            </p>
            <p className="text-muted-foreground text-sm">
              Captains can request you for a match; an admin approves each sub. Your matches show up
              in your match history.
            </p>
          </div>
          <form action={leaveSubList.bind(null, season.slug)}>
            <ConfirmSubmitButton
              variant="outline"
              confirmMessage="Leave the sub list? Any pending sub requests for you are withdrawn."
            >
              Leave sub list
            </ConfirmSubmitButton>
          </form>
        </section>
      ) : !mySignup && subSignupsOpen && !myTeam ? (
        <section
          aria-label="Sign up as a sub"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
        >
          <div className="space-y-1">
            <p className="font-medium">Missed signups? Join as a sub.</p>
            <p className="text-muted-foreground text-sm">
              You won&apos;t be drafted, but captains can bring you in for a match when they&apos;re
              short.
            </p>
          </div>
          <Link
            href={
              session
                ? `/seasons/${season.slug}/signup`
                : signInHref(`/seasons/${season.slug}/signup`)
            }
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Sign up as a sub
          </Link>
        </section>
      ) : null}

      {myTeam ? (
        <section
          aria-label="Your team"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5"
          style={{ borderColor: "var(--accent)" }}
        >
          <div className="space-y-1">
            <p className="text-label" style={{ color: "var(--accent-text)" }}>
              Your team
            </p>
            <p className="text-lg font-medium">{myTeam.name}</p>
            {myNextMatch ? (
              <p className="text-muted-foreground text-sm">
                Next: vs <span className="text-foreground">{myOpponent?.name ?? "TBD"}</span> ·{" "}
                {myNextMatch.stage === "final"
                  ? "Final"
                  : myNextMatch.stage === "semis"
                    ? "Semifinal"
                    : `Round ${myNextMatch.round}`}
                {myNextMatch.scheduledAt ? (
                  <>
                    {" "}
                    · <LocalTime date={myNextMatch.scheduledAt} preset="weekday-datetime" />
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                {season.state === "complete"
                  ? championName === myTeam.name
                    ? "Season champions."
                    : "Season complete."
                  : "No scheduled matches left."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {myNextMatch ? (
              <Link
                href={`/seasons/${season.slug}/matches/${myNextMatch.id}`}
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Match details
              </Link>
            ) : null}
            <Link
              href={`/seasons/${season.slug}/teams`}
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              All teams
            </Link>
          </div>
        </section>
      ) : null}

      {signupOpens || signupCloses || seasonStart ? (
        <section className="grid gap-3 sm:grid-cols-3">
          {signupOpens ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Signups open</p>
              <p className="mt-1 text-sm">
                <LocalTime date={signupOpens} />
              </p>
            </div>
          ) : null}
          {signupCloses ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Signups close</p>
              <p className="mt-1 text-sm">
                <LocalTime date={signupCloses} />
              </p>
            </div>
          ) : null}
          {seasonStart ? (
            <div className="rounded-lg border p-4">
              <p className="text-muted-foreground text-xs tracking-wide uppercase">Season starts</p>
              <p className="mt-1 text-sm">
                <LocalTime date={seasonStart} />
              </p>
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
    </div>
  );
}
