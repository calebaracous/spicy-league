import Link from "next/link";

import type { SeasonState } from "@/db/schema/seasons";
import { SEASON_STATES } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export type SeasonTab = "overview" | "captains" | "draft" | "teams" | "matches";

/** Tabs appear once the season reaches the state where they have content. */
const TABS: { id: SeasonTab; label: string; path: string; from: SeasonState }[] = [
  { id: "overview", label: "Overview", path: "", from: "signups_open" },
  { id: "captains", label: "Captains", path: "/captains", from: "captains_selected" },
  { id: "draft", label: "Draft", path: "/draft", from: "drafting" },
  { id: "teams", label: "Teams", path: "/teams", from: "group_stage" },
  { id: "matches", label: "Matches", path: "/matches", from: "group_stage" },
];

function reached(state: SeasonState, from: SeasonState): boolean {
  return SEASON_STATES.indexOf(state) >= SEASON_STATES.indexOf(from);
}

/**
 * Section tabs shared by every /seasons/[slug]/* page, so people can move
 * between overview, draft, teams and matches without going back up a level.
 */
export function SeasonNav({
  slug,
  state,
  current,
}: {
  slug: string;
  state: SeasonState;
  current: SeasonTab;
}) {
  const tabs = TABS.filter((t) => t.id === current || reached(state, t.from));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label="Season sections" className="-mx-1 overflow-x-auto overflow-y-hidden border-b">
      <ul className="flex min-w-max gap-1 px-1">
        {tabs.map((t) => {
          const active = t.id === current;
          return (
            <li key={t.id}>
              <Link
                href={`/seasons/${slug}${t.path}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-block border-b-2 px-3 py-2 text-sm transition-colors",
                  active
                    ? "text-foreground border-[color:var(--accent)] font-medium"
                    : "text-muted-foreground hover:text-foreground border-transparent",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
