"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveStatusDot } from "@/components/live-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSnapshotStream } from "@/components/use-turn-alert";
import { DRAFT_BAN_MS, DRAFT_COUNTDOWN_MS, DRAFT_PICK_MS, stepMs } from "@/lib/draft-clock";
import {
  championIconUrl,
  draftBoard,
  nextStep,
  stepAt,
  unavailableReason,
  type DraftAction,
  type DraftSide,
  type DraftStep,
  type UnavailableReason,
} from "@/lib/draft-room";
import type { MatchDaySnapshot } from "@/lib/match-day";
import {
  adminSetDraft,
  adminUndoDraftStep,
  hoverChampion,
  lockChampion,
  readyDraft,
} from "../../match-day-actions";
import { signInHref } from "@/lib/safe-redirect";
import {
  BLUE,
  Countdown,
  formatSeconds,
  RED,
  SignInPrompt,
  useAction,
  useCountdown,
} from "./match-day";

// The match-day draft room (docs/MATCH-DAY.md, phase 3): both captains ready
// up → 3s countdown → 20 pick/ban steps (60s bans, 2-minute picks; a missed
// pick pauses for an admin). Server-authoritative like
// the card: deadlines come from the snapshot, timeouts are applied on the
// server, and every action returns a fresh snapshot.

type Snap = MatchDaySnapshot;
type Champion = { key: string; name: string };
export type ChampionList = { version: string; champions: Champion[] };

const SIDE_COLOR: Record<DraftSide, string> = { blue: BLUE, red: RED };
const REASON_LABEL: Record<UnavailableReason, string> = {
  banned: "Banned",
  picked: "Picked",
  fearless: "Fearless",
  disabled: "Disabled",
};

/** Lowercase letters and digits only, so "kai sa" finds Kai'Sa. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** "BLUE BAN 2": the side, kind and that side's count of that kind. */
function stepLabel(step: DraftStep, actions: readonly DraftAction[]): string {
  const n = actions.filter((a) => a.side === step.side && a.kind === step.kind).length + 1;
  return `${step.side.toUpperCase()} ${step.kind.toUpperCase()} ${n}`;
}

