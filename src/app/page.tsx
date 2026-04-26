import { getLiveSeason, liveSeasonHref } from "@/lib/live-season";
import { Hero } from "./_sections/hero";
import { About } from "./_sections/about";
import { HowItWorks } from "./_sections/how-it-works";
import { LatestSeasons } from "./_sections/latest-seasons";
import { CallToAction } from "./_sections/call-to-action";
import { Divider } from "@/components/ui/divider";

export const dynamic = "force-dynamic";

export default async function Home() {
  const live = await getLiveSeason();
  const liveHref = live ? liveSeasonHref(live) : undefined;

  return (
    <>
      <Hero liveHref={liveHref} />
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
