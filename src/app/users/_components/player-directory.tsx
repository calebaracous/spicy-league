"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import type { DirectoryPlayer } from "@/lib/players";

const LETTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"];

function letterOf(username: string): string {
  const c = username.charAt(0).toUpperCase();
  return c >= "A" && c <= "Z" ? c : "#";
}

function anchor(letter: string): string {
  return letter === "#" ? "letter-other" : `letter-${letter.toLowerCase()}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Only the stats a player actually has — a brand-new account shows none. */
function statParts(p: DirectoryPlayer): string[] {
  const parts: string[] = [];
  if (p.seasons) parts.push(plural(p.seasons, "season"));
  if (p.titles) parts.push(plural(p.titles, "title"));
  if (p.captaincies) parts.push(`Captain ×${p.captaincies}`);
  const { wins, draws, losses } = p.record;
  if (wins + draws + losses) {
    parts.push(draws ? `${wins}–${draws}–${losses}` : `${wins}–${losses}`);
  }
  if (p.tenMan.wins + p.tenMan.losses) parts.push(`10-man ${p.tenMan.wins}–${p.tenMan.losses}`);
  return parts;
}

export function PlayerDirectory({ players }: { players: DirectoryPlayer[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? players.filter(
          (p) => p.username.toLowerCase().includes(q) || p.name?.toLowerCase().includes(q),
        )
      : players;
    const byLetter = new Map<string, DirectoryPlayer[]>();
    for (const p of filtered) {
      const letter = letterOf(p.username);
      byLetter.set(letter, [...(byLetter.get(letter) ?? []), p]);
    }
    return LETTERS.flatMap((letter) => {
      const list = byLetter.get(letter);
      return list ? [{ letter, players: list }] : [];
    });
  }, [players, query]);

  const present = new Set(groups.map((g) => g.letter));

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          aria-label="Search players"
          className="h-9"
        />
        <nav aria-label="Jump to letter">
          <ul className="flex flex-wrap gap-1">
            {LETTERS.map((letter) => (
              <li key={letter}>
                {present.has(letter) ? (
                  <a
                    href={`#${anchor(letter)}`}
                    className="text-muted-foreground hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors"
                  >
                    {letter}
                  </a>
                ) : (
                  <span
                    aria-hidden
                    className="text-muted-foreground/40 inline-flex h-7 w-7 items-center justify-center text-xs"
                  >
                    {letter}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {groups.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {query.trim() ? `No players match “${query.trim()}”.` : "No players yet."}
        </p>
      ) : (
        groups.map(({ letter, players: list }) => (
          <section
            key={letter}
            id={anchor(letter)}
            aria-labelledby={`${anchor(letter)}-heading`}
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id={`${anchor(letter)}-heading`}
              className="text-muted-foreground text-sm font-medium tracking-wide uppercase"
            >
              {letter}
            </h2>
            <ul className="divide-y rounded-xl border">
              {list.map((p) => {
                const stats = statParts(p);
                return (
                  <li key={p.username}>
                    <Link
                      href={`/users/${p.username}`}
                      className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate">
                          <span className="font-medium">{p.name ?? p.username}</span>
                          {p.name ? (
                            <span className="text-muted-foreground"> @{p.username}</span>
                          ) : null}
                        </p>
                        {stats.length ? (
                          <p className="text-muted-foreground text-xs">{stats.join(" · ")}</p>
                        ) : null}
                      </div>
                      {p.rank ? (
                        <span
                          className="shrink-0 text-xs font-medium"
                          style={{ color: "var(--accent-text)" }}
                        >
                          {p.rank}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