export function DraftRoom({
  initial,
  catalog,
  slug,
  matchId,
  gameNumber,
}: {
  initial: Snap;
  catalog: ChampionList;
  slug: string;
  matchId: string;
  gameNumber: number;
}) {
  const [snap, setSnap] = useState<Snap>(initial);
  const apply = (next: Snap) =>
    setSnap((prev) => (Date.parse(next.serverNow) >= Date.parse(prev.serverNow) ? next : prev));
  const liveStatus = useSnapshotStream<Snap>(`/api/matches/${matchId}/stream`, apply);
  const { pending, error, run } = useAction(snap, apply);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const game = snap.games.find((g) => g.gameNumber === gameNumber);
  const teamName = (id: string | null) =>
    id === snap.home.teamId ? snap.home.name : id === snap.away.teamId ? snap.away.name : "?";
  const names = useMemo(
    () => new Map(catalog.champions.map((c) => [c.key, c.name])),
    [catalog.champions],
  );
  const q = normalize(query);
  const shown = useMemo(
    () => (q ? catalog.champions.filter((c) => normalize(c.name).includes(q)) : catalog.champions),
    [catalog.champions, q],
  );

  if (!game?.blueTeamId || !game.redTeamId) {
    return (
      <p className="text-muted-foreground text-sm">This game&apos;s sides aren&apos;t set yet.</p>
    );
  }
  const { draft } = game;
  const actions = draft.actions;
  const step = draft.state === "drafting" ? stepAt(nextStep(actions)) : null;
  const viewerSide: DraftSide | null =
    snap.viewer.teamId === game.blueTeamId
      ? "blue"
      : snap.viewer.teamId === game.redTeamId
        ? "red"
        : null;
  const myTurn = !!step && snap.open && (viewerSide === step.side || snap.viewer.isAdmin);
  const priorGamePicks = snap.games
    .filter((g) => g.gameNumber < gameNumber)
    .flatMap((g) => g.draft.actions)
    .filter((a) => a.kind === "pick" && a.championKey)
    .map((a) => a.championKey!);
  const rules = {
    actions,
    priorGamePicks,
    disabled: snap.disabledChampions,
    fearless: snap.fearless,
  };
  // A selection the server has since taken (or a step that moved on) is void.
  const choice = selected && myTurn && !unavailableReason(selected, rules) ? selected : null;
  const board = draftBoard(actions);
  const hover = { blue: draft.blueHover, red: draft.redHover };
  const stepColor = step ? SIDE_COLOR[step.side] : "var(--accent)";

  // The hover only shows everyone what's being considered, and Lock in sends
  // the champion itself, so it runs outside `run`: it never blocks Lock in or
  // the grid, and a late one (the step already moved on) fails harmlessly.
  const choose = (key: string) => {
    if (!myTurn || !step) return;
    setSelected(key);
    hoverChampion(slug, matchId, gameNumber, step.step, key)
      .then((result) => {
        if (result?.snap) apply(result.snap);
      })
      .catch(() => {});
  };
  const lock = (key: string | null) => {
    if (!step) return;
    setSelected(null);
    setQuery("");
    run(() => lockChampion(slug, matchId, gameNumber, step.step, key));
  };
  // Enter selects the exact (or only) match; Enter again locks it in.
  const onSearchEnter = () => {
    if (!myTurn || pending) return;
    const open = shown.filter((c) => !unavailableReason(c.key, rules));
    const match = open.find((c) => normalize(c.name) === q) ?? (open.length === 1 ? open[0] : null);
    if (!match) return;
    if (match.key === choice) lock(match.key);
    else choose(match.key);
  };

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <Link
          href={`/seasons/${slug}/matches/${matchId}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to the match
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading">
            Game {gameNumber} draft:{" "}
            <span style={{ color: BLUE }}>{teamName(game.blueTeamId)}</span> vs{" "}
            <span style={{ color: RED }}>{teamName(game.redTeamId)}</span>
          </h1>
          {snap.open && draft.state !== "complete" && draft.state !== "skipped" ? (
            <LiveStatusDot status={liveStatus} />
          ) : null}
        </div>
        {snap.fearless ? (
          <p className="text-muted-foreground text-xs">
            Fearless: champions picked in earlier games of this match are out for both teams
            {priorGamePicks.length ? ` (${priorGamePicks.length} so far)` : ""}.
          </p>
        ) : null}
      </header>

      <StatusBar
        snap={snap}
        game={game}
        step={step}
        viewerSide={viewerSide}
        myTurn={myTurn}
        teamName={teamName}
        matchHref={`/seasons/${slug}/matches/${matchId}`}
        pending={pending}
        onReady={(side, ready) => run(() => readyDraft(slug, matchId, gameNumber, side, ready))}
      />

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {snap.open &&
      !snap.viewer.userId &&
      draft.state !== "complete" &&
      draft.state !== "skipped" ? (
        <SignInPrompt
          href={signInHref(`/seasons/${slug}/matches/${matchId}/games/${gameNumber}`)}
        />
      ) : null}

      {/* Phones: both teams side by side as compact icon rows, the grid below. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] md:gap-4">
        <SideColumn
          side="blue"
          name={teamName(game.blueTeamId)}
          board={board.blue}
          hover={step?.side === "blue" ? hover.blue : null}
          onClock={step?.side === "blue" ? step.kind : null}
          names={names}
          version={catalog.version}
        />
        <div className="order-last col-span-2 space-y-3 md:order-none md:col-span-1">
          {/* Sticky so the clock, search and Lock in stay in reach while scrolling the grid. */}
          <div className="bg-background/95 sticky top-14 z-10 space-y-2 rounded-lg border p-2 backdrop-blur">
            {step ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <StepClock
                  label={stepLabel(step, actions)}
                  color={stepColor}
                  deadline={draft.stepDeadline}
                  serverNow={snap.serverNow}
                />
                {myTurn ? (
                  <span className="text-sm">
                    {choice ? (
                      <>
                        {step.kind === "ban" ? "Ban" : "Pick"}{" "}
                        <span className="font-medium">{names.get(choice) ?? choice}</span>?
                      </>
                    ) : (
                      `Choose a champion to ${step.kind}.`
                    )}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-sm">
                    {teamName(step.side === "blue" ? game.blueTeamId : game.redTeamId)} is{" "}
                    {step.kind === "ban" ? "banning" : "picking"}…
                  </span>
                )}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onSearchEnter();
                  }
                }}
                placeholder="Search"
                aria-label="Search champions"
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full min-w-0 rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3"
              />
              {myTurn && step?.kind === "ban" ? (
                <Button variant="outline" disabled={pending} onClick={() => lock(null)}>
                  Skip ban
                </Button>
              ) : null}
              {myTurn ? (
                <Button
                  disabled={pending || !choice}
                  onClick={() => choice && lock(choice)}
                  style={{ backgroundColor: stepColor }}
                  className="text-white"
                >
                  Lock in
                </Button>
              ) : null}
            </div>
          </div>
          {myTurn ? (
            <p className="text-muted-foreground hidden text-xs md:block">
              Click to select, double-click to lock in. In the search, Enter selects the match and
              Enter again locks it in.
            </p>
          ) : null}
          <ChampionGrid
            champions={shown}
            version={catalog.version}
            rules={rules}
            selected={choice}
            hovered={step ? hover[step.side] : null}
            color={stepColor}
            clickable={myTurn && !pending}
            onChoose={choose}
            onLock={lock}
          />
        </div>
        <SideColumn
          side="red"
          name={teamName(game.redTeamId)}
          board={board.red}
          hover={step?.side === "red" ? hover.red : null}
          onClock={step?.side === "red" ? step.kind : null}
          names={names}
          version={catalog.version}
        />
      </div>

      {snap.viewer.isAdmin && snap.open && !game.winnerTeamId ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
            <span className="text-muted-foreground">Admin:</span>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || actions.length === 0}
              onClick={() => run(() => adminUndoDraftStep(slug, matchId, gameNumber))}
            >
              Undo last step
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending || draft.state === "skipped" || draft.state === "complete"}
              onClick={() => {
                if (confirm("Skip this game's draft? Captains can then record the result."))
                  run(() => adminSetDraft(slug, matchId, gameNumber, "skipped"));
              }}
            >
              Skip draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                if (confirm("Restart this game's draft from scratch?"))
                  run(() => adminSetDraft(slug, matchId, gameNumber, "restart"));
              }}
            >
              Restart draft
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Spicy League isn&apos;t endorsed by Riot Games. Champion images © Riot Games.
      </p>
    </div>
  );
}

// ── Pieces ───────────────────────────────────────────────────────────────────

type Game = Snap["games"][number];

/** Compact "BLUE BAN 2 · 43" for the sticky bar; its own component so only it ticks. */
function StepClock({
  label,
  color,
  deadline,
  serverNow,
}: {
  label: string;
  color: string;
  deadline: string | null;
  serverNow: string;
}) {
  const ms = useCountdown(deadline, serverNow);
  return (
    <span className="text-sm font-semibold whitespace-nowrap tabular-nums" style={{ color }}>
      {label} ·{" "}
      {!deadline ? "paused" : ms === null ? "" : ms === 0 ? "time's up" : formatSeconds(ms)}
    </span>
  );
}

function StatusBar({
  snap,
  game,
  step,
  viewerSide,
  myTurn,
  teamName,
  matchHref,
  pending,
  onReady,
}: {
  snap: Snap;
  game: Game;
  step: ReturnType<typeof stepAt>;
  viewerSide: DraftSide | null;
  myTurn: boolean;
  teamName: (id: string | null) => string;
  matchHref: string;
  pending: boolean;
  onReady: (side: DraftSide, ready: boolean) => void;
}) {
  const { draft } = game;
  const stepLeftMs = useCountdown(
    draft.state === "drafting" ? draft.stepDeadline : null,
    snap.serverNow,
  );
  const startMs = useCountdown(draft.state === "countdown" ? draft.startsAt : null, snap.serverNow);

  if (draft.state === "waiting") {
    return (
      <Card>
        <CardContent className="space-y-3 py-4 text-sm">
          <p className="text-center">
            Both captains ready up to start. Each ban then has {DRAFT_BAN_MS / 1000} seconds and
            each pick {DRAFT_PICK_MS / 60_000} minutes. When time runs out the hovered champion
            locks in; with nothing hovered a ban is skipped and the draft pauses on a pick until an
            admin steps in.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {(["blue", "red"] as const).map((side) => {
              const ready = side === "blue" ? draft.blueReady : draft.redReady;
              const teamId = side === "blue" ? game.blueTeamId : game.redTeamId;
              const canReady = snap.open && (viewerSide === side || snap.viewer.isAdmin);
              return (
                <div
                  key={side}
                  className="space-y-2 rounded-lg border p-3 text-center"
                  style={{ borderColor: ready ? SIDE_COLOR[side] : undefined }}
                >
                  <div className="font-medium" style={{ color: SIDE_COLOR[side] }}>
                    {teamName(teamId)}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {ready ? "✓ Ready" : "Not ready"}
                  </div>
                  {canReady ? (
                    <Button
                      size="sm"
                      variant={ready ? "outline" : "default"}
                      disabled={pending}
                      onClick={() => onReady(side, !ready)}
                    >
                      {ready
                        ? "Unready"
                        : snap.viewer.isAdmin && viewerSide !== side
                          ? `Ready ${side}`
                          : "Ready"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }
  if (draft.state === "countdown") {
    return (
      <Card>
        <CardContent className="space-y-2 py-4 text-center">
          <p className="text-sm">Draft starting…</p>
          <Countdown ms={startMs} total={DRAFT_COUNTDOWN_MS} doneLabel="Starting…" />
        </CardContent>
      </Card>
    );
  }
  if (draft.state === "drafting" && step) {
    const paused = !draft.stepDeadline;
    return (
      <Card style={{ borderColor: SIDE_COLOR[step.side] }}>
        <CardContent className="space-y-2 py-4">
          <p
            className="text-center text-base font-semibold"
            style={{ color: SIDE_COLOR[step.side] }}
          >
            {stepLabel(step, draft.actions)}
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {teamName(step.side === "blue" ? game.blueTeamId : game.redTeamId)} · step {step.step}
              /20
            </span>
          </p>
          {myTurn ? (
            <p className="text-center text-sm font-medium">
              {snap.viewer.isAdmin && viewerSide !== step.side
                ? `Admin, acting for ${step.side}`
                : "Your turn"}
            </p>
          ) : null}
          {paused ? (
            <p className="text-center text-sm">
              Paused: time ran out with no champion chosen. Waiting for this side to lock in, or an
              admin to pick for them.
            </p>
          ) : (
            <Countdown
              ms={stepLeftMs}
              total={stepMs(step.kind)}
              color={SIDE_COLOR[step.side]}
              doneLabel="Time's up"
            />
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="space-y-3 py-4 text-center text-sm">
        <p>
          {draft.state === "skipped"
            ? "An admin skipped this draft."
            : "Draft complete. Good luck! Record the winner on the match page after the game."}
        </p>
        <Link href={matchHref} className={buttonVariants({ size: "sm" })}>
          Back to the match
        </Link>
      </CardContent>
    </Card>
  );
}

function ChampIcon({
  version,
  championKey,
  name,
  size = 48,
  fill = false,
  faded = false,
}: {
  version: string;
  championKey: string;
  name: string;
  size?: number;
  /** Fill the parent (a fluid slot) instead of a fixed size. */
  fill?: boolean;
  faded?: boolean;
}) {
  return (
    // Data Dragon serves small square PNGs; next/image optimisation would only
    // add cost (~170 icons × patches).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(version, championKey)}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      className="rounded-md"
      style={{
        width: fill ? "100%" : size,
        height: fill ? "100%" : size,
        opacity: faded ? 0.45 : 1,
      }}
    />
  );
}

function SideColumn({
  side,
  name,
  board,
  hover,
  onClock,
  names,
  version,
}: {
  side: DraftSide;
  name: string;
  board: { bans: (string | null)[]; picks: string[] };
  hover: string | null;
  onClock: "ban" | "pick" | null;
  names: Map<string, string>;
  version: string;
}) {
  const color = SIDE_COLOR[side];
  const bans = [...board.bans];
  const picks: (string | null)[] = [...board.picks];
  return (
    <section className="space-y-3 rounded-lg border p-2 md:p-3" style={{ borderColor: color }}>
      <h2 className="font-semibold" style={{ color }}>
        {name} <span className="text-muted-foreground text-xs font-normal">{side}</span>
      </h2>
      <div>
        <div className="text-muted-foreground mb-1 text-xs uppercase">Bans</div>
        {/* Five equal cells, so the row never wraps in a narrow column. */}
        <div className="grid grid-cols-5 gap-1">
          {Array.from({ length: 5 }, (_, i) => {
            const taken = i < bans.length;
            const key = taken ? bans[i] : i === bans.length && onClock === "ban" ? hover : null;
            return (
              <Slot
                key={i}
                size={36}
                fluid
                championKey={key}
                names={names}
                version={version}
                label={taken && !bans[i] ? "—" : undefined}
                ghost={!taken && !!key}
                active={!taken && i === bans.length && onClock === "ban"}
                color={color}
                crossed={taken && !!bans[i]}
              />
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-muted-foreground mb-1 text-xs uppercase">Picks</div>
        <ul className="grid grid-cols-5 gap-1 md:block md:space-y-1.5">
          {Array.from({ length: 5 }, (_, i) => {
            const taken = i < picks.length;
            const active = !taken && i === picks.length && onClock === "pick";
            const key = taken ? picks[i] : active ? hover : null;
            return (
              <li key={i} className="flex items-center gap-2">
                <Slot
                  size={40}
                  fluid
                  championKey={key}
                  names={names}
                  version={version}
                  ghost={!taken && !!key}
                  active={active}
                  color={color}
                />
                <span
                  className={
                    taken
                      ? "hidden text-sm font-medium md:inline"
                      : "text-muted-foreground hidden text-sm md:inline"
                  }
                >
                  {key ? (names.get(key) ?? key) : active ? "Picking…" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

function Slot({
  size,
  fluid = false,
  championKey,
  names,
  version,
  label,
  ghost = false,
  active = false,
  crossed = false,
  color,
}: {
  size: number;
  /** Shrink to the available width (up to `size`), keeping it square. */
  fluid?: boolean;
  championKey: string | null;
  names: Map<string, string>;
  version: string;
  label?: string;
  ghost?: boolean;
  active?: boolean;
  crossed?: boolean;
  color: string;
}) {
  return (
    <span
      className="bg-muted/40 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border text-xs"
      style={{
        ...(fluid
          ? { width: "100%", maxWidth: size, aspectRatio: "1 / 1" }
          : { width: size, height: size }),
        borderColor: active ? color : undefined,
        boxShadow: active ? `0 0 0 1px ${color}` : undefined,
      }}
      title={championKey ? (names.get(championKey) ?? championKey) : label}
    >
      {championKey ? (
        <ChampIcon
          version={version}
          championKey={championKey}
          name={names.get(championKey) ?? championKey}
          size={size}
          fill={fluid}
          faded={ghost}
        />
      ) : (
        (label ?? "")
      )}
      {crossed ? <span aria-hidden className="absolute inset-0 bg-black/40" /> : null}
    </span>
  );
}

type Rules = Parameters<typeof unavailableReason>[1];

// Countdown ticks re-render only StatusBar and StepClock (their own
// useCountdown), so this ~170-icon grid re-renders on new snapshots and
// clicks, not 5× a second.
function ChampionGrid({
  champions,
  version,
  rules,
  selected,
  hovered,
  color,
  clickable,
  onChoose,
  onLock,
}: {
  /** Already filtered by the search. */
  champions: Champion[];
  version: string;
  rules: Rules;
  selected: string | null;
  hovered: string | null;
  /** The side on the clock's colour, for the selection outline. */
  color: string;
  clickable: boolean;
  onChoose: (key: string) => void;
  onLock: (key: string) => void;
}) {
  if (champions.length === 0) {
    return <p className="text-muted-foreground text-sm">No champion matches that search.</p>;
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1.5">
      {champions.map((c) => {
        const reason = unavailableReason(c.key, rules);
        const isSelected = selected === c.key;
        const isHovered = !isSelected && hovered === c.key;
        return (
          <li key={c.key}>
            <button
              type="button"
              disabled={!!reason || !clickable}
              onClick={() => onChoose(c.key)}
              onDoubleClick={() => onLock(c.key)}
              title={reason ? `${c.name}: ${REASON_LABEL[reason]}` : c.name}
              aria-pressed={isSelected}
              className="enabled:hover:bg-muted flex w-full touch-manipulation flex-col items-center gap-0.5 rounded-md p-1 text-[0.65rem] leading-tight disabled:cursor-default"
              style={{
                outline: isSelected
                  ? `2px solid ${color}`
                  : isHovered
                    ? "1px dashed var(--muted)"
                    : undefined,
              }}
            >
              <span className="relative">
                <ChampIcon version={version} championKey={c.key} name={c.name} faded={!!reason} />
                {reason ? (
                  <span className="absolute inset-x-0 bottom-0 rounded-b-md bg-black/75 text-center text-[0.5rem] leading-snug font-semibold text-white uppercase">
                    {REASON_LABEL[reason]}
                  </span>
                ) : null}
              </span>
              <span
                className={reason ? "text-muted-foreground w-full truncate" : "w-full truncate"}
              >
                {c.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
