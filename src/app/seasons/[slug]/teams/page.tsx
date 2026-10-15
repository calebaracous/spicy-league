import { and, asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teamMembers, teams } from "@/db/schema/drafts";
import { seasons, seasonSignups } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { SeasonNav } from "@/components/season-nav";
import { computeStandings } from "@/lib/schedule";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS } from "@/lib/seasons";

export const generateMetadata = seasonPageMetadata("Teams");

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
  fill: "Fill",
};

export default async function TeamsPage({ params }: { params: Params }) {
  const { slug } = await params;

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
    ? await computeStandings(season.id)
    : [];
  const record = new Map(standings.map((s) => [s.teamId, s]));
  const viewerId = session?.user?.id ?? null;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 space-y-8 px-6 py-12">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {seasonTeams.length} team{seasonTeams.length !== 1 ? "s" : ""}
        </p>
      </header>

      <SeasonNav slug={slug} state={season.state} current="teams" />

      {seasonTeams.length === 0 ? (
        <p className="text-muted-foreground text-sm">Teams are formed when the draft finishes.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {seasonTeams.map((team) => {
            const roster = members.filter((m) => m.teamId === team.id);
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
                        {rec.wins}–{rec.losses}
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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
