"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { championIconUrl, type DraftSide } from "@/lib/draft-room";
import type { MatchDaySnapshot } from "@/lib/match-day";

// A game's finished draft on the match-day card (docs/MATCH-DAY.md, phase 4):
// each side's picks with who played them, bans faded, and — for that team's
// captains or an admin — "Assign players" to record who played what.

type Game = MatchDaySnapshot["games"][number];
export type ChampionNames = { version: string; names: Record<string, string> };
export type LineupOption = { userId: string; name: string };

const SIDE_COLOR: Record<DraftSide, string> = { blue: "#3b82f6", red: "#ef4444" };

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
  pending,
  onAssign,
}: {
  game: Game;
  champions: ChampionNames;
  /** Who played for each team in this match, by team id. */
  lineups: Record<string, LineupOption[]>;
  canAssign: (side: DraftSide) => boolean;
  pending: boolean;
  onAssign: (side: DraftSide, assignments: Record<number, string | null>) => void;
}) {
  const [editing, setEditing] = useState<DraftSide | null>(null);
  const name = (key: string) => champions.names[key] ?? key;
  const sides: { side: DraftSide; teamId: string | null }[] = [
    { side: "blue", teamId: game.blueTeamId },
    { side: "red", teamId: game.redTeamId },
  ];
  return (
    <div className="space-y-2">
      {sides.map(({ side, teamId }) => {
        const mine = game.draft.actions.filter((a) => a.side === side);
        const picks = mine.filter((a) => a.kind === "pick" && a.championKey);
        const bans = mine.filter((a) => a.kind === "ban");
        const players = teamId ? (lineups[teamId] ?? []) : [];
        const playerName = (id: string | null) => players.find((p) => p.userId === id)?.name;
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
                  {picks.some((a) => a.assignedUserId) ? "Edit players" : "Assign players"}
                </Button>
              ) : null}
            </div>
            {editing === side ? (
              <AssignForm
                picks={picks.map((a) => ({
                  step: a.step,
                  champion: name(a.championKey!),
                  assignedUserId: a.assignedUserId,
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

function AssignForm({
  picks,
  players,
  pending,
  onCancel,
  onSave,
}: {
  picks: { step: number; champion: string; assignedUserId: string | null }[];
  players: LineupOption[];
  pending: boolean;
  onCancel: () => void;
  onSave: (assignments: Record<number, string | null>) => void;
}) {
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(picks.map((p) => [p.step, p.assignedUserId ?? ""])),
  );
  const chosen = Object.values(values).filter(Boolean);
  const duplicate = new Set(chosen).size !== chosen.length;
  return (
    <div className="bg-muted/30 space-y-2 rounded-lg border p-2 text-sm">
      {picks.map((p) => (
        <label key={p.step} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate">{p.champion}</span>
          <select
            value={values[p.step] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [p.step]: e.target.value }))}
            className="border-input h-8 w-full rounded-lg border bg-transparent px-2 text-sm"
          >
            <option value="">Who played it?</option>
            {players.map((pl) => (
              <option key={pl.userId} value={pl.userId}>
                {pl.name}
              </option>
            ))}
          </select>
        </label>
      ))}
      {duplicate ? (
        <p className="text-destructive text-xs">Each player can only play one champion.</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || duplicate}
          onClick={() =>
            onSave(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v || null])))
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
