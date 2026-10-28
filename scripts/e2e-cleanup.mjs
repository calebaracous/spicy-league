// Remove end-to-end test data from DATABASE_URL (.env.development.local, or E2E_DATABASE_URL).
//
//   npm run test:e2e:cleanup             e2e-* seasons + @e2e.spicyleague.test users
//   npm run test:e2e:cleanup -- --legacy also the old scripts/seed-test-season.ts data
//                                        (test-s1 + @test.spicyleague.dev users)
//
// Only rows carrying those markers are touched. Runs in one transaction and
// prints what it removed.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.development.local", quiet: true });
const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.development.local or E2E_DATABASE_URL).");
  process.exit(1);
}
const legacy = process.argv.includes("--legacy");
const sql = neon(url);

const statements = [
  sql`delete from seasons where slug like 'e2e-%' returning slug`,
  sql`delete from users where email like '%@e2e.spicyleague.test' returning username`,
];
if (legacy) {
  statements.push(
    sql`delete from seasons where slug = 'test-s1' returning slug`,
    sql`delete from users where email like '%@test.spicyleague.dev' returning username`,
  );
}

const [e2eSeasons, e2eUsers, legacySeasons = [], legacyUsers = []] =
  await sql.transaction(statements);
console.log(`e2e: ${e2eSeasons.length} seasons, ${e2eUsers.length} users removed`);
if (legacy) {
  console.log(`legacy seed: ${legacySeasons.length} seasons, ${legacyUsers.length} users removed`);
}
