"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { LiveStatusDot } from "@/components/live-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSnapshotStream } from "@/components/use-turn-alert";
import type { MatchDaySnapshot } from "@/lib/match-day";
import { bestOfLabel } from "@/lib/match-format";
import { griefLine, RPS_THROWS, type RpsRound, type RpsThrow } from "@/lib/rps";
import {
  adminResetMatchDay,
  assignPicks,
  flagGameResult,
  pickSide,
  reportGameWinner,
  readyRps,
  throwRps,
  unreadyRps,
  type MatchDayActionResult,
} from "../../match-day-actions";
import { DraftRecap, type ChampionNames, type LineupOption } from "./draft-recap";

// Side selection card (docs/MATCH-DAY.md): ready up → RPS rounds → the winner
// picks blue/red for game 1. Server-authoritative: deadlines come from the
// snapshot and the countdowns are corrected by the server clock offset.

const THROW_LABEL: Record<RpsThrow, string> = {
  rock: "Rock",
  paper: "Paper",
  scissors: "Scissors",
};
const THROW_EMOJI: Record<RpsThrow, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
export const BLUE = "#3b82f6";
export const RED = "#ef4444";

type Snap = MatchDaySnapshot;

/** Where the card is; an error from an earlier phase stops showing once it moves on. */
function phaseKey(snap: Snap): string {
  const r = snap.rps;
  const games = snap.games.map(
    (g) =>
      `${g.blueTeamId ?? "-"}/${g.winnerTeamId ?? "-"}/${g.draft.state}/${g.draft.actions.length}`,
  );
  return `${r?.state ?? "none"}:${r?.round ?? 0}:${games.join()}`;
}

/** Runs an action and applies the snapshot it returns straight away. */
export function useAction(snap: Snap, apply: (next: Snap) => void) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; phase: string } | null>(null);
  function run(action: () => Promise<MatchDayActionResult>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.snap) apply(result.snap);
        if (result?.error) {
          setError({ message: result.error, phase: phaseKey(result.snap ?? snap) });
        }
      } catch {
        setError({ message: "Something went wrong. Refresh the page and try again.", phase: "" });
      }
    });
  }
  const shown =
    error && (error.phase === "" || error.phase === phaseKey(snap)) ? error.message : null;
  return { pending, error: shown, run };
}

