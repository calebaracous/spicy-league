"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { SnakeOrderStrip } from "@/components/ui/snake-order-strip";
import { SectionLabel } from "@/components/ui/section-label";
import { submitPick } from "../../actions";
import { Avatar } from "./shared";
import type { TenManSnapshotClient, CaptainEntry, PickEntry } from "./types";

export function DraftBoard({
  snap,
  tenManId,
  viewerUserId,
  isAdmin,
}: {
  snap: TenManSnapshotClient;
  tenManId: string;
  viewerUserId: string | null;
  isAdmin: boolean;
}) {
  const { captains, picks, signups, onTheClock } = snap;
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();

  const complete = picks.length >= 8;
  const currentPickNum = complete ? 9 : (onTheClock?.pickNumber ?? picks.length + 1);

  const captainIds = new Set(captains.map((c) => c.userId));
  const pickedIds = new Set(picks.map((p) => p.pickedUserId));
  const pool = signups.filter((s) => !captainIds.has(s.userId) && !pickedIds.has(s.userId));

  const filteredPool = filter
    ? pool.filter((p) => p.displayName.toLowerCase().includes(filter.toLowerCase()))
    : pool;

  const isOnClockViewer = !complete && viewerUserId && onTheClock?.captainUserId === viewerUserId;
  const canPick = !complete && (isAdmin || Boolean(isOnClockViewer));

  function handlePick(pickedUserId: string) {
    startTransition(() => submitPick(tenManId, pickedUserId));
  }

  const cap1 = captains.find((c) => c.captainOrder === 1);
  const cap2 = captains.find((c) => c.captainOrder === 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Status banner */}
      <div
        style={{
          padding: "16px 20px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <SectionLabel>DRAFT · LIVE</SectionLabel>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 20, fontWeight: 500, color: "var(--text)" }}>
                {complete ? "Draft complete" : `Pick ${currentPickNum} of 8`}
              </span>
              {!complete && onTheClock ? (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  On the clock:{" "}
                  <span style={{ color: "var(--text)", fontWeight: 500 }}>
                    {captains.find((c) => c.userId === onTheClock.captainUserId)?.displayName ??
                      "?"}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {isAdmin && !complete ? (
              <span
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "4px 10px",
                  border: "1px solid var(--border)",
                  borderRadius: 9999,
                }}
              >
                Admin — pick for anyone
              </span>
            ) : null}
            {isOnClockViewer && !isAdmin ? <YourTurnPill /> : null}
          </div>
        </div>

        <SnakeOrderStrip currentPick={complete ? undefined : currentPickNum} />
      </div>

      {/* Live board: left = teams, right = pool */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 20 }}>
        {/* Teams */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[cap1, cap2].filter(Boolean).map((cap) => (
            <TeamCard
              key={cap!.userId}
              captain={cap!}
              picks={picks.filter((p) => p.captainUserId === cap!.userId)}
              isOnClock={!complete && onTheClock?.captainUserId === cap!.userId}
            />
          ))}
        </div>

        {/* Pool */}
        <div
          style={{
            padding: 16,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            alignSelf: "start",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              Available pool
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--muted)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {pool.length} left
            </span>
          </div>
          <input
            className="flex h-9 w-full rounded-md border px-3 py-1 text-sm"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
            type="text"
            placeholder="Filter by name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              listStyle: "none",
              maxHeight: "60vh",
              overflowY: "auto",
            }}
          >
            {filteredPool.map((p) => (
              <li
                key={p.userId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.background = "rgba(255,255,255,0.03)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLLIElement).style.background = "transparent")
                }
              >
                <Avatar name={p.displayName} size={32} />
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>
                  {p.displayName}
                </span>
                {canPick ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handlePick(p.userId)}
                    className="rounded-full"
                  >
                    Pick
                  </Button>
                ) : (
                  <span />
                )}
              </li>
            ))}
            {filteredPool.length === 0 ? (
              <li
                style={{
                  padding: 20,
                  textAlign: "center",
                  color: "var(--muted)",
                  fontSize: 13,
                }}
              >
                {pool.length === 0 ? "Pool exhausted — draft complete." : "No matches for filter."}
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      {/* Pick log */}
      <PickLog picks={picks} captains={captains} />
    </div>
  );
}

function TeamCard({
  captain,
  picks,
  isOnClock,
}: {
  captain: CaptainEntry;
  picks: PickEntry[];
  isOnClock: boolean;
}) {
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: `1px solid ${isOnClock ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "border-color 0.3s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              color: "var(--muted)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            C{captain.captainOrder}.
          </span>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
            {captain.displayName}
          </span>
        </div>
        {isOnClock ? (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: "var(--accent-fg)",
              backgroundColor: "var(--accent)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            ON CLOCK
          </span>
        ) : null}
      </div>

      <ol
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          listStyle: "none",
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}
      >
        {picks.length === 0 ? (
          <li style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
            No picks yet.
          </li>
        ) : (
          picks.map((p) => (
            <li key={p.pickNumber} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "var(--font-geist-mono)",
                  width: 20,
                }}
              >
                #{p.pickNumber}
              </span>
              <Avatar name={p.pickedDisplayName} size={32} />
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: "var(--text)" }}>
                {p.pickedDisplayName}
              </span>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}

function PickLog({ picks, captains }: { picks: PickEntry[]; captains: CaptainEntry[] }) {
  const cap1 = captains.find((c) => c.captainOrder === 1);
  return (
    <div
      style={{
        padding: 16,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text)" }}>Pick log</span>
      {picks.length === 0 ? (
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          No picks yet. {cap1?.displayName ?? "Captain 1"} picks first.
        </span>
      ) : (
        <ol style={{ display: "flex", flexDirection: "column", gap: 4, listStyle: "none" }}>
          {[...picks].reverse().map((pick) => (
            <li
              key={pick.pickNumber}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  fontFamily: "var(--font-geist-mono)",
                  width: 24,
                }}
              >
                #{pick.pickNumber}
              </span>
              <span style={{ fontWeight: 500 }}>{pick.captainDisplayName}</span>
              <span style={{ color: "var(--muted)" }}>picks</span>
              <span style={{ fontWeight: 500 }}>{pick.pickedDisplayName}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function YourTurnPill() {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 9999,
        border: "1px solid var(--accent)",
        color: "var(--accent)",
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          position: "relative",
          width: 8,
          height: 8,
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "var(--accent)",
            animation: "ping 1.4s ease-out infinite",
            opacity: 0.75,
          }}
        />
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "var(--accent)",
          }}
        />
      </span>
      Your pick
    </div>
  );
}
