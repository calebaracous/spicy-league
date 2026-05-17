import { auth } from "@/auth";
import { getLiveSeason, LIVE_STATE_COPY, liveSeasonHref } from "@/lib/live-season";
import { getActiveTenMan } from "@/lib/ten-man";
import { SiteHeaderClient, type LiveSeasonPill } from "./site-header-client";

function tenManPillLabel(state: string, signupCount: number): string | null {
  switch (state) {
    case "signups":
      return `10-MAN · ${signupCount}/10`;
    case "voting":
      return "10-MAN · VOTING";
    case "drafting":
      return "10-MAN · DRAFTING";
    case "ready":
      return "10-MAN · READY";
    default:
      return null;
  }
}

export async function SiteHeader() {
  const [session, live, activeTenMan] = await Promise.all([
    auth(),
    getLiveSeason(),
    getActiveTenMan(),
  ]);

  const user = session?.user
    ? {
        name: session.user.name ?? session.user.username ?? null,
        role: session.user.role ?? null,
      }
    : null;

  // Season pill takes priority; fall back to 10-man pill
  let livePill: LiveSeasonPill | null =
    live && LIVE_STATE_COPY[live.state]
      ? { label: LIVE_STATE_COPY[live.state]!, href: liveSeasonHref(live) }
      : null;

  if (!livePill && activeTenMan) {
    // We need the signup count for the label but getActiveTenMan only returns
    // the tenMan row. Import the snapshot would be too heavy here; instead we
    // fetch just the count lazily.
    const { db } = await import("@/db/client");
    const { tenManSignups } = await import("@/db/schema/ten-mans");
    const { eq, count } = await import("drizzle-orm");

    const [{ n }] = await db
      .select({ n: count() })
      .from(tenManSignups)
      .where(eq(tenManSignups.tenManId, activeTenMan.id));

    const label = tenManPillLabel(activeTenMan.state, n);
    if (label) {
      livePill = { label, href: `/10-man/${activeTenMan.id}` };
    }
  }

  return <SiteHeaderClient user={user} livePill={livePill} />;
}
