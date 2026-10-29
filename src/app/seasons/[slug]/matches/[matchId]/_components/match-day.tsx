"use client";

import { useEffect, useState, useTransition } from "react";

import { LiveStatusDot } from "@/components/live-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSnapshotStream } from "@/components/use-turn-alert";
import type { MatchDaySnapshot } from "@/lib/match-day";
import { griefLine, RPS_THROWS, type RpsRound, type RpsThrow } from "@/lib/rps";
import {
  adminResetMatchDay,
  pickSide,
  readyRps,
  throwRps,
  unreadyRps,
  type MatchDayActionResult,
} from "../../match-day-actions";

// Side selection card (docs/MATCH-DAY.md): ready up → RPS rounds → the winner
// picks blue/red for game 1. Server-authoritative: deadlines come from the
// snapshot and the countdowns are corrected by the server clock offset.

const THROW_LABEL: Record<RpsThrow, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};
const THROW_EMOJI: Record<RpsThrow, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const BLUE = "#3b82f6";
const RED = "#ef4444";

type Snap = MatchDaySnapshot;

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<MatchDayActionResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) setError(result.error);
      } catch {
        setError("Something went wrong. Refresh the page and try again.");
      }
    });
  }
  return { pending, error, run };
}

/** Milliseconds left until `deadline` on the server's clock, re-rendered ~5×/s. */
function useCountdown(deadline: string | null, serverNow: string): number | null {
  // Local clock reading at the last tick, and how far the server's is ahead.
  const [clock, setClock] = useState<{ now: number; offset: number } | null>(null);
  useEffect(() => {
    if (!deadline) return;
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setClock({ now: Date.now(), offset });
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 200);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [deadline, serverNow]);
  if (!deadline || !clock) return null;
  return Math.max(0, Date.parse(deadline) - (clock.now + clock.offset));
}

function Countdown({ ms, total }: { ms: number | null; total: number }) {
  if (ms === null) return null;
  const pct = Math.max(0, Math.min(100, (ms / total) * 100));
  return (
    <div className="space-y-1">
      <div className="text-center text-3xl font-semibold tabular-nums">{Math.ceil(ms / 1000)}</div>
      <div className="bg-muted h-1 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }}
        />
      </div>
    </div>
  );
}

export function MatchDayCard({
  initial,
  slug,
  matchId,
}: {
  initial: Snap;
  slug: string;
  matchId: string;
}) {
  const [snap, setSnap] = useState<Snap>(initial);
  const liveStatus = useSnapshotStream<Snap>(`/api/matches/${matchId}/stream`, setSnap);
  const { pending, error, run } = useAction();

  const game1 = snap.games.find((g) => g.gameNumber === 1) ?? null;
  const teamName = (id: string | null) =>
    id === snap.home.teamId ? snap.home.name : id === snap.away.teamId ? snap.away.name : "?";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Side selection</CardTitle>
        {snap.open ? <LiveStatusDot status={liveStatus} /> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {game1?.blueTeamId ? (
          <SidesSet snap={snap} teamName={teamName} />
        ) : game1 ? (
          <SidePick
            snap={snap}
            game={game1}
            teamName={teamName}
            pending={pending}
            onPick={(side) => run(() => pickSide(slug, matchId, 1, side))}
          />
        ) : !snap.open ? (
          <p className="text-muted-foreground">No side selection was played for this match.</p>
        ) : snap.rps && (snap.rps.state === "throwing" || snap.rps.state === "revealed") ? (
          <RpsRoundView
            snap={snap}
            pending={pending}
            onThrow={(choice) => run(() => throwRps(slug, matchId, snap.rps!.round, choice))}
          />
        ) : (
          <ReadyUp
            snap={snap}
            pending={pending}
            onReady={() => run(() => readyRps(slug, matchId))}
            onUnready={() => run(() => unreadyRps(slug, matchId))}
          />
        )}

        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}

        {snap.viewer.isAdmin && (snap.rps || snap.games.length > 0) ? (
          <div className="border-t pt-3">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm("Reset side selection for this match? RPS and game sides are wiped."))
                  run(() => adminResetMatchDay(slug, matchId));
              }}
            >
              Reset side selection
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Phases ───────────────────────────────────────────────────────────────────

