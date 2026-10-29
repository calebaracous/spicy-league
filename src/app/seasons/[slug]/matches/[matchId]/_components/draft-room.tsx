"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { LiveStatusDot } from "@/components/live-status";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useSnapshotStream } from "@/components/use-turn-alert";
import { DRAFT_BAN_MS, DRAFT_COUNTDOWN_MS, DRAFT_PICK_MS, stepMs } from "@/lib/draft-clock";
import {
  championIconUrl,
  draftBoard,
  nextStep,
  stepAt,
  unavailableReason,
  type DraftSide,
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
import { BLUE, Countdown, RED, useAction, useCountdown } from "./match-day";

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

  const choose = (key: string) => {
    if (!myTurn || !step) return;
    setSelected(key);
    run(() => hoverChampion(slug, matchId, gameNumber, step.step, key));
  };
  const lock = (key: string | null) => {
    if (!step) return;
    setSelected(null);
    run(() => lockChampion(slug, matchId, gameNumber, step.step, key));
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
        pending={pending}
        onReady={(side, ready) => run(() => readyDraft(slug, matchId, gameNumber, side, ready))}
      />

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
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
          {myTurn && step ? (
            <div className="bg-background/95 sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border p-2 backdrop-blur">
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
              <span className="flex-1" />
              {step.kind === "ban" ? (
                <Button variant="outline" size="sm" disabled={pending} onClick={() => lock(null)}>
                  Skip ban
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={pending || !choice}
                onClick={() => choice && lock(choice)}
                style={{ backgroundColor: SIDE_COLOR[step.side] }}
                className="text-white"
              >
                Lock in
              </Button>
            </div>
          ) : null}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search champions"
            aria-label="Search champions"
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3"
          />
          <ChampionGrid
            champions={catalog.champions}
            version={catalog.version}
            query={query}
            rules={rules}
            selected={choice}
            hovered={step ? hover[step.side] : null}
            clickable={myTurn && !pending}
            onChoose={choose}
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

function StatusBar({
  snap,
  game,
  step,
  viewerSide,
  myTurn,
  teamName,
  pending,
  onReady,
}: {
  snap: Snap;
  game: Game;
  step: ReturnType<typeof stepAt>;
  viewerSide: DraftSide | null;
  myTurn: boolean;
  teamName: (id: string | null) => string;
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
          <Countdown ms={startMs} total={DRAFT_COUNTDOWN_MS} />
        </CardContent>
      </Card>
    );
  }
  if (draft.state === "drafting" && step) {
    const n = draft.actions.filter((a) => a.side === step.side && a.kind === step.kind).length + 1;
    const paused = !draft.stepDeadline;
    return (
      <Card style={{ borderColor: SIDE_COLOR[step.side] }}>
        <CardContent className="space-y-2 py-4">
          <p
            className="text-center text-base font-semibold"
            style={{ color: SIDE_COLOR[step.side] }}
          >
            {step.side.toUpperCase()} {step.kind.toUpperCase()} {n}
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
            <Countdown ms={stepLeftMs} total={stepMs(step.kind)} />
          )}
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="py-4 text-center text-sm">
        {draft.state === "skipped"
          ? "An admin skipped this draft."
          : "Draft complete. Good luck! Record the winner on the match page after the game."}
      </CardContent>
    </Card>
  );
}

function ChampIcon({
  version,
  championKey,
  name,
  size = 48,
  faded = false,
}: {
  version: string;
  championKey: string;
  name: string;
  size?: number;
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
      style={{ width: size, height: size, opacity: faded ? 0.45 : 1 }}
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
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }, (_, i) => {
            const taken = i < bans.length;
            const key = taken ? bans[i] : i === bans.length && onClock === "ban" ? hover : null;
            return (
              <Slot
                key={i}
                size={36}
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
        <ul className="flex flex-wrap gap-1.5 md:block md:space-y-1.5">
          {Array.from({ length: 5 }, (_, i) => {
            const taken = i < picks.length;
            const active = !taken && i === picks.length && onClock === "pick";
            const key = taken ? picks[i] : active ? hover : null;
            return (
              <li key={i} className="flex items-center gap-2">
                <Slot
                  size={40}
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
        width: size,
        height: size,
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

// Countdown ticks re-render only StatusBar (its own useCountdown), so this
// ~170-icon grid re-renders on new snapshots and clicks, not 5× a second.
function ChampionGrid({
  champions,
  version,
  query,
  rules,
  selected,
  hovered,
  clickable,
  onChoose,
}: {
  champions: Champion[];
  version: string;
  query: string;
  rules: Rules;
  selected: string | null;
  hovered: string | null;
  clickable: boolean;
  onChoose: (key: string) => void;
}) {
  const q = query
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const shown = q
    ? champions.filter((c) =>
        c.name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .includes(q),
      )
    : champions;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(3.75rem,1fr))] gap-1.5">
      {shown.map((c) => {
        const reason = unavailableReason(c.key, rules);
        const isSelected = selected === c.key;
        const isHovered = !isSelected && hovered === c.key;
        return (
          <li key={c.key}>
            <button
              type="button"
              disabled={!!reason || !clickable}
              onClick={() => onChoose(c.key)}
              title={reason ? `${c.name}: ${REASON_LABEL[reason]}` : c.name}
              aria-pressed={isSelected}
              className="enabled:hover:bg-muted flex w-full flex-col items-center gap-0.5 rounded-md p-1 text-[0.65rem] leading-tight disabled:cursor-default"
              style={{
                outline: isSelected
                  ? "2px solid var(--accent)"
                  : isHovered
                    ? "1px dashed var(--muted)"
                    : undefined,
              }}
            >
              <ChampIcon version={version} championKey={c.key} name={c.name} faded={!!reason} />
              <span className={reason ? "text-muted-foreground truncate" : "truncate"}>
                {reason ? REASON_LABEL[reason] : c.name}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
