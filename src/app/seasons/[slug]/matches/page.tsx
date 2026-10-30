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
import { isDraw } from "@/lib/match-format";
import { computeStandings } from "@/lib/schedule";
import { PLAYOFF_SPOTS } from "@/lib/standings";
import { loadLiveMatches, matchDayApplies } from "@/lib/match-day";
import type { LiveMatch } from "@/lib/live-match";
import { LiveMatchBadge } from "@/components/live-match-badge";

export const generateMetadata = seasonPageMetadata("Matches");

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

const STATE_BADGE: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  scheduled: { label: "Scheduled", variant: "outline" },
  reported: { label: "Reported", variant: "default" },
  confirmed: { label: "Confirmed", variant: "secondary" },
  disputed: { label: "Disputed", variant: "destructive" },
};

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
  live,
}: {
  match: MatchRow;
  slug: string;
  label: string;
  teamName: Map<string, string>;
  live: LiveMatch | undefined;
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
        {live ? <LiveMatchBadge live={live} /> : <Badge variant={sb.variant}>{sb.label}</Badge>}
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
      {m.scheduledAt && m.state === "scheduled" && !live ? (
        <p className="text-muted-foreground mt-2 text-xs">
          <LocalTime date={m.scheduledAt} preset="weekday-datetime" />
        </p>
      ) : null}
    </Link>
  );
}

/** One line in the group-stage / tiebreaker lists. */
function MatchLine({
  match: m,
  slug,
  teamName,
  live,
}: {
  match: MatchRow;
  slug: string;
  teamName: Map<string, string>;
  live: LiveMatch | undefined;
}) {
  const sb = STATE_BADGE[m.state] ?? STATE_BADGE.scheduled;
  const hasScore = m.homeScore !== null && m.awayScore !== null;
  return (
    <Link
      href={`/seasons/${slug}/matches/${m.id}`}
      className="hover:bg-muted/50 flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className={m.winnerTeamId === m.homeTeamId ? "font-bold" : ""}>
          {teamName.get(m.homeTeamId) ?? "?"}
        </span>
        <span className="text-muted-foreground text-xs">vs</span>
        <span className={m.winnerTeamId === m.awayTeamId ? "font-bold" : ""}>
          {teamName.get(m.awayTeamId) ?? "?"}
        </span>
        {hasScore ? (
          <span className="text-muted-foreground font-mono text-xs">
            {m.homeScore}–{m.awayScore}
            {isDraw(m) ? " draw" : ""}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {m.scheduledAt && m.state === "scheduled" && !live ? (
          <span className="text-muted-foreground hidden text-xs sm:inline">
            <LocalTime date={m.scheduledAt} preset="weekday-datetime" />
          </span>
        ) : null}
        {live ? <LiveMatchBadge live={live} /> : <Badge variant={sb.variant}>{sb.label}</Badge>}
      </div>
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
  const live = matchDayApplies(season)
    ? await loadLiveMatches(allMatches)
    : new Map<string, LiveMatch>();
  const teamName = new Map(allTeams.map((t) => [t.id, t.name]));

  const table = ["group_stage", "playoffs", "complete"].includes(season.state)
    ? await computeStandings(season.id)
    : null;
  const standings = table?.rows ?? null;
  const bo2 = season.groupBestOf === 2;

  const groupMatches = allMatches.filter((m) => m.stage === "group");
  const tiebreakerMatches = allMatches.filter((m) => m.stage === "tiebreaker");
  const anyPlayed = standings?.some((s) => s.matchesPlayed > 0) ?? false;
  const groupDone = groupMatches.length > 0 && groupMatches.every((m) => m.state === "confirmed");
  const pendingTiebreaks =
    groupDone && !allMatches.some((m) => m.stage === "semis")
      ? (table?.tiebreakersNeeded ?? [])
      : [];
  const semis = allMatches.filter((m) => m.stage === "semis").sort((a, b) => a.round - b.round);
  const finalMatch = allMatches.find((m) => m.stage === "final");
  const rounds = [...new Set(groupMatches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div className="page flex-1 space-y-8 [--page-max:48rem]">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">Matches</h1>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">{season.name}</p>
      </header>

      <SeasonNav slug={slug} state={season.state} game={season.game} current="matches" />

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
                  {bo2 ? <th className="px-4 py-2 text-right font-medium">D</th> : null}
                  <th className="px-4 py-2 text-right font-medium">L</th>
                  <th className="px-4 py-2 text-right font-medium">{bo2 ? "Maps" : "+/-"}</th>
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
                      {anyPlayed && s.tied ? `${s.rank}=` : i + 1}
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-medium">{s.teamName}</span>
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({s.captainDisplayName})
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{s.wins}</td>
                    {bo2 ? (
                      <td className="text-muted-foreground px-4 py-2 text-right">{s.draws}</td>
                    ) : null}
                    <td className="text-muted-foreground px-4 py-2 text-right">{s.losses}</td>
                    <td
                      className="text-muted-foreground px-4 py-2 text-right font-mono text-xs"
                      title={bo2 ? "Maps won–lost; standings rank on maps won" : undefined}
                    >
                      {bo2
                        ? `${s.gamesWon}–${s.gamesLost}`
                        : s.gamesWon - s.gamesLost > 0
                          ? `+${s.gamesWon - s.gamesLost}`
                          : s.gamesWon - s.gamesLost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pendingTiebreaks.length > 0 ? (
            <p className="text-sm" style={{ color: "var(--accent-text)" }}>
              Tiebreaker needed:{" "}
              {pendingTiebreaks
                .map((g) => g.map((id) => teamName.get(id) ?? "?").join(" vs "))
                .join("; ")}
              . Seeding waits on the result.
            </p>
          ) : null}
          <p className="text-muted-foreground text-xs">
            {standings.length > PLAYOFF_SPOTS
              ? `Top ${PLAYOFF_SPOTS} advance to the playoffs (red line marks the cut). `
              : ""}
            {bo2
              ? "Group matches are best-of-2 and rank on maps won: 2 for a 2–0, 1 each for a 1–1 draw. "
              : "Ranked on wins. "}
            Teams level on that are separated by head-to-head results between them, then series wins
            {bo2 ? "" : ", then game difference"}. If it still decides the top {PLAYOFF_SPOTS}, the
            tied teams play a Bo1 tiebreaker game; a shared rank shows as “=”.
          </p>
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
                  live={live.get(m.id)}
                />
              ))}
            </div>
            <span aria-hidden className="text-muted-foreground hidden text-lg md:block">
              →
            </span>
            {finalMatch ? (
              <BracketCard
                match={finalMatch}
                slug={slug}
                label="Final"
                teamName={teamName}
                live={live.get(finalMatch.id)}
              />
            ) : (
              <div className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                <p className="text-label mb-1">Final</p>
                Semifinal winners meet here.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tiebreakerMatches.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Tiebreakers (Bo1)
          </h2>
          <div className="space-y-1">
            {tiebreakerMatches.map((m) => (
              <MatchLine
                key={m.id}
                match={m}
                slug={slug}
                teamName={teamName}
                live={live.get(m.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {allMatches.length === 0 ? (
        <p className="text-muted-foreground text-sm">Schedule not yet generated.</p>
      ) : rounds.length > 0 ? (
        <section className="space-y-6">
          {semis.length > 0 || tiebreakerMatches.length > 0 ? (
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Group stage{bo2 ? " · best of 2" : ""}
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
                  {roundMatches.map((m) => (
                    <MatchLine
                      key={m.id}
                      match={m}
                      slug={slug}
                      teamName={teamName}
                      live={live.get(m.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}