function ReadyUp({
  snap,
  pending,
  onReady,
  onUnready,
}: {
  snap: Snap;
  pending: boolean;
  onReady: () => void;
  onUnready: () => void;
}) {
  const rps = snap.rps;
  const { viewer } = snap;
  const mySide =
    viewer.teamId === snap.home.teamId
      ? "home"
      : viewer.teamId === snap.away.teamId
        ? "away"
        : null;
  const mySeat = mySide && rps ? rps[mySide].seat : null;
  const lastRound = rps?.history.at(-1);
  const afkReset = lastRound?.outcome === "void" && !lastRound.home && !lastRound.away;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        Rock paper scissors decides who picks the side for game 1. One captain per team readies up;
        when both are in, the first round starts.
      </p>
      {afkReset ? (
        <p className="text-muted-foreground text-xs">
          Both captains went AFK for {lastRound.round > 1 ? "several rounds" : "a round"}, so RPS
          was reset. Ready up again.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        {(["home", "away"] as const).map((side) => {
          const seat = rps?.[side].seat ?? null;
          return (
            <div key={side} className="rounded-lg border p-3">
              <div className="font-medium">{snap[side].name}</div>
              <div className={seat ? "text-sm" : "text-muted-foreground text-sm"}>
                {seat ? `✓ ${seat.name} is ready` : "Waiting for a captain"}
              </div>
            </div>
          );
        })}
      </div>
      {mySide ? (
        mySeat?.userId === viewer.userId ? (
          <Button variant="outline" disabled={pending} onClick={onUnready}>
            Unready
          </Button>
        ) : mySeat ? (
          <p className="text-muted-foreground">{mySeat.name} is playing for your team.</p>
        ) : (
          <Button disabled={pending} onClick={onReady}>
            Ready up for rock paper scissors
          </Button>
        )
      ) : null}
    </div>
  );
}

function RpsRoundView({
  snap,
  pending,
  onThrow,
}: {
  snap: Snap;
  pending: boolean;
  onThrow: (choice: RpsThrow) => void;
}) {
  const rps = snap.rps!;
  const ms = useCountdown(rps.state === "throwing" ? rps.throwDeadline : null, snap.serverNow);
  const { viewer } = snap;
  const mySide =
    rps.home.seat?.userId === viewer.userId
      ? "home"
      : rps.away.seat?.userId === viewer.userId
        ? "away"
        : null;
  const last = rps.history.at(-1);

  if (rps.state === "revealed" && last) return <Reveal snap={snap} round={last} />;

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-center text-xs tracking-wide uppercase">
        Round {rps.round}
      </div>
      <Countdown ms={ms} total={10_000} />
      <div className="grid grid-cols-2 gap-3 text-center">
        {(["home", "away"] as const).map((side) => (
          <div key={side} className="rounded-lg border p-3">
            <div className="font-medium">{snap[side].name}</div>
            <div className="text-muted-foreground text-xs">{rps[side].seat?.name ?? "?"}</div>
            <div className="mt-1 text-sm">{rps[side].thrown ? "✓ Thrown" : "Thinking…"}</div>
          </div>
        ))}
      </div>
      {mySide ? (
        viewer.myThrow ? (
          <p className="text-center">
            You threw {THROW_EMOJI[viewer.myThrow]} {THROW_LABEL[viewer.myThrow]}. Waiting for the
            other captain…
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {RPS_THROWS.map((t) => (
              <Button
                key={t}
                variant="outline"
                className="h-20 flex-col gap-1 text-base"
                disabled={pending}
                onClick={() => onThrow(t)}
              >
                <span className="text-3xl" aria-hidden>
                  {THROW_EMOJI[t]}
                </span>
                {THROW_LABEL[t]}
              </Button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function Reveal({ snap, round }: { snap: Snap; round: RpsRound }) {
  const rps = snap.rps!;
  const seatName = (side: "home" | "away") => rps[side].seat?.name ?? snap[side].name;
  return (
    <div className="space-y-4 text-center">
      <div className="text-muted-foreground text-xs tracking-wide uppercase">
        Round {round.round}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(["home", "away"] as const).map((side) => {
          const t = round[side];
          const won = round.outcome === side;
          return (
            <div
              key={side}
              className="rounded-lg border p-3"
              style={won ? { borderColor: "var(--accent)" } : undefined}
            >
              <div className="text-5xl" aria-hidden>
                {t ? THROW_EMOJI[t] : "💤"}
              </div>
              <div className="mt-1 font-medium">{t ? THROW_LABEL[t] : "No throw"}</div>
              <div className="text-muted-foreground text-xs">{seatName(side)}</div>
            </div>
          );
        })}
      </div>
      <p className="text-base font-medium">
        {round.outcome === "home" || round.outcome === "away"
          ? `${snap[round.outcome].name} wins rock paper scissors!`
          : round.outcome === "tie"
            ? "Tie! Go again."
            : "Replaying the round."}
      </p>
      {round.outcome === "void"
        ? (["home", "away"] as const)
            .filter((side) => !round[side])
            .map((side) => (
              <p key={side} className="text-destructive">
                {griefLine(seatName(side), round.round + (side === "away" ? 1 : 0))}
              </p>
            ))
        : null}
    </div>
  );
}

function SidePick({
  snap,
  game,
  teamName,
  pending,
  onPick,
}: {
  snap: Snap;
  game: Snap["games"][number];
  teamName: (id: string | null) => string;
  pending: boolean;
  onPick: (side: "blue" | "red") => void;
}) {
  const ms = useCountdown(game.sideDeadline, snap.serverNow);
  const mine = snap.viewer.teamId !== null && snap.viewer.teamId === game.sideChooserTeamId;
  const winRound = snap.rps?.history.at(-1);
  return (
    <div className="space-y-4">
      {winRound && winRound.home && winRound.away ? (
        <p className="text-center">
          {THROW_EMOJI[winRound.home]} vs {THROW_EMOJI[winRound.away]} ·{" "}
          <span className="font-medium">{teamName(game.sideChooserTeamId)}</span> won rock paper
          scissors.
        </p>
      ) : null}
      <Countdown ms={ms} total={60_000} />
      {mine ? (
        <>
          <p className="text-center">Pick your side for game 1. Out of time = random side.</p>
          <div className="grid grid-cols-2 gap-3">
            <Button
              className="h-14 text-base text-white"
              style={{ backgroundColor: BLUE }}
              disabled={pending}
              onClick={() => onPick("blue")}
            >
              Blue side
            </Button>
            <Button
              className="h-14 text-base text-white"
              style={{ backgroundColor: RED }}
              disabled={pending}
              onClick={() => onPick("red")}
            >
              Red side
            </Button>
          </div>
        </>
      ) : (
        <p className="text-muted-foreground text-center">
          {teamName(game.sideChooserTeamId)} is choosing a side for game 1…
        </p>
      )}
    </div>
  );
}

function SidesSet({ snap, teamName }: { snap: Snap; teamName: (id: string | null) => string }) {
  return (
    <ul className="space-y-2">
      {snap.games
        .filter((g) => g.blueTeamId && g.redTeamId)
        .map((g) => (
          <li key={g.gameNumber} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-muted-foreground w-16">Game {g.gameNumber}</span>
            <span className="font-medium" style={{ color: BLUE }}>
              {teamName(g.blueTeamId)} blue
            </span>
            <span className="text-muted-foreground">vs</span>
            <span className="font-medium" style={{ color: RED }}>
              {teamName(g.redTeamId)} red
            </span>
            <span className="text-muted-foreground text-xs">
              {g.sideChosenVia === "rps"
                ? `${teamName(g.sideChooserTeamId)} won RPS and chose`
                : g.sideChosenVia === "auto"
                  ? "random, the clock ran out"
                  : g.sideChosenVia === "loser"
                    ? `${teamName(g.sideChooserTeamId)} chose (lost the last game)`
                    : "set by an admin"}
            </span>
          </li>
        ))}
    </ul>
  );
}
