import { auth } from "@/auth";
import { getLiveSeason, LIVE_STATE_COPY, liveSeasonHref } from "@/lib/live-season";
import { SiteHeaderClient, type LiveSeasonPill } from "./site-header-client";

export async function SiteHeader() {
  const [session, live] = await Promise.all([auth(), getLiveSeason()]);

  const user = session?.user
    ? {
        name: session.user.name ?? session.user.username ?? null,
        role: session.user.role ?? null,
      }
    : null;

  const livePill: LiveSeasonPill | null =
    live && LIVE_STATE_COPY[live.state]
      ? { label: LIVE_STATE_COPY[live.state]!, href: liveSeasonHref(live) }
      : null;

  return <SiteHeaderClient user={user} livePill={livePill} />;
}
