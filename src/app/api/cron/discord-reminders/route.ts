import { NextResponse } from "next/server";

import { sendDailyReminders } from "@/lib/discord-notify";
import { env } from "@/lib/env";

export const maxDuration = 300;

/** Daily Discord match reminders (vercel.json cron). See sendDailyReminders. */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await sendDailyReminders();
  if (report.errors.length) console.error("[discord] reminders", JSON.stringify(report));
  return NextResponse.json({
    posted: report.assigned,
    errors: report.errors.length,
    timestamp: new Date().toISOString(),
  });
}
