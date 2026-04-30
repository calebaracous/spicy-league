import { getHomepageData } from "@/lib/homepage";
import { liveSeasonHref } from "@/lib/live-season";
import { Divider } from "@/components/ui/divider";
import { Hero } from "./_sections/hero";
import { SignupSection } from "./_sections/signup-section";
import { DraftSection } from "./_sections/draft-section";
import { LiveSection } from "./_sections/live-section";
import { UpcomingSection } from "./_sections/upcoming-section";
import { OffSeasonSection } from "./_sections/off-season-section";
import { PastSeasonsStrip } from "./_sections/past-seasons-strip";

export const dynamic = "force-dynamic";

const HERO_LABELS: Record<string, string> = {
  signup_lol: "SIGNUPS OPEN",
  signup_cs2: "SIGNUPS OPEN",
  draft: "DRAFT PENDING",
  live_group_stage: "GROUP STAGE LIVE",
  live_playoffs: "PLAYOFFS LIVE",
  upcoming: "NEXT SEASON COMING",
  off_season: "OFF-SEASON",
};

export default async function Home() {
  const data = await getHomepageData();

  const heroLabel =
    data.state === "live"
      ? (HERO_LABELS[`live_${data.season.state}`] ?? "LIVE")
      : (HERO_LABELS[data.state] ?? "COMMUNITY LEAGUE");

  const liveHref =
    data.state !== "off_season"
      ? liveSeasonHref({ slug: data.season.slug, state: data.season.state })
      : undefined;

  return (
    <>
      <Hero liveHref={liveHref} liveLabel={heroLabel} />
      <Divider />

      {data.state === "signup_lol" && (
        <SignupSection
          season={data.season}
          signupCount={data.signupCount}
          topPlayers={data.topPlayers}
        />
      )}

      {data.state === "signup_cs2" && (
        <SignupSection
          season={data.season}
          signupCount={data.signupCount}
          topPlayers={data.highlightedPlayers}
        />
      )}

      {data.state === "draft" && (
        <DraftSection
          season={data.season}
          captains={data.captains}
          topNonCaptains={data.topNonCaptains}
        />
      )}

      {data.state === "live" && (
        <LiveSection season={data.season} nextMatch={data.nextMatch} topPlayers={data.topPlayers} />
      )}

      {data.state === "upcoming" && <UpcomingSection season={data.season} />}

      {data.state === "off_season" && (
        <OffSeasonSection lastSeason={data.lastSeason} podium={data.podium} />
      )}

      <Divider />
      <PastSeasonsStrip seasons={data.pastSeasons} />
    </>
  );
}
