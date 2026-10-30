"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  championIconUrl,
  LANE_ROLE_LABEL,
  LANE_ROLES,
  type DraftSide,
  type LaneRole,
} from "@/lib/draft-room";
import type { MatchDaySnapshot } from "@/lib/match-day";

import type { PickAssignment } from "../../match-day-actions";

// A game's finished draft on the match-day card (docs/MATCH-DAY.md, phase 4):
// each side's picks, top to support once roles are known, with who played
// them, bans faded, and — for that team's captains or an admin — "Assign
// players" to record who played what and where. Other lineup players get
// "I played…" to claim their own pick.

type Game = MatchDaySnapshot["games"][number];
type Pick = Game["draft"]["actions"][number];
export type ChampionNames = { version: string; names: Record<string, string> };
export type LineupOption = { userId: string; name: string };

const SIDE_COLOR: Record<DraftSide, string> = { blue: "#3b82f6", red: "#ef4444" };

/** Picks with a role first, top to support; the rest in draft order. */
function byRole(picks: Pick[]): Pick[] {
  const rank = (p: Pick) => (p.role ? LANE_ROLES.indexOf(p.role) : LANE_ROLES.length);
  return [...picks].sort((a, b) => rank(a) - rank(b) || a.step - b.step);
}

function Icon({
  version,
  championKey,
  name,
  size,
  faded = false,
}: {
  version: string;
  championKey: string;
  name: string;
  size: number;
  faded?: boolean;
}) {
  return (
    // Small Data Dragon squares; see draft-room.tsx for why not next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={championIconUrl(version, championKey)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      className="rounded"
      style={{ width: size, height: size, opacity: faded ? 0.4 : 1 }}
    />
  );
}

