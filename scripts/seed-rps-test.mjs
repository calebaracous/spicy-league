// Seed (or reset) a match-day test season on STAGING, for trying RPS side
// select by hand (docs/MATCH-DAY.md):
//
//   node scripts/seed-rps-test.mjs
//
// Creates two captain accounts, `rps_cap_a` and `rps_cap_b`, sharing the
// password TEST_CAPTAIN_PASSWORD from .env.development.local (generated and
// appended on first run, never printed). Season `rps-test` (LoL, group stage)
// has Team A (rps_cap_a, plus claudius as duo co-captain if that account
// exists) vs Team B (rps_cap_b) in three scheduled matches. Re-running resets
// those matches to scheduled and wipes their RPS / side data.
//
// Refuses to run against the production DATABASE_URL.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "@better-auth/utils/password";
import { neon } from "@neondatabase/serverless";
import { config, parse } from "dotenv";

const ENV_FILE = ".env.development.local";
config({ path: ENV_FILE, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL is not set (${ENV_FILE}).`);
  process.exit(1);
}
const prodUrl = existsSync(".env.production.local")
  ? parse(readFileSync(".env.production.local")).DATABASE_URL
  : null;
if (prodUrl && prodUrl === url) {
  console.error("DATABASE_URL is the production database. This script is for staging only.");
  process.exit(1);
}

let password = process.env.TEST_CAPTAIN_PASSWORD;
if (!password) {
  password = randomBytes(18).toString("base64url");
  appendFileSync(
    ENV_FILE,
    `\n# RPS test captains rps_cap_a / rps_cap_b (scripts/seed-rps-test.mjs)\nTEST_CAPTAIN_PASSWORD=${password}\n`,
  );
  console.log(`Saved TEST_CAPTAIN_PASSWORD to ${ENV_FILE}.`);
}

const sql = neon(url);
const hash = await hashPassword(password);

const CAPTAINS = [
  { username: "rps_cap_a", name: "RPS Captain A", discord: "spicy_rps_a_test" },
  { username: "rps_cap_b", name: "RPS Captain B", discord: "spicy_rps_b_test" },
];

async function upsertCaptain({ username, name, discord }) {
  const email = `${username}@spicyleague.test`;
  const [existing] = await sql`select id from users where username = ${username}`;
  if (existing) {
    await sql`update accounts set password = ${hash}, updated_at = now()
              where user_id = ${existing.id} and provider_id = 'credential'`;
    return existing.id;
  }
  const id = randomUUID();
  await sql.transaction([
    sql`insert into users (id, email, email_verified, username, name, discord_username, role)
        values (${id}, ${email}, true, ${username}, ${name}, ${discord}, 'user')`,
    sql`insert into accounts (id, account_id, provider_id, user_id, password)
        values (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})`,
  ]);
  return id;
}

const [capA, capB] = [await upsertCaptain(CAPTAINS[0]), await upsertCaptain(CAPTAINS[1])];
const [claudius] = await sql`select id from users where username = 'claudius'`;

const SLUG = "rps-test";
let [season] = await sql`select id from seasons where slug = ${SLUG}`;
if (!season) {
  [season] = await sql`insert into seasons (id, name, slug, game, state)
                       values (${randomUUID()}, 'RPS Test (staging)', ${SLUG}, 'lol', 'group_stage')
                       returning id`;
}

async function upsertTeam(name, captainId, coCaptainId) {
  let [team] =
    await sql`select id from teams where season_id = ${season.id} and captain_user_id = ${captainId}`;
  if (!team) {
    [team] = await sql`insert into teams (id, season_id, name, captain_user_id)
                       values (${randomUUID()}, ${season.id}, ${name}, ${captainId}) returning id`;
  }
  for (const userId of [captainId, coCaptainId].filter(Boolean)) {
    await sql`insert into team_members (id, team_id, user_id, pick_number)
              values (${randomUUID()}, ${team.id}, ${userId}, null)
              on conflict (team_id, user_id) do nothing`;
  }
  return team.id;
}

const teamA = await upsertTeam("Team A", capA, claudius?.id ?? null);
const teamB = await upsertTeam("Team B", capB, null);

const existingMatches = await sql`select id from matches where season_id = ${season.id}`;
if (existingMatches.length === 0) {
  for (const round of [1, 2, 3]) {
    await sql`insert into matches (id, season_id, round, stage, home_team_id, away_team_id)
              values (${randomUUID()}, ${season.id}, ${round}, 'group', ${teamA}, ${teamB})`;
  }
} else {
  const ids = existingMatches.map((m) => m.id);
  await sql.transaction([
    sql`delete from match_games where match_id = any(${ids})`,
    sql`delete from match_rps where match_id = any(${ids})`,
    sql`update matches set state = 'scheduled', winner_team_id = null, home_score = null,
        away_score = null, reported_by = null, reported_at = null, confirmed_at = null
        where id = any(${ids})`,
  ]);
}

const matches =
  await sql`select id, round from matches where season_id = ${season.id} order by round`;
const base = process.env.NEXT_PUBLIC_APP_URL?.includes("localhost")
  ? "https://spicy-league-git-staging-calebaracous-projects.vercel.app"
  : (process.env.NEXT_PUBLIC_APP_URL ?? "");
console.log(
  `Season ${SLUG}: Team A (rps_cap_a${claudius ? " + claudius" : ""}) vs Team B (rps_cap_b).`,
);
for (const m of matches) console.log(`  Round ${m.round}: ${base}/seasons/${SLUG}/matches/${m.id}`);
