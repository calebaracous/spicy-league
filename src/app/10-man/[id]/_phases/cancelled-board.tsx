import Link from "next/link";

import { PhaseBanner } from "./shared";
import type { TenManSnapshotClient } from "./types";

/** Terminal state for a 10-man an admin called off before it finished. */
export function CancelledBoard({ snap }: { snap: TenManSnapshotClient }) {
  const count = snap.signups.length;
  return (
    <PhaseBanner
      phaseLabel="CANCELLED"
      title="This 10-man was cancelled"
      sub={`${count} player${count !== 1 ? "s" : ""} had signed up.`}
      right={
        <Link
          href="/10-man"
          className="inline-flex items-center justify-center rounded-full border px-4 py-1.5 text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: "var(--text)", borderColor: "var(--border)" }}
        >
          Back to 10-mans
        </Link>
      }
    />
  );
}
