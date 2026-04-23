import { and, desc, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Hero } from "./_sections/hero";
import { About } from "./_sections/about";
import { HowItWorks } from "./_sections/how-it-works";
import { LatestSeasons } from "./_sections/latest-seasons";
import { CallToAction } from "./_sections/call-to-action";
import { Divider } from "@/components/ui/divider";

export const dynamic = "force-dynamic";

async function getLiveSeason() {
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

const LIVE_STATE_COPY: Record<string, string> = {
  signups_open: "SIGNUPS OPEN",
  signups_closed: "CAPTAINS INCOMING",
  captains_selected: "DRAFT PENDING",
  drafting: "DRAFT LIVE",
  group_stage: "GROUP STAGE LIVE",
  playoffs: "PLAYOFFS LIVE",
};

export default async function Home() {
  const live = await getLiveSeason();
  const liveLabel = live ? LIVE_STATE_COPY[live.state] : undefined;
  const liveHref = live ? `/seasons/${live.slug}` : undefined;

  return (
    <>
      <Hero liveLabel={liveLabel} liveHref={liveHref} />
      <Divider />
      <About />
      <Divider />
      <HowItWorks />
      <Divider />
      <LatestSeasons />
      <CallToAction />
    </>
  );
}
