import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { championIconUrl } from "@/lib/draft-room";
import type { ScoreboardSide, StatNumbers } from "@/lib/riot-player-stats";

// Riot's numbers for each tournament game of the match (docs/MATCH-DAY.md,
// phase 6). Players who haven't opted in show their champion but not their
// numbers (decision 20); team totals always show.

const SIDE_COLOR = { blue: "#3b82f6", red: "#ef4444" } as const;

export type ScoreboardGame = {
  gameNumber: number;
  sides: (ScoreboardSide & { teamName: string })[];
};

const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

function Cells({ s }: { s: StatNumbers | null }) {
  const cell = "px-2 py-1 text-right tabular-nums";
  if (!s) {
    return (
      <td colSpan={5} className="text-muted-foreground px-2 py-1 text-right text-xs">
        Stats hidden
      </td>
    );
  }
  return (
    <>
      <td className={cell}>
        {s.kills}/{s.deaths}/{s.assists}
      </td>
      <td className={cell}>{s.cs}</td>
      <td className={cell}>{k(s.gold)}</td>
      <td className={cell}>{k(s.damage)}</td>
      <td className={cell}>{s.visionScore}</td>
    </>
  );
}

export function RiotScoreboard({
  games,
  players,
  champions,
}: {
  games: ScoreboardGame[];
  players: Map<string, { name: string }>;
  champions: { version: string; names: Record<string, string> } | null;
}) {
  if (games.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scoreboard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {games.map((g) => (
          <section key={g.gameNumber} className="space-y-2">
            <h3 className="text-sm font-medium">Game {g.gameNumber}</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead className="text-muted-foreground text-xs">
                  <tr>
                    <th className="px-2 py-1 text-left font-normal">Player</th>
                    <th className="px-2 py-1 text-right font-normal">K/D/A</th>
                    <th className="px-2 py-1 text-right font-normal">CS</th>
                    <th className="px-2 py-1 text-right font-normal">Gold</th>
                    <th className="px-2 py-1 text-right font-normal">Damage</th>
                    <th className="px-2 py-1 text-right font-normal">Vision</th>
                  </tr>
                </thead>
                {g.sides.map((side) => (
                  <tbody key={side.side} className="border-t">
                    <tr>
                      <td
                        colSpan={6}
                        className="px-2 pt-2 text-xs font-semibold"
                        style={{ color: SIDE_COLOR[side.side] }}
                      >
                        {side.teamName} · {side.side}
                        {side.win ? " · Victory" : ""}
                      </td>
                    </tr>
                    {side.rows.map((r, i) => (
                      <tr key={`${r.championKey}-${i}`}>
                        <td className="px-2 py-1">
                          <span className="flex items-center gap-2">
                            {champions ? (
                              // Small Data Dragon squares; see draft-room.tsx for why not next/image.
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={championIconUrl(champions.version, r.championKey)}
                                alt={champions.names[r.championKey] ?? r.championKey}
                                title={champions.names[r.championKey] ?? r.championKey}
                                width={24}
                                height={24}
                                loading="lazy"
                                className="rounded"
                              />
                            ) : null}
                            <span className="truncate">
                              {(r.userId && players.get(r.userId)?.name) ?? "Unlinked player"}
                            </span>
                          </span>
                        </td>
                        <Cells s={r.stats} />
                      </tr>
                    ))}
                    <tr className="text-muted-foreground text-xs">
                      <td className="px-2 py-1">Team</td>
                      <Cells s={side.totals} />
                    </tr>
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
