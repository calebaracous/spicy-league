import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { SeasonNav } from "@/components/season-nav";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS } from "@/lib/seasons";
import { computeStandings } from "@/lib/schedule";

export const generateMetadata = seasonPageMetadata("Matches");

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "secondary" },
  reported: { label: "Reported", variant: "default" },
  confirmed: { label: "Confirmed", variant: "default" },
  disputed: { label: "Disputed", variant: "destructive" },
};

const PLAYOFF_SPOTS = 4;

type MatchRow = {
  id: string;
  round: number;
  stage: string;
  state: string;
  homeTeamId: string;
  awayTeamId: string;
  winnerTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  scheduledAt: Date | null;
};

function BracketCard({
  match: m,
  slug,
  label,
  teamName,
}: {
  match: MatchRow;
  slug: string;
  label: string;
  teamName: Map<string, string>;
}) {
  const sb = STATE_BADGE[m.state] ?? STATE_BADGE.scheduled;
  const decided = m.winnerTeamId !== null;
  const sides = [
    { id: m.homeTeamId, score: m.homeScore },
    { id: m.awayTeamId, score: m.awayScore },
  ];
  return (
    <Link
      href={`/seasons/${slug}/matches/${m.id}`}
      className="hover:bg-muted/50 block rounded-xl border p-4 transition-colors"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label text-muted-foreground">{label}</span>
        <Badge variant={sb.variant}>{sb.label}</Badge>
      </div>
      <ul className="space-y-1">
        {sides.map((side) => {
          const won = decided && m.winnerTeamId === side.id;
          return (
            <li
              key={side.id}
              className="flex items-center justify-between gap-3 text-sm"
              style={{ color: decided && !won ? "var(--muted)" : undefined }}
            >
              <span className={won ? "font-semibold" : undefined}>
                {teamName.get(side.id) ?? "?"}
                {won ? <span className="sr-only"> (winner)</span> : null}
              </span>
              <span className="font-mono text-xs">{side.score ?? ""}</span>
            </li>
          );
        })}
      </ul>
      {m.scheduledAt && m.state === "scheduled" ? (
        <p className="text-muted-foreground mt-2 text-xs">
          <LocalTime date={m.scheduledAt} preset="weekday-datetime" />
        </p>
      ) : null}
    </Link>
  );
}

export default async function MatchesPage({ params }: { params: Params }) {
  const { slug } = await params;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season || season.state === "draft") notFound();

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
      scheduledAt: matches.scheduledAt,
    })
    .from(matches)
    .where(eq(matches.seasonId, season.id))
    .orderBy(asc(matches.round));

  const allTeams = await db.select().from(teams).where(eq(teams.seasonId, season.id));
  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));

  const standings = ["group_stage", "playoffs", "complete"].includes(season.state)
    ? await computeStandings(season.id)
    : null;

  const groupMatches = allMatches.filter((m) => m.stage === "group");
  const semis = allMatches.filter((m) => m.stage === "semis").sort((a, b) => a.round - b.round);
  const finalMatch = allMatches.find((m) => m.stage === "final");
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-12">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{season.name}</p>
      </header>

      <SeasonNav slug={slug} state={season.state} current="matches" />

      {standings ? (
        <section className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Standings
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Team</th>
                  <th className="px-4 py-2 text-right font-medium">W</th>
                  <th className="px-4 py-2 text-right font-medium">L</th>
                  <th className="px-4 py-2 text-right font-medium">+/-</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {standings.map((s, i) => (
                  <tr
                    key={s.teamId}
                    className="hover:bg-muted/50"
                    // Red rule under 4th place: the playoff cut.
                    style={
                      i === PLAYOFF_SPOTS - 1 && standings.length > PLAYOFF_SPOTS
                        ? { borderBottom: "2px solid var(--accent)" }
                        : undefined
                    }
                  >
                    <td
                      className="px-4 py-2 font-mono text-xs"
                      style={{ color: i < PLAYOFF_SPOTS ? "var(--accent-text)" : "var(--muted)" }}
                    >
                      {i + 1}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{s.teamName}</span>
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({s.captainDisplayName})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{s.wins}</td>
                    <td className="text-muted-foreground px-4 py-2 text-right">{s.losses}</td>
                    <td className="text-muted-foreground px-4 py-2 text-right">
                      {s.gameDiff > 0 ? `+${s.gameDiff}` : s.gameDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {standings.length > PLAYOFF_SPOTS ? (
            <p className="text-muted-foreground text-xs">
              Top {PLAYOFF_SPOTS} advance to the playoffs (red line marks the cut). Ties break on
              game difference, then team name.
            </p>
          ) : null}
        </section>
      ) : null}

      {semis.length > 0 ? (
        <section className="space-y-4" aria-label="Playoff bracket">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Playoffs
          </h2>
          <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="space-y-3">
              {semis.map((m, i) => (
                <BracketCard
                  key={m.id}
                  match={m}
                  slug={slug}
                  label={`Semifinal ${i + 1}`}
                  teamName={teamName}
                />
              ))}
            </div>
            <span aria-hidden className="text-muted-foreground hidden text-lg md:block">
              →
            </span>
            {finalMatch ? (
              <BracketCard match={finalMatch} slug={slug} label="Final" teamName={teamName} />
            ) : (
              <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                <p className="text-label mb-1">Final</p>
                Semifinal winners meet here.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {allMatches.length === 0 ? (
        <p className="text-muted-foreground text-sm">Schedule not yet generated.</p>
      ) : rounds.length > 0 ? (
        <section className="space-y-6">
          {semis.length > 0 ? (
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Group stage
            </h2>
          ) : null}
          {rounds.map((round) => {
            const roundMatches = groupMatches.filter((m) => m.round === round);
            return (
              <div key={round} className="space-y-2">
                <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  Round {round}
                </h2>
                <div className="space-y-1">
                  {roundMatches.map((m) => {
                    const sb = STATE_BADGE[m.state] ?? STATE_BADGE.scheduled;
                    const homeName = teamName.get(m.homeTeamId) ?? "?";
                    const awayName = teamName.get(m.awayTeamId) ?? "?";
                    const hasScore = m.homeScore !== null && m.awayScore !== null;
                    return (
                      <Link
                        key={m.id}
                        href={`/seasons/${slug}/matches/${m.id}`}
                        className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                      >
                        <div className="flex items-center gap-2 text-sm">
                          <span className={m.winnerTeamId === m.homeTeamId ? "font-bold" : ""}>
                            {homeName}
                          </span>
                          <span className="text-muted-foreground text-xs">vs</span>
                          <span className={m.winnerTeamId === m.awayTeamId ? "font-bold" : ""}>
                            {awayName}
                          </span>
                          {hasScore ? (
                            <span className="text-muted-foreground font-mono text-xs">
                              {m.homeScore}–{m.awayScore}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {m.scheduledAt && m.state === "scheduled" ? (
                            <span className="text-muted-foreground hidden text-xs sm:inline">
                              <LocalTime date={m.scheduledAt} preset="weekday-datetime" />
                            </span>
                          ) : null}
                          <Badge variant={sb.variant}>{sb.label}</Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
