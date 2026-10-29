import Link from "next/link";

import { percent } from "@/lib/champion-stats";
import type { PlayerAverages } from "@/lib/riot-player-stats";

/**
 * Per-season averages from the player's Spicy League tournament games, from
 * Riot (docs/MATCH-DAY.md, phase 6). Only rendered for players who opted in to
 * public stats (decision 20). Renders nothing without any games.
 */
export function LeagueRiotStats({
  seasons,
}: {
  seasons: { name: string; slug: string; stats: PlayerAverages }[];
}) {
  if (seasons.length === 0) return null;
  const one = (n: number) => n.toFixed(1);
  const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));
  return (
    <section aria-labelledby="league-riot-stats" className="space-y-3">
      <h2
        id="league-riot-stats"
        className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
      >
        League game stats
      </h2>
      <ul className="space-y-2">
        {seasons.map(({ name, slug, stats: s }) => (
          <li key={slug} className="space-y-2 rounded-xl border px-3 py-2 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Link href={`/seasons/${slug}`} className="font-medium hover:underline">
                {name}
              </Link>
              <span className="text-muted-foreground text-xs tabular-nums">
                {s.games} game{s.games === 1 ? "" : "s"} · {s.wins}–{s.losses} (
                {percent(s.wins, s.games)})
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
              {[
                ["KDA", s.kda.toFixed(2)],
                ["K/D/A", `${one(s.avg.kills)}/${one(s.avg.deaths)}/${one(s.avg.assists)}`],
                ["CS", s.avg.cs.toFixed(0)],
                ["Gold", k(s.avg.gold)],
                ["Damage", k(s.avg.damage)],
                ["Vision", s.avg.visionScore.toFixed(0)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-xs">Per-game averages, from Riot.</p>
    </section>
  );
}
