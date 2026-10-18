import "server-only";

import { ensureMatchThreads } from "@/lib/discord-notify";
import { syncChampionRole, syncSignupRoles, syncTenManRole } from "@/lib/discord-ping-roles";
import {
  mergeReports,
  syncCaptainRole,
  syncTeamRoles,
  type DiscordSyncReport,
} from "@/lib/discord-roles";

/**
 * Everything the bot keeps in step for a season, for the admin "Sync Discord"
 * button: Captain, team roles + channels, Signed up / Sub list, Champion,
 * 10-man opt-ins and missing match threads. All idempotent.
 */
export async function syncSeasonDiscord(seasonId: string): Promise<DiscordSyncReport> {
  // Sequential on purpose: they share Discord's rate limits.
  const captain = await syncCaptainRole(seasonId);
  const teams = await syncTeamRoles(seasonId);
  const signups = await syncSignupRoles(seasonId);
  const champion = await syncChampionRole(seasonId);
  const tenMan = await syncTenManRole();
  const threads = await ensureMatchThreads(seasonId);
  return mergeReports(captain, teams, signups, champion, tenMan, threads);
}
