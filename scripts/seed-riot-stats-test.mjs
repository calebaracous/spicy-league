// Fake Riot tournament stats for the staging test season, to see the match
// page Scoreboard and profile averages without a real tournament game
// (docs/MATCH-DAY.md, phase 6):
//
//   node scripts/seed-rps-test.mjs          # first: the season + captains
//   node scripts/seed-riot-stats-test.mjs
//
// Gives the `rps-test` season's first group match a game 1 (Team A blue) won
// by Team A, with ten player lines: rps_cap_a (opted in) and rps_cap_b (opted
// out) linked, the rest unlinked. Re-run seed-rps-test.mjs to wipe it.
//
// Refuses to run against the production DATABASE_URL.
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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

const sql = neon(url);
const [season] = await sql`select id from seasons where slug = 'rps-test'`;
if (!season) {
  console.error("No rps-test season. Run scripts/seed-rps-test.mjs first.");
  process.exit(1);
}
const [match] = await sql`
  select id, home_team_id, away_team_id from matches
  where season_id = ${season.id} and stage = 'group' order by round limit 1`;
const users = Object.fromEntries(
  (await sql`select id, username from users where username in ('rps_cap_a', 'rps_cap_b')`).map(
    (u) => [u.username, u.id],
  ),
);
await sql`update users set stats_opt_in_at = now() where id = ${users.rps_cap_a}`;
await sql`update users set stats_opt_in_at = null where id = ${users.rps_cap_b}`;

await sql`delete from match_games where match_id = ${match.id}`;
const gameId = randomUUID();
await sql`
  insert into match_games (id, match_id, game_number, side_chooser_team_id, side_chosen_via,
    side_chosen_at, blue_team_id, red_team_id, draft_state, winner_team_id)
  values (${gameId}, ${match.id}, 1, ${match.home_team_id}, 'rps', now(),
    ${match.home_team_id}, ${match.away_team_id}, 'skipped', ${match.home_team_id})`;

const lines = [
  ["blue", "Garen", users.rps_cap_a, 7, 2, 9, 212, 13400, 21800, 18],
  ["blue", "LeeSin", null, 4, 3, 12, 160, 11000, 14200, 34],
  ["blue", "Ahri", null, 9, 1, 6, 245, 14900, 28300, 15],
  ["blue", "Jinx", null, 6, 2, 7, 268, 15200, 26100, 12],
  ["blue", "Thresh", null, 0, 4, 18, 32, 8100, 5400, 71],
  ["red", "Darius", users.rps_cap_b, 3, 6, 2, 190, 10100, 17200, 11],
  ["red", "Vi", null, 2, 5, 4, 140, 9300, 11000, 28],
  ["red", "Lux", null, 3, 6, 3, 220, 10800, 19900, 22],
  ["red", "Caitlyn", null, 4, 5, 2, 250, 12100, 18500, 10],
  ["red", "Nautilus", null, 0, 4, 9, 28, 7200, 4800, 63],
];
for (const [side, champ, userId, k, d, a, cs, gold, dmg, vision] of lines) {
  await sql`
    insert into match_game_player_stats (id, game_id, puuid, user_id, side, champion_key,
      kills, deaths, assists, cs, gold, damage, vision_score, win)
    values (${randomUUID()}, ${gameId}, ${`fake-${randomUUID()}`}, ${userId}, ${side}, ${champ},
      ${k}, ${d}, ${a}, ${cs}, ${gold}, ${dmg}, ${vision}, ${side === "blue"})`;
}
console.log(`Seeded Riot stats: /seasons/rps-test/matches/${match.id}`);
