"use client";

import { useState, useTransition } from "react";

import { submitPick } from "./actions";
import { LiveStatusDot, TurnSoundToggle } from "@/components/live-status";
import { useSnapshotStream, useTurnAlert, useTurnSoundPref } from "@/components/use-turn-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RiotRank = {
  tier: string | null;
  rankDivision: string | null;
  lp: number | null;
};

type LolRolePrefs = {
  primaryRole?: string;
  secondaryRole?: string;
};

type Snapshot = {
  draft: { id: string; state: "pending" | "in_progress" | "paused" | "completed" };
  season: { id: string; slug: string; name: string; game: "lol" | "cs2" };
  captains: Array<{ userId: string; displayName: string; captainOrder: number }>;
  pool: Array<{
    userId: string;
    displayName: string;
    signupId: string;
    rolePrefs: unknown;
    riotRank: RiotRank | null;
  }>;
  picks: Array<{
    pickNumber: number;
    captainUserId: string;
    captainDisplayName: string;
    pickedUserId: string;
    pickedDisplayName: string;
    pickedAt: string | Date;
  }>;
  totalPicks: number;
  onTheClock: {
    pickNumber: number;
    captainUserId: string;
    captainDisplayName: string;
    captainOrder: number;
  } | null;
};

const STATE_LABELS: Record<Snapshot["draft"]["state"], string> = {
  pending: "Not started",
  in_progress: "Live",
  paused: "Paused",
  completed: "Complete",
};

const ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "JG",
  mid: "Mid",
  adc: "ADC",
  support: "Sup",
  fill: "Fill",
};

function formatRank(rank: RiotRank | null): string {
  if (!rank || !rank.tier) return "Unranked";
  const tier = rank.tier.charAt(0).toUpperCase() + rank.tier.slice(1).toLowerCase();
  // Apex tiers have no division
  const apexTiers = new Set(["Challenger", "Grandmaster", "Master"]);
  const division = apexTiers.has(tier) ? "" : ` ${rank.rankDivision ?? ""}`;
  const lp = rank.lp != null ? ` (${rank.lp} LP)` : "";
  return `${tier}${division}${lp}`.trim();
}

const TIER_ORDER = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER",
];
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 };

/** Sortable solo-queue strength; unranked sorts last (-1). */
function rankScore(rank: RiotRank | null): number {
  if (!rank?.tier) return -1;
  const tier = TIER_ORDER.indexOf(rank.tier.toUpperCase());
  if (tier < 0) return -1;
  const div = DIVISION_ORDER[rank.rankDivision?.toUpperCase() ?? ""] ?? 0;
  return tier * 10_000 + div * 1_000 + (rank.lp ?? 0);
}

const ROLE_FILTERS = ["top", "jungle", "mid", "adc", "support"] as const;
type SortKey = "rank" | "name" | "signup";

function RolePrefsDisplay({ prefs }: { prefs: LolRolePrefs }) {
  const primary = prefs.primaryRole ? (ROLE_LABELS[prefs.primaryRole] ?? prefs.primaryRole) : null;
  const secondary = prefs.secondaryRole
    ? (ROLE_LABELS[prefs.secondaryRole] ?? prefs.secondaryRole)
    : null;
  if (!primary && !secondary) return null;
  return (
    <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
      {primary ? <span className="bg-muted rounded px-1 py-0.5 font-medium">{primary}</span> : null}
      {secondary ? <span className="bg-muted/60 rounded px-1 py-0.5">{secondary}</span> : null}
    </span>
  );
}