/** Milliseconds left until `deadline` on the server's clock, re-rendered ~5×/s. */
export function useCountdown(deadline: string | null, serverNow: string): number | null {
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

export function Countdown({ ms, total }: { ms: number | null; total: number }) {
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
  champions,
  lineups,
}: {
  initial: Snap;
  slug: string;
  matchId: string;
  /** Champion names + icon patch for draft recaps; null if Data Dragon is down. */
  champions: ChampionNames | null;
  /** Who played for each team (match lineup), for assigning picks to players. */
  lineups: Record<string, LineupOption[]>;
}) {
  const [snap, setSnap] = useState<Snap>(initial);
  // Action results and stream frames race; keep whichever the server made last.
  const apply = (next: Snap) =>
    setSnap((prev) => (Date.parse(next.serverNow) >= Date.parse(prev.serverNow) ? next : prev));
  const liveStatus = useSnapshotStream<Snap>(`/api/matches/${matchId}/stream`, apply);
  const { pending, error, run } = useAction(snap, apply);

  // Only this card is live. When the series decides itself the rest of the
  // page (status badge, Result card, sub form, report form) is stale, so
  // re-render it once the match closes.
  const router = useRouter();
  const wasOpen = useRef(snap.open);
  useEffect(() => {
    if (wasOpen.current && !snap.open) router.refresh();
    wasOpen.current = snap.open;
  }, [snap.open, router]);

  // The game whose side is being picked, else the one being played.
  const sidePick = snap.games.find((g) => !g.blueTeamId) ?? null;
  const current = snap.games.find((g) => g.blueTeamId && !g.winnerTeamId) ?? null;
  const { series } = snap;
  const draftHref = (n: number) => `/seasons/${slug}/matches/${matchId}/games/${n}`;
  const teamName = (id: string | null) =>
    id === snap.home.teamId ? snap.home.name : id === snap.away.teamId ? snap.away.name : "?";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">Match day</CardTitle>
        {snap.open ? <LiveStatusDot status={liveStatus} /> : null}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {series.played > 0 ? (
          <p className="text-center text-base">
            {bestOfLabel(snap.bestOf)} · {snap.home.name}{" "}
            <span className="font-semibold tabular-nums">
              {series.homeWins}–{series.awayWins}
            </span>{" "}
            {snap.away.name}
            {series.over ? (
              <span className="text-muted-foreground block text-sm">
                {series.winnerTeamId
                  ? `${teamName(series.winnerTeamId)} win the series.`
                  : "Series drawn."}{" "}
                {snap.open ? "" : "Result confirmed."}
              </span>
            ) : null}
          </p>
        ) : null}

        {snap.open && sidePick ? (
          <SidePick
            snap={snap}
            game={sidePick}
            teamName={teamName}
            pending={pending}
            onPick={(side) => run(() => pickSide(slug, matchId, sidePick.gameNumber, side))}
          />
        ) : snap.open && current ? (
          <ResultPrompt
            snap={snap}
            game={current}
            draftHref={draftHref(current.gameNumber)}
            pending={pending}
            onReport={(winner) =>
              run(() => reportGameWinner(slug, matchId, current.gameNumber, winner))
            }
          />
        ) : snap.games.length > 0 ? null : !snap.open ? (
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

        {snap.games.some((g) => g.blueTeamId) ? (
          <GamesList
            snap={snap}
            teamName={teamName}
            draftHref={draftHref}
            recap={(g) =>
              champions && g.draft.actions.length > 0 ? (
                <DraftRecap
                  game={g}
                  champions={champions}
                  lineups={lineups}
                  canAssign={(side) =>
                    snap.viewer.isAdmin ||
                    (snap.viewer.teamId !== null &&
                      snap.viewer.teamId === (side === "blue" ? g.blueTeamId : g.redTeamId))
                  }
                  pending={pending}
                  onAssign={(side, assignments) =>
                    run(() => assignPicks(slug, matchId, g.gameNumber, side, assignments))
                  }
                />
              ) : null
            }
            pending={pending}
            onReport={(n, winner) => run(() => reportGameWinner(slug, matchId, n, winner))}
            onFlag={(n) => run(() => flagGameResult(slug, matchId, n))}
          />
        ) : null}

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
                if (
                  confirm(
                    "Reset match day for this match? RPS, game sides and game results are wiped (the series result stays).",
                  )
                )
                  run(() => adminResetMatchDay(slug, matchId));
              }}
            >
              Reset match day
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
      {mySide && ms === 0 && !viewer.myThrow ? (
        <p className="text-muted-foreground text-center">Time&apos;s up…</p>
      ) : mySide ? (
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

type Game = Snap["games"][number];

function SidePick({
  snap,
  game,
  teamName,
  pending,
  onPick,
}: {
  snap: Snap;
  game: Game;
  teamName: (id: string | null) => string;
  pending: boolean;
  onPick: (side: "blue" | "red") => void;
}) {
  const ms = useCountdown(game.sideDeadline, snap.serverNow);
  const mine = snap.viewer.teamId !== null && snap.viewer.teamId === game.sideChooserTeamId;
  const n = game.gameNumber;
  const winRound = snap.rps?.history.at(-1);
  return (
    <div className="space-y-4">
      {n === 1 && winRound && winRound.home && winRound.away ? (
        <p className="text-center">
          {THROW_EMOJI[winRound.home]} vs {THROW_EMOJI[winRound.away]} ·{" "}
          <span className="font-medium">{teamName(game.sideChooserTeamId)}</span> won rock paper
          scissors.
        </p>
      ) : n > 1 ? (
        <p className="text-center">
          <span className="font-medium">{teamName(game.sideChooserTeamId)}</span> lost game {n - 1},
          so they pick the side for game {n}.
        </p>
      ) : null}
      <Countdown ms={ms} total={60_000} />
      {mine ? (
        <>
          <p className="text-center">Pick your side for game {n}. Out of time = random side.</p>
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
          {teamName(game.sideChooserTeamId)} is choosing a side for game {n}…
        </p>
      )}
    </div>
  );
}

/** "Who won game N?" for the game being played. */
const DRAFT_STATUS: Record<Game["draft"]["state"], string> = {
  waiting: "waiting for both captains to ready up",
  countdown: "starting",
  drafting: "in progress",
  complete: "complete",
  skipped: "skipped",
};

/** The game being played: its draft first, then "who won?". */
function ResultPrompt({
  snap,
  game,
  draftHref,
  pending,
  onReport,
}: {
  snap: Snap;
  game: Game;
  draftHref: string;
  pending: boolean;
  onReport: (winnerTeamId: string) => void;
}) {
  const canReport = snap.viewer.teamId !== null || snap.viewer.isAdmin;
  const drafted = game.draft.state === "complete" || game.draft.state === "skipped";
  if (!drafted) {
    const step = Math.min(game.draft.actions.length + 1, 20);
    return (
      <div className="space-y-3 text-center">
        <p>
          Game {game.gameNumber} draft: {DRAFT_STATUS[game.draft.state]}
          {game.draft.state === "drafting" ? ` (step ${step}/20)` : ""}.
        </p>
        <Link href={draftHref} className={buttonVariants({ className: "h-11 px-6" })}>
          Open draft room
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-center">
      <p>
        Game {game.gameNumber} is on. Play it, then record the winner
        {snap.series.played === 0 ? "" : " (the loser picks the next side)"}.
      </p>
      {canReport ? (
        <div className="grid grid-cols-2 gap-3">
          {[snap.home, snap.away].map((t) => (
            <Button
              key={t.teamId}
              variant="outline"
              className="h-12"
              disabled={pending}
              onClick={() => onReport(t.teamId)}
            >
              {t.name} won
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">Waiting for a captain to record the result.</p>
      )}
    </div>
  );
}

function sideNote(g: Game, teamName: (id: string | null) => string): string {
  return g.sideChosenVia === "rps"
    ? `${teamName(g.sideChooserTeamId)} won RPS and chose`
    : g.sideChosenVia === "auto"
      ? "random, the clock ran out"
      : g.sideChosenVia === "loser"
        ? `${teamName(g.sideChooserTeamId)} chose (lost the last game)`
        : "set by an admin";
}

/** Every game with sides set: sides, result, and the captains' correct / flag buttons. */
function GamesList({
  snap,
  teamName,
  draftHref,
  recap,
  pending,
  onReport,
  onFlag,
}: {
  snap: Snap;
  teamName: (id: string | null) => string;
  draftHref: (gameNumber: number) => string;
  recap: (game: Game) => ReactNode;
  pending: boolean;
  onReport: (gameNumber: number, winnerTeamId: string) => void;
  onFlag: (gameNumber: number) => void;
}) {
  const captain = snap.viewer.teamId !== null;
  const games = snap.games.filter((g) => g.blueTeamId && g.redTeamId);
  return (
    <ul className="divide-y">
      {games.map((g) => {
        const next = snap.games.find((x) => x.gameNumber === g.gameNumber + 1);
        // Captains can fix a result until the next game's sides are set.
        const correctable = snap.open && captain && g.winnerTeamId && !next?.blueTeamId;
        const other = g.winnerTeamId === snap.home.teamId ? snap.away.teamId : snap.home.teamId;
        return (
          <li key={g.gameNumber} className="space-y-1 py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted-foreground w-16">Game {g.gameNumber}</span>
              <span className="font-medium" style={{ color: BLUE }}>
                {teamName(g.blueTeamId)} blue
              </span>
              <span className="text-muted-foreground">vs</span>
              <span className="font-medium" style={{ color: RED }}>
                {teamName(g.redTeamId)} red
              </span>
              <span className="text-muted-foreground text-xs">{sideNote(g, teamName)}</span>
              {g.draft.state !== "skipped" ? (
                <Link
                  href={draftHref(g.gameNumber)}
                  className="text-xs underline-offset-2 hover:underline"
                >
                  {g.draft.state === "complete" ? "Draft" : "Draft room →"}
                </Link>
              ) : null}
            </div>
            <div className="pl-16 sm:pl-[4.75rem]">{recap(g)}</div>
            {g.winnerTeamId ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-16 sm:pl-[4.75rem]">
                <span>
                  🏆 <span className="font-medium">{teamName(g.winnerTeamId)}</span> won
                </span>
                {g.resultReportedBy ? (
                  <span className="text-muted-foreground text-xs">
                    recorded by {g.resultReportedBy}
                  </span>
                ) : null}
                {g.resultFlagged ? (
                  <span className="text-destructive text-xs">Flagged for an admin</span>
                ) : null}
                {correctable ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() => onReport(g.gameNumber, other)}
                  >
                    Wrong? {teamName(other)} won
                  </Button>
                ) : captain && !g.resultFlagged ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`Flag the game ${g.gameNumber} result for an admin to check?`))
                        onFlag(g.gameNumber);
                    }}
                  >
                    Flag as wrong
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
