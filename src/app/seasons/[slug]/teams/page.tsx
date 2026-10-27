import { and, asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasons, seasonSignups } from "@/db/schema/seasons";
import { renameTeam } from "./actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Input } from "@/components/ui/input";
import { FlashToast } from "@/components/flash-toast";
import { SeasonNav } from "@/components/season-nav";
import { computeStandings, getCaptainedTeamId } from "@/lib/schedule";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS, openSignupKind } from "@/lib/seasons";
import { getAvailableSubs } from "@/lib/substitutions";
import { TEAM_NAME_HELP, TEAM_NAME_MAX } from "@/lib/team-name";

export const generateMetadata = seasonPageMetadata("Teams");

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Team not found.",
  "not-captain": "Only the team's captains can rename it.",
  "season-complete": "The season is over, so team names are locked.",
  "invalid-name": `That name doesn't work. ${TEAM_NAME_HELP}.`,
  "name-taken": "Another team this season already has that name.",
};

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
  fill: "Fill",
};

export default async function TeamsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { saved, error } = await searchParams;

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) notFound();

  const [seasonTeams, members, session] = await Promise.all([
    db.select().from(teams).where(eq(teams.seasonId, season.id)).orderBy(asc(teams.createdAt)),
    db
      .select({
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        pickNumber: teamMembers.pickNumber,
        username: users.username,
        name: users.name,
        rolePrefs: seasonSignups.rolePrefs,
      })
      .from(teamMembers)
      .innerJoin(teams, and(eq(teamMembers.teamId, teams.id), eq(teams.seasonId, season.id)))
      .innerJoin(users, eq(teamMembers.userId, users.id))
      .leftJoin(
        seasonSignups,
        and(eq(seasonSignups.seasonId, season.id), eq(seasonSignups.userId, teamMembers.userId)),
      )
      .orderBy(asc(teamMembers.pickNumber)),
    auth(),
  ]);

  const standings = ["group_stage", "playoffs", "complete"].includes(season.state)
    ? (await computeStandings(season.id)).rows
    : [];
  const record = new Map(standings.map((s) => [s.teamId, s]));
  const viewerId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";
  // Captains (either of a duo) rename their own team until the season ends; admins any team.
  const captainedTeamId =
    viewerId && seasonTeams.length > 0 ? await getCaptainedTeamId(season.id, viewerId) : null;
  const canRename = (teamId: string) =>
    isAdmin || (season.state !== "complete" && captainedTeamId === teamId);
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;
  // Once teams exist, everyone signed up but not on a team can be subbed in.
  const availableSubs = seasonTeams.length > 0 ? await getAvailableSubs(season.id) : [];
  // Offer the sub list only to people not already in the season.
  const viewerInSeason =
    !!viewerId &&
    (members.some((m) => m.userId === viewerId) ||
      availableSubs.some((p) => p.userId === viewerId));
  const subSignupsOpen = openSignupKind(season) === "sub" && !viewerInSeason;

  return (
    <div className="page flex-1 space-y-8 [--page-max:56rem]">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">Teams</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {seasonTeams.length} team{seasonTeams.length !== 1 ? "s" : ""}
        </p>
      </header>

      <SeasonNav slug={slug} state={season.state} current="teams" />

      {saved === "renamed" ? <FlashToast message="Team name saved." /> : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {seasonTeams.length === 0 ? (
        <p className="text-muted-foreground text-sm">Teams are formed when the draft finishes.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {seasonTeams.map((team) => {
            // Captain (pickNumber null) first, then picks in order.
            const roster = members
              .filter((m) => m.teamId === team.id)
              .sort((a, b) => (a.pickNumber ?? 0) - (b.pickNumber ?? 0));
            const mine = !!viewerId && roster.some((m) => m.userId === viewerId);
            const rec = record.get(team.id);
            return (
              <section
                key={team.id}
                aria-label={team.name}
                className="bg-card rounded-xl border p-5"
                style={mine ? { borderColor: "var(--accent)" } : undefined}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h2 className="text-lg leading-tight font-medium">{team.name}</h2>
                  <div className="flex shrink-0 items-center gap-2">
                    {mine ? <Badge>Your team</Badge> : null}
                    {rec ? (
                      <span className="text-muted-foreground font-mono text-xs">
                        {season.groupBestOf === 2
                          ? `${rec.wins}–${rec.draws}–${rec.losses}`
                          : `${rec.wins}–${rec.losses}`}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ul className="space-y-1.5">
                  {roster.map((m) => {
                    const prefs = (m.rolePrefs ?? {}) as { primaryRole?: string };
                    return (
                      <li key={m.userId} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground w-7 shrink-0 font-mono text-xs">
                          {m.pickNumber === null ? "C" : `#${m.pickNumber}`}
                        </span>
                        <Link
                          href={`/users/${m.username}`}
                          className="min-w-0 flex-1 truncate underline-offset-2 hover:underline"
                        >
                          {m.name ?? m.username}
                        </Link>
                        {season.game === "lol" && prefs.primaryRole ? (
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {ROLE_LABELS[prefs.primaryRole] ?? prefs.primaryRole}
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {canRename(team.id) ? (
                  <details className="mt-4 border-t pt-3">
                    <summary className="text-muted-foreground cursor-pointer text-xs hover:underline">
                      Rename team
                    </summary>
                    <form
                      action={renameTeam.bind(null, slug, team.id)}
                      className="mt-2 flex flex-wrap items-start gap-2"
                    >
                      <Input
                        name="name"
                        defaultValue={team.name}
                        aria-label={`New name for ${team.name}`}
                        minLength={3}
                        maxLength={TEAM_NAME_MAX}
                        required
                        className="min-w-0 flex-1"
                      />
                      <PendingSubmitButton size="sm">Save</PendingSubmitButton>
                      <p className="text-muted-foreground w-full text-xs">
                        {TEAM_NAME_HELP}. Your Discord role and channels are renamed too.
                      </p>
                    </form>
                  </details>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      {seasonTeams.length > 0 ? (
        <section aria-labelledby="available-subs" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="available-subs"
              className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
            >
              Available subs
            </h2>
            {subSignupsOpen ? (
              <Link
                href={`/seasons/${slug}/signup`}
                className="text-accent-text text-xs hover:underline"
              >
                Join the sub list →
              </Link>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Signed up but not on a team. Captains request a sub from the match page; an admin
            approves it.
          </p>
          {availableSubs.length === 0 ? (
            <p className="text-muted-foreground rounded-xl border px-4 py-3 text-sm">
              Nobody is on the sub list yet.
            </p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {availableSubs.map((p) => (
                <li key={p.userId} className="space-y-1 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        href={`/users/${p.username}`}
                        className="truncate font-medium underline-offset-2 hover:underline"
                      >
                        {p.label}
                      </Link>
                      <Badge variant="outline" className="text-xs">
                        {p.kind === "sub" ? "Sub list" : "Undrafted"}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {[formatPrefs(season.game, p.rolePrefs), p.rank].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {p.notes ? <p className="text-muted-foreground text-xs">“{p.notes}”</p> : null}
                  {p.quandary ? (
                    <p className="text-muted-foreground text-xs">Button: “{p.quandary}”</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}

/** "Mid / Top" for LoL, "Mirage, Nuke" for CS2. */
function formatPrefs(game: string, prefs: unknown): string | null {
  if (!prefs || typeof prefs !== "object") return null;
  if (game === "lol") {
    const p = prefs as { primaryRole?: string; secondaryRole?: string };
    return [p.primaryRole, p.secondaryRole]
      .filter(Boolean)
      .map((r) => ROLE_LABELS[r!] ?? r)
      .join(" / ");
  }
  const maps = (prefs as { mapPrefs?: string[] }).mapPrefs;
  return maps?.length ? maps.join(", ") : null;
}
