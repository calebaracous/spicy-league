import { percent } from "@/lib/champion-stats";
import { championIconUrl } from "@/lib/draft-room";

/**
 * Champions the player played in Spicy League games — from match-day draft
 * rooms, where captains assign each pick to a player (docs/MATCH-DAY.md,
 * phase 5). Our own data, not Riot match history. Renders nothing without any.
 */
export function LeagueChampions({
  champions,
  version,
  names,
}: {
  champions: { key: string; games: number; wins: number; losses: number }[];
  version: string | null;
  names: Map<string, string>;
}) {
  if (champions.length === 0) return null;
  return (
    <section aria-labelledby="league-champions" className="space-y-3">
      <h2
        id="league-champions"
        className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
      >
        League champions
      </h2>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
        {champions.map((c) => (
          <li key={c.key} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
            {version ? (
              // Small Data Dragon squares; see draft-room.tsx for why not next/image.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={championIconUrl(version, c.key)}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                className="rounded"
              />
            ) : null}
            <span className="min-w-0">
              <span className="block truncate font-medium">{names.get(c.key) ?? c.key}</span>
              <span className="text-muted-foreground block text-xs tabular-nums">
                {c.games} game{c.games === 1 ? "" : "s"} · {c.wins}–{c.losses} (
                {percent(c.wins, c.wins + c.losses)})
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
