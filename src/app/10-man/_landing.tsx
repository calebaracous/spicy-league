"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { start10Man } from "./actions";

const STEPS = [
  { n: "01", t: "Signups", d: "First 10 names lock the lobby." },
  { n: "02", t: "Vote", d: "Everyone picks 2 captains. Top 2 win." },
  { n: "03", t: "Draft", d: "Snake draft on the 8 remaining." },
  { n: "04", t: "Play", d: "Teams locked. Lobby up. Report the W." },
] as const;

type HistoryEntry = {
  id: string;
  completedAt: Date | null;
  durationLabel: string | null;
  winnerName: string;
  loserName: string;
};

export function TenManLanding({ isAdmin, history }: { isAdmin: boolean; history: HistoryEntry[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleStart() {
    startTransition(async () => {
      const result = await start10Man();
      router.push(`/10-man/${result.id}`);
    });
  }

  return (
    <div className="site-container" style={{ paddingTop: "3rem", paddingBottom: "6rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
        {/* Hero */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: 720 }}>
          <SectionLabel>10-MAN · PICKUP MATCH</SectionLabel>
          <h1
            style={{
              fontSize: "clamp(2.75rem, 7vw, 5.5rem)",
              fontWeight: 500,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              color: "var(--text)",
            }}
          >
            Got 10?
            <br />
            <span style={{ color: "var(--accent)" }}>Let&apos;s go.</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: "var(--muted)",
              maxWidth: "56ch",
            }}
          >
            A one-off 5v5 for whoever&apos;s around. Sign up, vote on captains, draft from the pool,
            and play. The whole thing takes about 15 minutes — usually less.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
              alignItems: "center",
              paddingTop: 8,
            }}
          >
            {isAdmin ? (
              <Button
                onClick={handleStart}
                disabled={pending}
                className="rounded-full px-6 py-2.5"
                style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
              >
                {pending ? "Starting…" : "Start a 10-man"}
              </Button>
            ) : (
              <>
                <Button
                  disabled
                  className="rounded-full px-6 py-2.5 opacity-40"
                  style={{ backgroundColor: "var(--accent)", color: "var(--accent-fg)" }}
                >
                  Start a 10-man
                </Button>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Admins start the session — you&apos;ll get the join link.
                </span>
              </>
            )}
          </div>
        </div>

        {/* How-it-works strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          {STEPS.map((step) => (
            <div
              key={step.n}
              style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--accent)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {step.n}
              </span>
              <h3 style={{ fontSize: 16, fontWeight: 500, color: "var(--text)" }}>{step.t}</h3>
              <p style={{ fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>{step.d}</p>
            </div>
          ))}
        </div>

        {/* Recent 10-mans */}
        {history.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <SectionLabel>RECENT 10-MANS</SectionLabel>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {history.length} completed
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column" }}>
              {history.map((m, i) => (
                <HistoryRow key={m.id} entry={m} first={i === 0} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HistoryRow({ entry, first }: { entry: HistoryEntry; first: boolean }) {
  const idSuffix = entry.id.split("-")[0] ?? entry.id.substring(0, 8);
  const date = entry.completedAt
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(entry.completedAt)
    : "—";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: 20,
        alignItems: "center",
        padding: "16px 4px",
        borderTop: first ? "1px solid var(--border)" : "none",
        borderBottom: "1px solid var(--border)",
        transition: "background 0.2s, padding-inline 0.2s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "var(--surface)";
        (e.currentTarget as HTMLDivElement).style.paddingInline = "16px";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = "transparent";
        (e.currentTarget as HTMLDivElement).style.paddingInline = "4px";
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: "var(--muted)",
          fontFamily: "var(--font-geist-mono)",
          letterSpacing: "0.05em",
        }}
      >
        #{idSuffix}
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
            {entry.winnerName}
          </span>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>def.</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>{entry.loserName}</span>
        </div>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          {date}
          {entry.durationLabel ? ` · ${entry.durationLabel}` : ""}
        </span>
      </div>

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
        W
      </span>
      <span style={{ fontSize: 14, color: "var(--accent)" }}>→</span>
    </div>
  );
}