export function DraftRecap({
  game,
  champions,
  lineups,
  canAssign,
  claimSide,
  viewerId,
  pending,
  onAssign,
  onClaim,
}: {
  game: Game;
  champions: ChampionNames;
  /** Who played for each team in this match, by team id. */
  lineups: Record<string, LineupOption[]>;
  canAssign: (side: DraftSide) => boolean;
  /** The side the viewer played on, when they can claim (not assign) its picks. */
  claimSide: DraftSide | null;
  viewerId: string | null;
  pending: boolean;
  onAssign: (side: DraftSide, assignments: Record<number, PickAssignment>) => void;
  onClaim: (step: number | null, role: LaneRole | null) => void;
}) {
  const [editing, setEditing] = useState<DraftSide | null>(null);
  const [claiming, setClaiming] = useState(false);
  // The roleless pick a player chose, while they say which role it was.
  const [claimStep, setClaimStep] = useState<number | null>(null);
  const stopClaiming = () => {
    setClaiming(false);
    setClaimStep(null);
  };
  const name = (key: string) => champions.names[key] ?? key;
  const sides: { side: DraftSide; teamId: string | null }[] = [
    { side: "blue", teamId: game.blueTeamId },
    { side: "red", teamId: game.redTeamId },
  ];
  return (
    <div className="space-y-2">
      {sides.map(({ side, teamId }) => {
        const mine = game.draft.actions.filter((a) => a.side === side);
        const picks = byRole(mine.filter((a) => a.kind === "pick" && a.championKey));
        const anyRole = picks.some((a) => a.role);
        const bans = mine.filter((a) => a.kind === "ban");
        const players = teamId ? (lineups[teamId] ?? []) : [];
        const playerName = (id: string | null) => players.find((p) => p.userId === id)?.name;
        const roleless = picks.find((a) => a.step === claimStep);
        return (
          <div key={side} className="space-y-1.5">
            <div className="flex flex-wrap items-end gap-1.5">
              <span
                className="w-8 self-center text-xs font-semibold uppercase"
                style={{ color: SIDE_COLOR[side] }}
              >
                {side}
              </span>
              {picks.map((a) => (
                <span key={a.step} className="flex w-12 flex-col items-center gap-0.5">
                  {anyRole ? (
                    <span className="text-muted-foreground text-[0.6rem] uppercase">
                      {a.role ? LANE_ROLE_LABEL[a.role] : "—"}
                    </span>
                  ) : null}
                  <Icon
                    version={champions.version}
                    championKey={a.championKey!}
                    name={name(a.championKey!)}
                    size={32}
                  />
                  <span className="text-muted-foreground w-full truncate text-center text-[0.6rem]">
                    {playerName(a.assignedUserId) ?? name(a.championKey!)}
                  </span>
                </span>
              ))}
              <span className="ml-1 flex items-center gap-0.5 self-center" aria-label="Bans">
                {bans.map((a) =>
                  a.championKey ? (
                    <Icon
                      key={a.step}
                      version={champions.version}
                      championKey={a.championKey}
                      name={`${name(a.championKey)} (banned)`}
                      size={18}
                      faded
                    />
                  ) : null,
                )}
              </span>
              {game.draft.state === "complete" && canAssign(side) && editing !== side ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="self-center"
                  onClick={() => setEditing(side)}
                >
                  {picks.some((a) => a.assignedUserId || a.role)
                    ? "Edit players"
                    : "Assign players"}
                </Button>
              ) : null}
              {game.draft.state === "complete" && claimSide === side && !claiming ? (
                <Button
                  variant="ghost"
                  size="xs"
                  className="self-center"
                  onClick={() => setClaiming(true)}
                >
                  {picks.some((a) => a.assignedUserId === viewerId) ? "Change mine" : "I played…"}
                </Button>
              ) : null}
            </div>
            {claimSide === side && claiming && !roleless ? (
              <div className="bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-lg border p-2 text-sm">
                <span className="text-muted-foreground text-xs">Which did you play?</span>
                {picks
                  .filter((a) => !a.assignedUserId || a.assignedUserId === viewerId)
                  .map((a) => (
                    <Button
                      key={a.step}
                      size="xs"
                      variant={a.assignedUserId === viewerId ? "default" : "outline"}
                      disabled={pending}
                      onClick={() => {
                        // No role yet: ask for it before claiming.
                        if (!a.role) return setClaimStep(a.step);
                        onClaim(a.step, null);
                        stopClaiming();
                      }}
                    >
                      {name(a.championKey!)}
                    </Button>
                  ))}
                {picks.some((a) => a.assignedUserId === viewerId) ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      onClaim(null, null);
                      stopClaiming();
                    }}
                  >
                    None of these
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" onClick={stopClaiming}>
                  Cancel
                </Button>
              </div>
            ) : null}
            {claimSide === side && claiming && roleless ? (
              <div className="bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-lg border p-2 text-sm">
                <span className="text-muted-foreground text-xs">
                  Which role did you play {name(roleless.championKey!)} in?
                </span>
                {LANE_ROLES.map((role) => (
                  <Button
                    key={role}
                    size="xs"
                    variant="outline"
                    // Another pick already has it; a captain can move it.
                    disabled={pending || picks.some((a) => a.role === role)}
                    onClick={() => {
                      onClaim(roleless.step, role);
                      stopClaiming();
                    }}
                  >
                    {LANE_ROLE_LABEL[role]}
                  </Button>
                ))}
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    onClaim(roleless.step, null);
                    stopClaiming();
                  }}
                >
                  Skip
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setClaimStep(null)}>
                  Back
                </Button>
              </div>
            ) : null}
            {editing === side ? (
              <AssignForm
                picks={picks.map((a) => ({
                  step: a.step,
                  champion: name(a.championKey!),
                  assignedUserId: a.assignedUserId,
                  role: a.role,
                }))}
                players={players}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(assignments) => {
                  onAssign(side, assignments);
                  setEditing(null);
                }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type AssignValue = { userId: string; role: LaneRole | "" };

function AssignForm({
  picks,
  players,
  pending,
  onCancel,
  onSave,
}: {
  picks: { step: number; champion: string; assignedUserId: string | null; role: LaneRole | null }[];
  players: LineupOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (assignments: Record<number, PickAssignment>) => void;
}) {
  // Per pick: its role and who played it ("" = not set).
  const [values, setValues] = useState<Record<number, AssignValue>>(() =>
    Object.fromEntries(
      picks.map((p) => [p.step, { userId: p.assignedUserId ?? "", role: p.role ?? "" }]),
    ),
  );
  const set = (step: number, patch: Partial<AssignValue>) =>
    setValues((v) => ({ ...v, [step]: { ...v[step], ...patch } }));
  const repeats = (xs: string[]) => {
    const filled = xs.filter(Boolean);
    return new Set(filled).size !== filled.length;
  };
  const duplicatePlayer = repeats(Object.values(values).map((v) => v.userId));
  const duplicateRole = repeats(Object.values(values).map((v) => v.role));
  const select = "border-input h-8 min-w-0 rounded-lg border bg-transparent px-2 text-sm";
  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border p-2 text-sm">
      {picks.map((p) => (
        // Phones: the champion on its own line, the two selects side by side under it.
        <div
          key={p.step}
          className="grid grid-cols-2 items-center gap-x-2 gap-y-1 sm:grid-cols-[7rem_1fr_1fr]"
        >
          <span className="col-span-2 truncate sm:col-span-1">{p.champion}</span>
          <select
            aria-label={`${p.champion}: role`}
            value={values[p.step]?.role ?? ""}
            onChange={(e) => set(p.step, { role: e.target.value as LaneRole | "" })}
            className={select}
          >
            <option value="">Role</option>
            {LANE_ROLES.map((role) => (
              <option key={role} value={role}>
                {LANE_ROLE_LABEL[role]}
              </option>
            ))}
          </select>
          <select
            aria-label={`${p.champion}: player`}
            value={values[p.step]?.userId ?? ""}
            onChange={(e) => set(p.step, { userId: e.target.value })}
            className={select}
          >
            <option value="">Who played it?</option>
            {players.map((pl) => (
              <option key={pl.userId} value={pl.userId}>
                {pl.name}
              </option>
            ))}
          </select>
        </div>
      ))}
      {duplicatePlayer ? (
        <p className="text-destructive text-xs">Each player can only play one champion.</p>
      ) : null}
      {duplicateRole ? (
        <p className="text-destructive text-xs">Each role can only have one champion.</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || duplicatePlayer || duplicateRole}
          onClick={() =>
            onSave(
              Object.fromEntries(
                Object.entries(values).map(([step, v]) => [
                  step,
                  { userId: v.userId || null, role: v.role || null },
                ]),
              ),
            )
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
