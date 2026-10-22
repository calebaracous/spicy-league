import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logEvent, pruneOldEvents } from "@/lib/events";
import { refreshAllRiotStats } from "@/lib/stat-refresh";

export const maxDuration = 300; // 5-minute Vercel function timeout

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Events inbox retention rides on this daily cron (EVENT_RETENTION_DAYS).
  const prunedEvents = await pruneOldEvents();
  const refreshed = await refreshAllRiotStats();
  await logEvent("stats.refreshed", { data: { count: refreshed } });
  return NextResponse.json({ refreshed, prunedEvents, timestamp: new Date().toISOString() });
}
