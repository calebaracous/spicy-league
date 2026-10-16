// One-off: wipe league data + obvious test accounts, then create Season 12.
//
//   node scripts/season-12-setup.mjs           dry run — prints what would go
//   node scripts/season-12-setup.mjs --apply   does it, in one transaction
//
// Reads DATABASE_URL from .env.local or the environment. Needs migration
// 0005_season_schedule applied first (the new season's schedule columns).
//
// "League data" = every season (cascades to signups, captains, drafts, picks,
// teams, matches, substitutions) and every 10-man (cascades to its tables).
// Test accounts = non-admin users whose email is on a test domain or whose
// username looks like a numbered bot (captain1, botplayer7, test3, …).
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local", quiet: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.local or environment).");
  process.exit(1);
}
const apply = process.argv.includes("--apply");
const sql = neon(url);

const TEST_EMAIL = "(@test\\.spicyleague\\.dev|@e2e\\.spicyleague\\.test)$";
const TEST_USERNAME = "^(captain|botplayer|bot|player|test|testuser|e2e)[-_]?[0-9]+$";

// Eastern Standard Time is UTC-5 for all of these dates.
const SEASON = {
  name: "Spicy League Season 12",
  slug: "season-12",
  game: "lol",
  state: "signups_open",
  description:
    "League of Legends, drafted 5v5 teams. The draft is Saturday, November 21 at 8pm ET. " +
    "Group stage December 11–13, semifinals December 19, final December 20. " +
    "Matches start at 7pm ET by default; teams can reschedule a match to any time both sides agree on.",
  signupClosesAt: "2026-11-21T23:00:00Z", // Nov 21, 6pm ET
  draftAt: "2026-11-22T01:00:00Z", // Nov 21, 8pm ET
  seasonStartAt: "2026-12-12T00:00:00Z", // Dec 11, 7pm ET
  groupStageEndsAt: "2026-12-14T00:00:00Z", // Dec 13, 7pm ET
  semisAt: "2026-12-20T00:00:00Z", // Dec 19, 7pm ET
  finalAt: "2026-12-21T00:00:00Z", // Dec 20, 7pm ET
};

const seasonRows = await sql`select slug, name, state from seasons order by created_at`;
const tenManCount = await sql`select count(*)::int as n from ten_mans`;
const userRows = await sql`
  select username, email, role,
    ((email ~* ${TEST_EMAIL} or username ~* ${TEST_USERNAME}) and role <> 'admin') as test
  from users order by created_at`;
const [admin] =
  await sql`select id, username from users where role = 'admin' order by created_at limit 1`;

console.log(`Seasons to delete (${seasonRows.length}):`);
for (const s of seasonRows) console.log(`  ${s.slug}  ${s.name}  [${s.state}]`);
console.log(`10-mans to delete: ${tenManCount[0].n}`);
console.log(`Users (${userRows.length}; * = test account, will be deleted):`);
for (const u of userRows) {
  console.log(`  ${u.test ? "*" : " "} ${u.username ?? "(no username)"}  ${u.email}  ${u.role}`);
}
console.log(
  `New season: ${SEASON.name} (/seasons/${SEASON.slug}), created by ${admin?.username ?? "nobody"}`,
);

if (!apply) {
  console.log("\nDry run — nothing changed. Re-run with --apply.");
  process.exit(0);
}

const [, , deletedUsers, created] = await sql.transaction([
  sql`delete from ten_mans`,
  sql`delete from seasons`,
  sql`delete from users
      where (email ~* ${TEST_EMAIL} or username ~* ${TEST_USERNAME}) and role <> 'admin'
      returning username`,
  sql`insert into seasons (id, name, slug, game, state, description, signup_opens_at,
        signup_closes_at, draft_at, season_start_at, group_stage_ends_at, semis_at, final_at,
        created_by)
      values (${crypto.randomUUID()}, ${SEASON.name}, ${SEASON.slug}, ${SEASON.game},
        ${SEASON.state}, ${SEASON.description}, now() at time zone 'utc', ${SEASON.signupClosesAt},
        ${SEASON.draftAt}, ${SEASON.seasonStartAt}, ${SEASON.groupStageEndsAt},
        ${SEASON.semisAt}, ${SEASON.finalAt}, ${admin?.id ?? null})
      returning slug`,
]);
console.log(
  `\nDone: ${deletedUsers.length} test users removed, created /seasons/${created[0].slug}.`,
);
