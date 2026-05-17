/**
 * SnakeOrderStrip — 8 cells showing the C1/C2 snake pick order.
 * Past picks are muted. Current pick pulses in accent. Future picks have a thin border.
 */

// Snake draft order for a 2-captain 5v5 (captains + 4 picks each):
// C1, C2, C2, C1, C1, C2, C2, C1
export const SNAKE_ORDER = [1, 2, 2, 1, 1, 2, 2, 1] as const;

interface SnakeOrderStripProps {
  /** 1-indexed pick number that is currently on the clock (undefined = draft complete) */
  currentPick?: number;
}

export function SnakeOrderStrip({ currentPick }: SnakeOrderStripProps) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      {SNAKE_ORDER.map((capOrder, i) => {
        const pickNum = i + 1;
        const isPast = currentPick !== undefined && pickNum < currentPick;
        const isCurrent = currentPick !== undefined && pickNum === currentPick;

        return (
          <div
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              borderRadius: 6,
              background: isCurrent
                ? "var(--accent)"
                : isPast
                  ? "rgba(245, 240, 232, 0.06)"
                  : "transparent",
              border: `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
              color: isCurrent ? "var(--accent-fg)" : isPast ? "var(--muted)" : "var(--text)",
              fontSize: 11,
              fontFamily: "var(--font-geist-mono)",
              fontWeight: 500,
              animation: isCurrent ? "pulseDot 1.6s ease-in-out infinite" : "none",
              transition: "all 0.2s",
              flexShrink: 0,
            }}
          >
            C{capOrder}
          </div>
        );
      })}
      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="pulseDot"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
