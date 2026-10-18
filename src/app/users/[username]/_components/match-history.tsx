import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { roundLabel } from "@/lib/match-format";
import type { PlayerMatch } from "@/lib/substitutions";

const RESULT_LETTER = { win: "W", draw: "D", loss: "L" } as const;

/** Confirmed matches the player was part of — including as a sub. */
export function MatchHistory({ matches }: { matches: PlayerMatch[] }) {
  return (
    <section aria-labelledby="match-history" className="space-y-3">
      <h2
        id="match-history"
        className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
      >
        Match history
      </h2>
      {matches.length === 0 ? (
        <p className="text-muted-foreground text-sm">No confirmed matches yet.</p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {matches.map((m) => (
            <li key={m.matchId}>
              <Link
                href={`/seasons/${m.seasonSlug}/matches/${m.matchId}`}
                className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{m.teamName}</span>
                    <span className="text-muted-foreground"> vs </span>
                    {m.opponentName}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {m.seasonName} · {roundLabel(m.stage, m.round)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {m.role === "sub" ? <Badge>Sub</Badge> : null}
                  {m.role === "sat-out" ? <Badge variant="outline">Sat out</Badge> : null}
                  {m.teamScore !== null && m.opponentScore !== null ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {m.teamScore}–{m.opponentScore}
                    </span>
                  ) : null}
                  <span
                    className="w-8 text-right text-xs font-semibold"
                    style={{ color: m.result === "win" ? "var(--accent-text)" : "var(--muted)" }}
                  >
                    {RESULT_LETTER[m.result]}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
