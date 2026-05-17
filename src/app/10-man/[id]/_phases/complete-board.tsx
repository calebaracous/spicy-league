"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { VsDivider } from "@/components/ui/vs-divider";
import { start10Man } from "../../actions";
import { TeamRoster } from "./ready-board";
import type { TenManSnapshotClient } from "./types";

export function CompleteBoard({ snap, isAdmin }: { snap: TenManSnapshotClient; isAdmin: boolean }) {
  const { captains, picks, result } = snap;
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const winnerCaptainId = result?.winnerCaptainUserId;
  const winner = captains.find((c) => c.userId === winnerCaptainId);
  const loser = captains.find((c) => c.userId !== winnerCaptainId);

  const cap1 = captains.find((c) => c.captainOrder === 1);
  const cap2 = captains.find((c) => c.captainOrder === 2);

  function handleRestart() {
    startTransition(async () => {
      const res = await start10Man();
      router.push(`/10-man/${res.id}`);
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {/* Hero */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          alignItems: "center",
          textAlign: "center",
          padding: "1.5rem 0 2rem",
          maxWidth: 760,
          marginInline: "auto",
          width: "100%",
        }}
      >
        <SectionLabel style={{ color: "var(--accent)" }}>10-MAN · COMPLETE</SectionLabel>
        <h1
          style={{
            fontSize: "clamp(2.25rem, 5vw, 3.75rem)",
            fontWeight: 500,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            whiteSpace: "nowrap",
            color: "var(--text)",
          }}
        >
          <span style={{ color: "var(--accent)" }}>{winner?.displayName ?? "?"}</span> wins.
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", maxWidth: "46ch" }}>
          {winner?.displayName} def. {loser?.displayName}
          {result?.durationLabel ? ` in ${result.durationLabel}` : ""}. The W is in the books —
          bragging rights granted for the rest of the night.
        </p>
      </div>

      {/* Teams */}
      {cap1 && cap2 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto 1fr",
            gap: 20,
          }}
        >
          <TeamRoster
            captain={cap1}
            picks={picks.filter((p) => p.captainUserId === cap1.userId)}
            label="TEAM 1"
            side="B"
            winner={winnerCaptainId}
          />
          <VsDivider />
          <TeamRoster
            captain={cap2}
            picks={picks.filter((p) => p.captainUserId === cap2.userId)}
            label="TEAM 2"
            side="R"
            winner={winnerCaptainId}
          />
        </div>
      ) : null}

      {/* Footer */}
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
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
            Want to run it back?
          </span>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            Spin up another lobby — same players, fresh draft.
          </span>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <a
            href="/history"
            className="inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: "var(--text)", borderColor: "var(--border)" }}
          >
            View in history
          </a>
          {isAdmin ? (
            <Button
              size="sm"
              disabled={pending}
              onClick={handleRestart}
              className="rounded-full"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
            >
              {pending ? "Starting…" : "Start another 10-man"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
