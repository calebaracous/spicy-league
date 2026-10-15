"use client";

import type { LiveStatus } from "@/components/use-turn-alert";
import { useTurnSoundPref } from "@/components/use-turn-alert";

const LABELS: Record<LiveStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  reconnecting: "Reconnecting…",
};

/** Small "● Live" / "Reconnecting…" indicator for SSE-fed boards. */
export function LiveStatusDot({ status }: { status: LiveStatus }) {
  const ok = status === "live";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs"
      style={{ color: ok ? "var(--muted)" : "var(--accent-text)" }}
      role="status"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: ok ? "#22c55e" : "var(--accent)" }}
      />
      {LABELS[status]}
    </span>
  );
}

/** Checkbox for the opt-in "chime when it's my pick" preference. */
export function TurnSoundToggle() {
  const [on, setOn] = useTurnSoundPref();
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1.5 text-xs"
      style={{ color: "var(--muted)" }}
    >
      <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
      Chime on my pick
    </label>
  );
}