export function LiveBoard({
  initial,
  slug,
  viewerUserId,
  isAdmin,
}: {
  initial: Snapshot;
  slug: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}) {
  const [snap, setSnap] = useState<Snapshot>(initial);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(
    initial.season.game === "lol" ? "rank" : "signup",
  );
  const [pending, startTransition] = useTransition();
  const liveStatus = useSnapshotStream<Snapshot>(`/api/draft/${slug}/stream`, setSnap);

  const onClock = snap.onTheClock;
  const isMyTurn =
    !!onClock && viewerUserId === onClock.captainUserId && snap.draft.state === "in_progress";
  const canPick = (isMyTurn || isAdmin) && snap.draft.state === "in_progress";
  const isLol = snap.season.game === "lol";
  const isCaptain = snap.captains.some((c) => c.userId === viewerUserId);
  const [soundOn] = useTurnSoundPref();
  useTurnAlert(isMyTurn, soundOn);

  const teamsByCaptain = new Map<string, Snapshot["picks"]>();
  for (const cap of snap.captains) teamsByCaptain.set(cap.userId, []);
  for (const p of snap.picks) {
    teamsByCaptain.get(p.captainUserId)?.push(p);
  }

  const needle = filter.trim().toLowerCase();
  const filtered = snap.pool
    .filter((p) => !needle || p.displayName.toLowerCase().includes(needle))
    .filter((p) => {
      if (!roleFilter) return true;
      const prefs = (p.rolePrefs ?? {}) as LolRolePrefs;
      // Fill players are willing to play anything.
      return [prefs.primaryRole, prefs.secondaryRole].some((r) => r === roleFilter || r === "fill");
    })
    .sort((a, b) =>
      sortKey === "rank"
        ? rankScore(b.riotRank) - rankScore(a.riotRank)
        : sortKey === "name"
          ? a.displayName.localeCompare(b.displayName)
          : 0,
    );

  return (
    <div className="space-y-6">
      {isMyTurn ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-5 py-4"
          style={{
            background: "rgba(185, 28, 28, 0.12)",
            border: "1px solid var(--accent)",
          }}
        >
          <div>
            <p className="text-label" style={{ color: "var(--accent-text)" }}>
              Your pick
            </p>
            <p className="mt-1 text-lg font-medium">
              You&apos;re on the clock: pick {snap.picks.length + 1} of {snap.totalPicks}.
            </p>
          </div>
          <a
            href="#draft-pool"
            className="rounded-full px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Go to the pool ↓
          </a>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Pick {Math.min(snap.picks.length + 1, snap.totalPicks)} / {snap.totalPicks}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              {isCaptain && snap.draft.state !== "completed" ? <TurnSoundToggle /> : null}
              {snap.draft.state !== "completed" ? <LiveStatusDot status={liveStatus} /> : null}
              <Badge variant={snap.draft.state === "in_progress" ? "default" : "secondary"}>
                {STATE_LABELS[snap.draft.state]}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {snap.draft.state === "completed" ? (
            <p className="text-sm">Draft complete — teams have been formed.</p>
          ) : snap.draft.state === "paused" ? (
            <p className="text-muted-foreground text-sm">The draft is paused by an admin.</p>
          ) : snap.draft.state === "pending" ? (
            <p className="text-muted-foreground text-sm">Waiting for the draft to start.</p>
          ) : onClock ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">On the clock:</span>
              <span className="font-medium">{onClock.captainDisplayName}</span>
              {!isMyTurn && isAdmin ? <Badge variant="outline">Admin override</Badge> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Teams — left, narrower */}
        <div className="space-y-4">
          {snap.captains.map((cap) => {
            const roster = teamsByCaptain.get(cap.userId) ?? [];
            const isOnClock = onClock?.captainUserId === cap.userId;
            return (
              <Card key={cap.userId} className={isOnClock ? "border-primary" : undefined}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">
                      <span className="text-muted-foreground font-mono text-xs">
                        {cap.captainOrder}.
                      </span>{" "}
                      {cap.displayName}
                    </CardTitle>
                    {isOnClock ? <Badge>On the clock</Badge> : null}
                  </div>
                </CardHeader>
                <CardContent>
                  {roster.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No picks yet.</p>
                  ) : (
                    <ol className="space-y-1">
                      {roster.map((r) => (
                        <li key={r.pickNumber} className="text-sm">
                          <span className="text-muted-foreground font-mono text-xs">
                            #{r.pickNumber}
                          </span>{" "}
                          {r.pickedDisplayName}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Pool — right, wider */}
        <Card className="scroll-mt-24 self-start" id="draft-pool">
          <CardHeader>
            <CardTitle className="text-base">Available pool ({snap.pool.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {isLol ? (
                <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by role">
                  {[null, ...ROLE_FILTERS].map((r) => (
                    <button
                      key={r ?? "all"}
                      type="button"
                      aria-pressed={roleFilter === r}
                      onClick={() => setRoleFilter(r)}
                      className={
                        roleFilter === r
                          ? "bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium"
                          : "bg-muted text-muted-foreground hover:text-foreground rounded-md px-2 py-1 text-xs"
                      }
                    >
                      {r ? ROLE_LABELS[r] : "All"}
                    </button>
                  ))}
                </div>
              ) : null}
              <label className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs">
                Sort
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="border-input h-7 rounded-md border bg-transparent px-1.5 text-xs"
                >
                  {isLol ? <option value="rank">Rank</option> : null}
                  <option value="name">Name</option>
                  <option value="signup">Signup order</option>
                </select>
              </label>
            </div>
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name…"
              aria-label="Filter the available pool by name"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            />
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm">No players match.</p>
            ) : (
              <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                {filtered.map((p) => {
                  const lolPrefs =
                    isLol && p.rolePrefs && typeof p.rolePrefs === "object"
                      ? (p.rolePrefs as LolRolePrefs)
                      : null;
                  return (
                    <li
                      key={p.userId}
                      className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-2 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {p.displayName}
                      </span>
                      {isLol ? (
                        <>
                          {lolPrefs ? <RolePrefsDisplay prefs={lolPrefs} /> : null}
                          <span className="text-muted-foreground shrink-0 text-xs">
                            {formatRank(p.riotRank)}
                          </span>
                        </>
                      ) : null}
                      {canPick ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          className="shrink-0"
                          onClick={() => {
                            if (!confirm(`Pick ${p.displayName}?`)) return;
                            startTransition(async () => {
                              await submitPick(slug, p.userId, snap.picks.length + 1);
                            });
                          }}
                        >
                          Pick
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pick log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pick log</CardTitle>
        </CardHeader>
        <CardContent>
          {snap.picks.length === 0 ? (
            <p className="text-muted-foreground text-sm">No picks yet.</p>
          ) : (
            <ol className="space-y-1 text-sm">
              {[...snap.picks].reverse().map((p) => (
                <li key={p.pickNumber} className="flex gap-2">
                  <span className="text-muted-foreground w-10 font-mono text-xs">
                    #{p.pickNumber}
                  </span>
                  <span>
                    <span className="font-medium">{p.captainDisplayName}</span>
                    <span className="text-muted-foreground"> picks </span>
                    <span className="font-medium">{p.pickedDisplayName}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
