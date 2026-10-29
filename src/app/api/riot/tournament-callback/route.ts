import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { applyTournamentCallback } from "@/lib/riot-results";
import { parseTournamentCallback } from "@/lib/riot-tournament-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Riot posts here when a tournament-code game ends (docs/MATCH-DAY.md,
// phase 6). Riot doesn't sign callbacks, so the provider URL carries a shared
// secret (?token=RIOT_TOURNAMENT_CALLBACK_SECRET). A 5xx asks Riot to retry —
// used while Match-v5 hasn't published the game yet.

function tokenOk(token: string | null): boolean {
  const secret = env.RIOT_TOURNAMENT_CALLBACK_SECRET;
  if (!secret || !token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!tokenOk(new URL(req.url).searchParams.get("token"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const cb = parseTournamentCallback(await req.json().catch(() => null));
  if (!cb) return new Response("Bad callback", { status: 400 });

  const outcome = await applyTournamentCallback(cb);
  if (outcome.status !== "recorded") {
    console.info(`[riot callback] ${cb.shortCode}: ${outcome.status} (${outcome.reason})`);
  }
  return outcome.status === "retry"
    ? new Response("Try again", { status: 503 })
    : Response.json({ ok: true, status: outcome.status });
}
