import { liveMatchLabel, type LiveMatch } from "@/lib/live-match";
import { cn } from "@/lib/utils";

/** "● Live · Game 2 · 1–0" pill for a match being played right now. */
export function LiveMatchBadge({
  live,
  awayView = false,
  className,
}: {
  live: LiveMatch;
  /** Score from the away team's side (a card about that team). */
  awayView?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      style={{ borderColor: "var(--accent)", color: "var(--accent-text)" }}
    >
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
          style={{ background: "var(--accent)" }}
        />
        <span
          className="relative inline-flex h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--accent-text)" }}
        />
      </span>
      {liveMatchLabel(live, awayView)}
    </span>
  );
}
