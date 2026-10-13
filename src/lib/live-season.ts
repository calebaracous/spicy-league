import "server-only";

import { and, desc, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { seasons, type Season, type SeasonState } from "@/db/schema/seasons";

export async function getLiveSeason(): Promise<Season | null> {
  const rows = await db.query.seasons.findMany({
    where: and(
      inArray(seasons.state, [
        "signups_open",
        "signups_closed",
        "captains_selected",
        "drafting",
        "group_stage",
        "playoffs",
      ]),
    ),
    orderBy: [desc(seasons.createdAt)],
    limit: 1,
  });
  return rows[0] ?? null;
}

export const LIVE_STATE_COPY: Partial<Record<SeasonState, string>> = {
  signups_open: "SIGNUPS OPEN",
  signups_closed: "SIGNUPS CLOSED",
  captains_selected: "CAPTAINS SELECTED",
  drafting: "DRAFT IN PROGRESS",
  group_stage: "GROUP STAGE",
  playoffs: "PLAYOFFS",
};

export function liveSeasonHref(season: Pick<Season, "slug" | "state">): string {
  switch (season.state) {
    case "signups_open":
      return `/seasons/${season.slug}/signup`;
    case "drafting":
      return `/seasons/${season.slug}/draft`;
    default:
      return `/seasons/${season.slug}`;
  }
}
