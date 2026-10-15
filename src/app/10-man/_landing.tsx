"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { SectionLabel } from "@/components/ui/section-label";
import { ActionError, useTenManAction } from "./[id]/_phases/shared";
import { start10Man } from "./actions";

const STEPS = [
  { n: "01", t: "Signups", d: "Signups close when 10 players have joined." },
  {
    n: "02",
    t: "Vote",
    d: "Each player votes for 2 captains. The 2 with the most votes are captains.",
  },
  { n: "03", t: "Draft", d: "Captains take turns picking from the remaining 8 players." },
  {
    n: "04",
    t: "Play",
    d: "Teams are set and a lobby code is shown. An admin records the winner.",
  },
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
  const { pending, error, run } = useTenManAction();

  function handleStart() {
    run(start10Man, (res) => {
      if (res.id) router.push(`/10-man/${res.id}`);
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
            10-man
            <br />
            <span style={{ color: "var(--accent-text)" }}>pickup matches</span>
          </h1>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              color: "var(--muted)",
              maxWidth: "56ch",
            }}
          >
            A single 5v5 League of Legends match. Ten players sign up, vote for two captains, and
            the captains draft the remaining eight players into two teams.
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
                  Only admins can start a 10-man.
                </span>
              </>
            )}
          </div>
          <ActionError message={error} />
        </div>

        {/* How-it-works strip */}
        <div
          className="grid grid-cols-2 gap-4 md:grid-cols-4"
          style={{ paddingTop: "1rem", borderTop: "1px solid var(--border)" }}
        >
          {STEPS.map((step) => (
            <div
              key={step.n}
              style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 16 }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--accent-text)",
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
  const date = entry.completedAt ? <LocalTime date={entry.completedAt} preset="date-short" /> : "—";

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
      <span style={{ fontSize: 14, color: "var(--accent-text)" }}>→</span>
    </div>
  );
}
