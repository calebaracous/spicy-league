"use client";

import { SectionLabel } from "@/components/ui/section-label";

/** Initials avatar circle */
export function Avatar({
  name,
  size = 40,
  captain = false,
}: {
  name: string;
  size?: number;
  captain?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: captain ? "rgba(185, 28, 28, 0.18)" : "var(--surface)",
        border: `1px solid ${captain ? "var(--accent)" : "var(--border)"}`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size < 36 ? 11 : 13,
        fontWeight: 600,
        color: captain ? "var(--accent)" : "var(--muted)",
        flexShrink: 0,
        letterSpacing: "0.03em",
      }}
    >
      {initials || "?"}
    </div>
  );
}

/** Phase banner — top bar used across all phases */
export function PhaseBanner({
  phaseLabel,
  title,
  sub,
  progress,
  right,
}: {
  phaseLabel: string;
  title: string;
  sub?: string;
  progress?: number;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "16px 20px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        flexWrap: "wrap",
      }}
    >
      {/* Left: label + title */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
        <SectionLabel>{phaseLabel}</SectionLabel>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 500, color: "var(--text)" }}>{title}</span>
          {sub ? <span style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</span> : null}
        </div>
      </div>

      {/* Middle: progress bar */}
      {typeof progress === "number" ? (
        <div
          style={{
            maxWidth: 240,
            flex: "1 1 120px",
            height: 4,
            background: "var(--border)",
            borderRadius: 9999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(progress * 100)}%`,
              background: "var(--accent)",
              borderRadius: 9999,
              transition: "width 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>
      ) : null}

      {/* Right: action buttons */}
      {right ? <div style={{ display: "flex", gap: 10, alignItems: "center" }}>{right}</div> : null}
    </div>
  );
}
