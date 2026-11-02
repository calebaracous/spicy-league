"use client";

import { useMemo, useState } from "react";

import { PlayerLink } from "@/components/player-link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type PlayersTableRow = {
  id: string;
  label: string;
  username: string | null;
  discordUsername: string | null;
  discordUserId: string | null;
  captain: boolean;
  teamName: string | null;
  sub: boolean;
  statsOptedIn: boolean;
};

/** The admin season page's "Players and Discord" table, filtered as you type. */
export function PlayersTable({ rows, isLol }: { rows: PlayersTableRow[]; isLol: boolean }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (p) =>
        p.label.toLowerCase().includes(q) ||
        p.username?.toLowerCase().includes(q) ||
        p.discordUsername?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div className="space-y-2">
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search players"
        aria-label="Search players"
        className="max-w-xs"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-left text-xs">
              <th className="pr-4 pb-2 font-medium">Player</th>
              <th className="pr-4 pb-2 font-medium">Role</th>
              <th className="pr-4 pb-2 font-medium">Discord</th>
              <th className={cn("pb-2 font-medium", isLol && "pr-4")}>Status</th>
              {isLol ? <th className="pb-2 font-medium">Public stats</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="py-1.5 pr-4">
                  <PlayerLink username={p.username} className="underline-offset-2 hover:underline">
                    {p.label}
                  </PlayerLink>
                </td>
                <td className="text-muted-foreground py-1.5 pr-4">
                  {[p.captain ? "Captain" : null, p.teamName ?? (p.sub ? "Sub list" : "Signed up")]
                    .filter(Boolean)
                    .join(" · ")}
                </td>
                <td className="py-1.5 pr-4 font-mono text-xs">{p.discordUsername ?? "—"}</td>
                <td className={cn("py-1.5 text-xs", isLol && "pr-4")}>
                  {!p.discordUsername ? (
                    <span style={{ color: "var(--accent-text)" }}>No username</span>
                  ) : p.discordUserId ? (
                    "Matched"
                  ) : (
                    <span className="text-muted-foreground">Not matched yet</span>
                  )}
                </td>
                {isLol ? (
                  <td className="py-1.5 text-xs whitespace-nowrap">
                    {p.statsOptedIn ? (
                      <span className="text-muted-foreground">Opted in</span>
                    ) : (
                      <span className="text-destructive">Not opted in</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? (
          <p className="text-muted-foreground py-3 text-sm">No players match “{query.trim()}”.</p>
        ) : null}
      </div>
    </div>
  );
}
