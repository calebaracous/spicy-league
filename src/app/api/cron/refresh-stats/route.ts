import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { refreshAllRiotStats } from "@/lib/stat-refresh";

export const maxDuration = 300; // 5-minute Vercel function timeout

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const refreshed = await refreshAllRiotStats();
  return NextResponse.json({ refreshed, timestamp: new Date().toISOString() });
}
