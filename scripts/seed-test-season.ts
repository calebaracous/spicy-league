/**
 * Seeds a mock LoL season with 16 bot players + 4 captain accounts.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/seed-test-season.ts
 *
 * To reset: run again — it cleans up existing test data first.
 *
 * Captain accounts (password: spicy123!):
 *   captain1, captain2, captain3, captain4
 *
 * Bot player accounts (same password, no need to sign in):
 *   botplayer1 … botplayer16
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "@better-auth/utils/password";
import { eq, inArray } from "drizzle-orm";

import * as schema from "../src/db/schema/index.js";

const { users, accounts } = schema;
const { seasons, seasonSignups, seasonCaptains } = schema;

const SEASON_SLUG = "test-s1";
const SEASON_NAME = "Test Season 1";
const FAKE_PASSWORD = "spicy123!";
const PLAYER_COUNT = 16;
const CAPTAIN_COUNT = 4;

const LOL_ROLES = ["top", "jungle", "mid", "adc", "support", "fill"];

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("DATABASE_URL not set — run with --env-file=.env.local");

  const db = drizzle(neon(dbUrl), { schema, casing: "snake_case" });

  // ── Clean up previous run ─────────────────────────────────────────────────

  const existingSeason = await db.query.seasons.findFirst({
    where: eq(seasons.slug, SEASON_SLUG),
  });
  if (existingSeason) {
    console.log("Removing previous test season…");
    await db.delete(seasons).where(eq(seasons.id, existingSeason.id));
  }

  const testEmails = [
    ...Array.from({ length: PLAYER_COUNT }, (_, i) => `botplayer${i + 1}@test.spicyleague.dev`),
    ...Array.from({ length: CAPTAIN_COUNT }, (_, i) => `captain${i + 1}@test.spicyleague.dev`),
  ];
  await db.delete(users).where(inArray(users.email, testEmails));

  // ── Hash the shared password once ─────────────────────────────────────────

  console.log("Hashing password…");
  const hash = await hashPassword(FAKE_PASSWORD);

  // ── Create 16 bot players ─────────────────────────────────────────────────

  console.log("Creating 16 bot players…");
  const botPlayers: { id: string; username: string }[] = [];

  for (let i = 1; i <= PLAYER_COUNT; i++) {
    const id = crypto.randomUUID();
    const username = `botplayer${i}`;
    const email = `botplayer${i}@test.spicyleague.dev`;

    await db.insert(users).values({ id, email, emailVerified: true, username, name: `Bot ${i}` });
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });

    botPlayers.push({ id, username });
  }

  // ── Create 4 captain accounts ─────────────────────────────────────────────

  console.log("Creating 4 captain accounts…");
  const captains: { id: string; username: string }[] = [];

  const captainRoles = ["top", "mid", "adc", "jungle"];

  for (let i = 1; i <= CAPTAIN_COUNT; i++) {
    const id = crypto.randomUUID();
    const username = `captain${i}`;
    const email = `captain${i}@test.spicyleague.dev`;

    await db.insert(users).values({
      id,
      email,
      emailVerified: true,
      username,
      name: `Captain ${i}`,
    });
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });

    captains.push({ id, username });
  }

  // ── Create test season ────────────────────────────────────────────────────

  console.log("Creating test season…");
  const seasonId = crypto.randomUUID();
  await db.insert(seasons).values({
    id: seasonId,
    name: SEASON_NAME,
    slug: SEASON_SLUG,
    game: "lol",
    state: "captains_selected",
    description: "Mock season for testing the draft and bracket flows.",
  });

  // ── Sign up all players ───────────────────────────────────────────────────

  console.log("Creating signups…");

  for (let i = 0; i < botPlayers.length; i++) {
    const primaryRole = LOL_ROLES[i % LOL_ROLES.length];
    const secondaryRole = LOL_ROLES[(i + 2) % LOL_ROLES.length];
    await db.insert(seasonSignups).values({
      seasonId,
      userId: botPlayers[i].id,
      rolePrefs: { primaryRole, secondaryRole },
      notes: `Seeded bot player ${i + 1}`,
    });
  }

  for (let i = 0; i < captains.length; i++) {
    await db.insert(seasonSignups).values({
      seasonId,
      userId: captains[i].id,
      rolePrefs: { primaryRole: captainRoles[i], secondaryRole: "fill" },
    });
  }

  // ── Promote captains ──────────────────────────────────────────────────────

  console.log("Promoting captains…");
  for (let i = 0; i < captains.length; i++) {
    await db.insert(seasonCaptains).values({
      seasonId,
      userId: captains[i].id,
      captainOrder: i + 1,
    });
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log(`
✅ Test season seeded!

   Season page:   /seasons/${SEASON_SLUG}
   Admin panel:   /admin/seasons/${SEASON_SLUG}

📋 Captain accounts (password: ${FAKE_PASSWORD})
   captain1   captain2   captain3   captain4

   Snake order: 1→2→3→4→4→3→2→1→1→2→3→4→4→3→2→1
   Each captain picks 4 players → 5-player teams.

👥 16 bot players: botplayer1 … botplayer16
   (No need to sign in as them — they just fill the pool.)

➡️  Next steps:
   1. Go to /admin/seasons/${SEASON_SLUG}
   2. Click "Start Draft"
   3. Open 4 browser sessions signed in as captain1–4
   4. Make picks in snake order — draft auto-finalizes on pick 16
   5. Admin can also use the override mode to pick on any captain's behalf
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
