import { neon } from "@neondatabase/serverless";
import { asc, eq, inArray, like } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../../../src/db/schema";
import { DATABASE_URL, E2E_EMAIL_DOMAIN, E2E_SLUG_PREFIX } from "./env";

const { users, seasons, seasonCaptains, drafts, draftPicks, teams, teamMembers, matches } = schema;

if (!DATABASE_URL) throw new Error("E2E: DATABASE_URL is not set (.env.local or E2E_DATABASE_URL)");

export const db = drizzle(neon(DATABASE_URL), { schema, casing: "snake_case" });

/** Delete everything the suite creates: e2e-* seasons (cascades to their
 *  signups, captains, draft, picks, teams, matches) and e2e users (cascades to
 *  sessions and credential accounts). Touches nothing else. */
export async function cleanupE2EData(): Promise<{ seasons: number; users: number }> {
  const s = await db
    .delete(seasons)
    .where(like(seasons.slug, `${E2E_SLUG_PREFIX}%`))
    .returning({ id: seasons.id });
  const u = await db
    .delete(users)
    .where(like(users.email, `%@${E2E_EMAIL_DOMAIN}`))
    .returning({ id: users.id });
  return { seasons: s.length, users: u.length };
}

export async function userIdsByUsername(usernames: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.username, usernames));
  return new Map(rows.map((r) => [r.username!, r.id]));
}

export async function getSeason(slug: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) throw new Error(`season ${slug} not found`);
  return season;
}

export async function getCaptainOrder(slug: string): Promise<string[]> {
  const season = await getSeason(slug);
  const rows = await db
    .select({ username: users.username })
    .from(seasonCaptains)
    .innerJoin(users, eq(users.id, seasonCaptains.userId))
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder));
  return rows.map((r) => r.username!);
}

export async function getDraft(slug: string) {
  const season = await getSeason(slug);
  return db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
}

/** Picks in order, as usernames. */
export async function getPicks(slug: string) {
  const draft = await getDraft(slug);
  if (!draft) return [];
  const rows = await db.select().from(draftPicks).where(eq(draftPicks.draftId, draft.id));
  const ids = [...new Set(rows.flatMap((r) => [r.captainUserId, r.pickedUserId]))];
  const names = new Map(
    ids.length
      ? (
          await db
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.id, ids))
        ).map((u) => [u.id, u.username!])
      : [],
  );
  return rows
    .sort((a, b) => a.pickNumber - b.pickNumber)
    .map((r) => ({
      pickNumber: r.pickNumber,
      captain: names.get(r.captainUserId)!,
      picked: names.get(r.pickedUserId)!,
    }));
}

/** Teams with members (usernames + pick numbers), keyed by captain username. */
export async function getTeams(slug: string) {
  const season = await getSeason(slug);
  const teamRows = await db.select().from(teams).where(eq(teams.seasonId, season.id));
  const result = new Map<
    string,
    { name: string; members: { username: string; pickNumber: number | null }[] }
  >();
  for (const t of teamRows) {
    const members = await db
      .select({ username: users.username, pickNumber: teamMembers.pickNumber })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.teamId, t.id));
    const captain = members.find((m) => m.pickNumber === null)?.username ?? "?";
    result.set(captain, {
      name: t.name,
      members: members.map((m) => ({ username: m.username!, pickNumber: m.pickNumber })),
    });
  }
  return result;
}

export async function countMatches(slug: string): Promise<number> {
  const season = await getSeason(slug);
  return (await db.select({ id: matches.id }).from(matches).where(eq(matches.seasonId, season.id)))
    .length;
}
