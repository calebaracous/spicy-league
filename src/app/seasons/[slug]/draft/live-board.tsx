"use client";

import { useEffect, useState, useTransition } from "react";

import { submitPick } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Snapshot = {
  draft: { id: string; state: "pending" | "in_progress" | "paused" | "completed" };
  season: { id: string; slug: string; name: string };
  captains: Array<{ userId: string; displayName: string; captainOrder: number }>;
  pool: Array<{ userId: string; displayName: string; signupId: string }>;
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
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const es = new EventSource(`/api/draft/${slug}/stream`);
    es.addEventListener("update", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as Snapshot;
        if (data) setSnap(data);
      } catch {
        // ignore
      }
    });
    es.onerror = () => {
      // Browser auto-reconnects; nothing to do
    };
    return () => es.close();
  }, [slug]);

  const onClock = snap.onTheClock;
  const isMyTurn = !!onClock && viewerUserId === onClock.captainUserId;
  const canPick = (isMyTurn || isAdmin) && snap.draft.state === "in_progress";

  const teamsByCaptain = new Map<string, Snapshot["picks"]>();
  for (const cap of snap.captains) teamsByCaptain.set(cap.userId, []);
  for (const p of snap.picks) {
    teamsByCaptain.get(p.captainUserId)?.push(p);
  }

  const filtered = filter
    ? snap.pool.filter((p) => p.displayName.toLowerCase().includes(filter.toLowerCase()))
    : snap.pool;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              Pick {Math.min(snap.picks.length + 1, snap.totalPicks)} / {snap.totalPicks}
            </CardTitle>
            <Badge variant={snap.draft.state === "in_progress" ? "default" : "secondary"}>
              {STATE_LABELS[snap.draft.state]}
            </Badge>
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
              {isMyTurn ? <Badge>Your pick</Badge> : null}
              {!isMyTurn && isAdmin ? <Badge variant="outline">Admin override</Badge> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Pool */}
        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">Available pool ({snap.pool.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name…"
              className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
            />
            {filtered.length === 0 ? (
              <p className="text-muted-foreground text-sm">No players match.</p>
            ) : (
              <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
                {filtered.map((p) => (
                  <li
                    key={p.userId}
                    className="hover:bg-muted/50 flex items-center justify-between gap-2 rounded-md px-2 py-1"
                  >
                    <span className="text-sm">{p.displayName}</span>
                    {canPick ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm(`Pick ${p.displayName}?`)) return;
                          startTransition(async () => {
                            await submitPick(slug, p.userId);
                          });
                        }}
                      >
                        Pick
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Teams */}
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
