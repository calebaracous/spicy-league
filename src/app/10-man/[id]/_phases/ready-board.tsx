"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { VsDivider } from "@/components/ui/vs-divider";
import { reportResult } from "../../actions";
import { Avatar, PhaseBanner } from "./shared";
import type { TenManSnapshotClient, CaptainEntry, PickEntry } from "./types";

export function ReadyBoard({
  snap,
  tenManId,
  isAdmin,
}: {
  snap: TenManSnapshotClient;
  tenManId: string;
  isAdmin: boolean;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const { captains, picks, tenMan } = snap;

  const cap1 = captains.find((c) => c.captainOrder === 1);
  const cap2 = captains.find((c) => c.captainOrder === 2);

  const right = isAdmin ? (
    <Button
      size="sm"
      onClick={() => setModalOpen(true)}
      className="rounded-full"
      style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
    >
      Report result →
    </Button>
  ) : (
    <span style={{ fontSize: 13, color: "var(--muted)" }}>Waiting for admin to report</span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <PhaseBanner
        phaseLabel="TEAMS LOCKED"
        title="Ready up"
        sub="Lobby code below. Once the game's done, report the result."
        right={right}
      />

      {/* Teams side-by-side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gap: 20,
          alignItems: "stretch",
        }}
      >
        {cap1 ? (
          <TeamRoster
            captain={cap1}
            picks={picks.filter((p) => p.captainUserId === cap1.userId)}
            label="TEAM 1 · BLUE SIDE"
            side="B"
          />
        ) : null}
        <VsDivider />
        {cap2 ? (
          <TeamRoster
            captain={cap2}
            picks={picks.filter((p) => p.captainUserId === cap2.userId)}
            label="TEAM 2 · RED SIDE"
            side="R"
          />
        ) : null}
      </div>

      {/* Lobby card */}
      <div
        style={{
          padding: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <SectionLabel>CUSTOM GAME LOBBY</SectionLabel>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>
            {cap1?.displayName} hosts. Map: Summoner&apos;s Rift · Tournament Draft.
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "var(--bg)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Lobby</span>
            <span
              style={{
                fontSize: 14,
                color: "var(--text)",
                letterSpacing: "0.05em",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {tenMan.lobbyCode ?? "SPCY-????"}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => navigator.clipboard.writeText(tenMan.lobbyCode ?? "")}
          >
            Copy
          </Button>
        </div>
      </div>

      {modalOpen ? (
        <ResultModal captains={captains} tenManId={tenManId} onClose={() => setModalOpen(false)} />
      ) : null}
    </div>
  );
}

export function TeamRoster({
  captain,
  picks,
  label,
  side,
  winner,
}: {
  captain: CaptainEntry;
  picks: PickEntry[];
  label: string;
  side: string;
  winner?: string | null;
}) {
  const isWinner = winner === captain.userId;
  const isLoser = winner && winner !== captain.userId;

  return (
    <div
      style={{
        padding: 24,
        background: isWinner ? "rgba(185, 28, 28, 0.04)" : "var(--surface)",
        border: `1px solid ${isWinner ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        opacity: isLoser ? 0.55 : 1,
        transition: "all 0.3s",
        position: "relative",
      }}
    >
      {isWinner ? (
        <div
          style={{
            position: "absolute",
            top: -12,
            right: 16,
            padding: "4px 12px",
            background: "var(--accent)",
            color: "var(--accent-fg)",
            borderRadius: 9999,
            fontSize: 10,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          ★ Winners
        </div>
      ) : null}

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
          <SectionLabel style={{ color: isWinner ? "var(--accent)" : "var(--muted)" }}>
            {label}
          </SectionLabel>
          <span
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "var(--text)",
            }}
          >
            {captain.displayName}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}> &amp; co.</span>
          </span>
        </div>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 9999,
            background: "var(--accent)",
            color: "var(--accent-fg)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          {side}
        </span>
      </div>

      {/* Roster */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {/* Captain row */}
        <RosterRow index="C" name={captain.displayName} isCaptain />
        {/* Picks */}
        {picks.map((p, i) => (
          <RosterRow
            key={p.pickNumber}
            index={String(i + 1)}
            name={p.pickedDisplayName}
            pickNumber={p.pickNumber}
          />
        ))}
      </div>
    </div>
  );
}

function RosterRow({
  index,
  name,
  isCaptain = false,
  pickNumber,
}: {
  index: string;
  name: string;
  isCaptain?: boolean;
  pickNumber?: number;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto 1fr auto",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 8,
        background: isCaptain ? "rgba(185, 28, 28, 0.05)" : "var(--bg)",
        border: `1px solid ${isCaptain ? "rgba(185, 28, 28, 0.25)" : "var(--border)"}`,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: isCaptain ? "var(--accent)" : "var(--muted)",
          fontFamily: "var(--font-geist-mono)",
          width: 16,
        }}
      >
        {index}
      </span>
      <Avatar name={name} size={32} captain={isCaptain} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{name}</span>
      </div>
      {isCaptain ? (
        <span
          style={{
            fontSize: 9,
            fontWeight: 500,
            letterSpacing: "0.1em",
            color: "var(--accent-fg)",
            backgroundColor: "var(--accent)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          CAPTAIN
        </span>
      ) : (
        <span
          style={{
            fontSize: 10,
            color: "var(--muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          #{pickNumber}
        </span>
      )}
    </div>
  );
}

function ResultModal({
  captains,
  tenManId,
  onClose,
}: {
  captains: CaptainEntry[];
  tenManId: string;
  onClose: () => void;
}) {
  const [winner, setWinner] = useState<string | null>(null);
  const [duration, setDuration] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    if (!winner) return;
    startTransition(async () => {
      await reportResult(tenManId, {
        winnerCaptainUserId: winner,
        durationLabel: duration || undefined,
      });
      onClose();
    });
  }

  const sides = ["BLUE SIDE", "RED SIDE"];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(6px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          maxWidth: 480,
          width: "calc(100% - 32px)",
          padding: 28,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionLabel>REPORT RESULT</SectionLabel>
          <h2
            style={{
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Who won?
          </h2>
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            This locks the 10-man and writes the W to history.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {captains.map((cap, i) => {
            const selected = winner === cap.userId;
            return (
              <button
                key={cap.userId}
                onClick={() => setWinner(cap.userId)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  padding: 20,
                  background: selected ? "rgba(185, 28, 28, 0.1)" : "var(--bg)",
                  border: `1px solid ${selected ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 10,
                  color: "var(--text)",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                }}
              >
                <Avatar name={cap.displayName} size={40} captain />
                <span style={{ fontSize: 14, fontWeight: 500 }}>Team {cap.displayName}</span>
                <SectionLabel style={{ color: selected ? "var(--accent)" : "var(--muted)" }}>
                  {sides[i]}
                </SectionLabel>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label
            style={{
              fontSize: 11,
              color: "var(--muted)",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            Duration (optional)
          </label>
          <input
            className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            type="text"
            value={duration}
            placeholder="e.g. 34m"
            onChange={(e) => setDuration(e.target.value)}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            paddingTop: 8,
          }}
        >
          <Button variant="ghost" size="sm" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="rounded-full"
            disabled={!winner || pending}
            onClick={handleSubmit}
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Submit result
          </Button>
        </div>
      </div>
    </div>
  );
}
