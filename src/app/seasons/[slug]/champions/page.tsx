import { and, asc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { seasons } from "@/db/schema/seasons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeasonNav } from "@/components/season-nav";
import {
  championStats,
  defaultSortDir,
  parseChampionSort,
  percent,
  sideStats,
  sortChampionRows,
  type ChampionSort,
  type SortDir,
} from "@/lib/champion-stats";
import { getChampionCatalog } from "@/lib/champions";
import { championIconUrl } from "@/lib/draft-room";
import { seasonPageMetadata } from "@/lib/season-meta";
import { loadSeasonDraftGames } from "@/lib/season-stats";
import { cn } from "@/lib/utils";

export const generateMetadata = seasonPageMetadata("Champions");
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ team?: string; sort?: string; dir?: string }>;

/**
 * Champion pick/ban/win stats and side win rates from the season's match-day
 * draft rooms (docs/MATCH-DAY.md, phase 5). `?team=` narrows it to one team
 * for scouting; `?sort=&dir=` orders the table. Confirmed matches only.
 */
export default async function ChampionsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { team: teamId, ...query } = await searchParams;
  const order = parseChampionSort(query.sort, query.dir);
  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season || season.game !== "lol") notFound();

  const [games, teamRows, catalog] = await Promise.all([
    loadSeasonDraftGames(season.id),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.seasonId, season.id))
      .orderBy(asc(teams.name)),
    getChampionCatalog(),
  ]);
  const team = teamRows.find((t) => t.id === teamId) ?? null;
  const {
    games: counted,
    rows: unsorted,
    bannedAgainst,
  } = championStats(games, team ? { teamId: team.id } : {});
  const sides = sideStats(games);
  const names = new Map(catalog?.champions.map((c) => [c.key, c.name]) ?? []);
  const name = (key: string) => names.get(key) ?? key;
  const rows = sortChampionRows(unsorted, order.sort, order.dir, name);
  const href = (q: { team?: string | null; sort?: ChampionSort; dir?: SortDir }) => {
    const params = new URLSearchParams();
    if (q.team) params.set("team", q.team);
    if (q.sort && (q.sort !== "presence" || q.dir !== "desc")) {
      params.set("sort", q.sort);
      params.set("dir", q.dir ?? defaultSortDir(q.sort));
    }
    const qs = params.toString();
    return `/seasons/${slug}/champions${qs ? `?${qs}` : ""}`;
  };
  // A header link: first click sorts that column its natural way, the next flips it.
  const column = (sort: ChampionSort, label: string, align: "left" | "right" = "right") => {
    const active = order.sort === sort;
    const dir: SortDir = active ? (order.dir === "asc" ? "desc" : "asc") : defaultSortDir(sort);
    return (
      <th
        className={cn("py-1.5 font-normal", align === "right" && "text-right")}
        aria-sort={active ? (order.dir === "asc" ? "ascending" : "descending") : undefined}
      >
        <Link
          href={href({ team: team?.id, sort, dir })}
          scroll={false}
          className={cn(
            "hover:text-foreground hover:underline",
            active && "text-foreground font-medium",
          )}
        >
          {label}
          {active ? (order.dir === "asc" ? " ↑" : " ↓") : ""}
        </Link>
      </th>
    );
  };
  const icon = (key: string, size = 28) =>
    catalog ? (
      // Small Data Dragon squares; see draft-room.tsx for why not next/image.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={championIconUrl(catalog.version, key)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="rounded"
        style={{ width: size, height: size }}
      />
    ) : null;

  return (
    <div className="page flex-1 space-y-6 [--page-max:56rem]">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← {season.name}
        </Link>
        <h1 className="text-heading">Champions</h1>
        <p className="text-muted-foreground text-sm">
          From the match-day draft rooms of confirmed matches
          {counted > 0
            ? `: ${counted} drafted game${counted === 1 ? "" : "s"}${team ? ` involving ${team.name}` : ""}`
            : ""}
          .
        </p>
      </header>
      <SeasonNav slug={slug} state={season.state} game={season.game} current="champions" />

      {games.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No drafts yet. Stats appear once matches drafted in the draft room are confirmed.
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Blue side wins"
              value={percent(sides.blueWins, sides.played)}
              note={`${sides.blueWins} of ${sides.played} games`}
            />
            <Stat
              label="Red side wins"
              value={percent(sides.redWins, sides.played)}
              note={`${sides.redWins} of ${sides.played} games`}
            />
            <Stat
              label="RPS winner won game 1"
              value={percent(sides.rpsWins, sides.rpsGames)}
              note={`${sides.rpsWins} of ${sides.rpsGames} series`}
            />
          </div>

          <nav aria-label="Filter by team" className="flex flex-wrap gap-1.5">
            {[{ id: null as string | null, name: "All teams" }, ...teamRows].map((t) => {
              const active = (team?.id ?? null) === t.id;
              return (
                <Link
                  key={t.id ?? "all"}
                  href={href({ team: t.id, ...order })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    active ? "border-[color:var(--accent)] font-medium" : "text-muted-foreground",
                  )}
                >
                  {t.name}
                </Link>
              );
            })}
          </nav>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {team ? `${team.name}: picks and bans` : "Pick / ban / win"}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nothing drafted yet.</p>
              ) : (
                <table className="w-full min-w-[34rem] text-sm">
                  <thead className="text-muted-foreground text-left text-xs">
                    <tr>
                      {column("champion", "Champion", "left")}
                      {column("presence", "Presence")}
                      {column("picks", "Picks")}
                      {column("bans", "Bans")}
                      {column("record", "W–L")}
                      {column("winrate", "Win %")}
                      <th className="py-1.5 text-right font-normal">Blue / red</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r) => (
                      <tr key={r.key}>
                        <td className="py-1.5">
                          <span className="flex items-center gap-2">
                            {icon(r.key)}
                            {name(r.key)}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {percent(r.presence, counted)}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{r.picks}</td>
                        <td className="py-1.5 text-right tabular-nums">{r.bans}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {r.wins}–{r.losses}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {percent(r.wins, r.wins + r.losses)}
                        </td>
                        <td className="text-muted-foreground py-1.5 text-right tabular-nums">
                          {r.bluePicks} / {r.redPicks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {team && bannedAgainst.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Banned against {team.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-3 text-sm">
                {bannedAgainst.map((b) => (
                  <span key={b.key} className="flex items-center gap-1.5">
                    {icon(b.key, 24)}
                    {name(b.key)}
                    <span className="text-muted-foreground tabular-nums">×{b.bans}</span>
                  </span>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <Card>
      <CardContent className="space-y-0.5 py-4">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-muted-foreground text-xs">{note}</p>
      </CardContent>
    </Card>
  );
}
