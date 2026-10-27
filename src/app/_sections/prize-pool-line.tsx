import { describePayouts, formatUsd, prizePayouts } from "@/lib/prize-pool";
import type { Season } from "@/db/schema/seasons";
import { cn } from "@/lib/utils";

/** "$250 prize pool · 1st $187.50 · 2nd $62.50"; nothing when the season has no prize pool. */
export function PrizePoolLine({ season, className }: { season: Season; className?: string }) {
  const payouts = prizePayouts(season);
  if (payouts.length === 0) return null;
  return (
    <p className={cn("leading-relaxed", className)} style={{ color: "var(--muted)" }}>
      <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
        {formatUsd(season.prizePool!)} prize pool
      </span>{" "}
      · {describePayouts(payouts)}
    </p>
  );
}
