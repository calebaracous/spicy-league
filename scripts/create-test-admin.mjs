// Create (or reset) the `claudius` admin test account in DATABASE_URL, for
// agents and manual checks of signed-in pages:
//
//   node scripts/create-test-admin.mjs
//
// Credentials live only in .env.local (gitignored): TEST_ADMIN_EMAIL and
// TEST_ADMIN_PASSWORD. A missing password is generated and appended there;
// it is never printed. Re-running resets the password hash, role and
// verified flag to match. The email is on the non-routable .test TLD and
// outside the e2e domain, so `npm run test:e2e:cleanup` leaves it alone.
import { appendFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "@better-auth/utils/password";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

const ENV_FILE = ".env.local";
config({ path: ENV_FILE, quiet: true });

const USERNAME = "claudius";
const NAME = "Claudius (test admin)";
// Not a real Discord account, so the Discord-server signup gate blocks it.
const DISCORD_USERNAME = "spicy_claudius_test";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`DATABASE_URL is not set (${ENV_FILE}).`);
  process.exit(1);
}

const added = [];
let email = process.env.TEST_ADMIN_EMAIL;
if (!email) {
  email = "claudius@spicyleague.test";
  added.push(`TEST_ADMIN_EMAIL=${email}`);
}
let password = process.env.TEST_ADMIN_PASSWORD;
if (!password) {
  password = randomBytes(18).toString("base64url");
  added.push(`TEST_ADMIN_PASSWORD=${password}`);
}
if (added.length)
  appendFileSync(ENV_FILE, `\n# Test admin (scripts/create-test-admin.mjs)\n${added.join("\n")}\n`);

const sql = neon(url);
const hash = await hashPassword(password);

const [existing] = await sql`select id from users where username = ${USERNAME}`;
if (existing) {
  await sql.transaction([
    sql`update users set email = ${email}, email_verified = true, role = 'admin', updated_at = now()
        where id = ${existing.id}`,
    sql`update accounts set password = ${hash}, updated_at = now()
        where user_id = ${existing.id} and provider_id = 'credential'`,
  ]);
  console.log(`Reset ${USERNAME} (${existing.id}).`);
} else {
  const id = randomUUID();
  await sql.transaction([
    sql`insert into users (id, email, email_verified, username, name, discord_username, role)
        values (${id}, ${email}, true, ${USERNAME}, ${NAME}, ${DISCORD_USERNAME}, 'admin')`,
    sql`insert into accounts (id, account_id, provider_id, user_id, password)
        values (${randomUUID()}, ${id}, 'credential', ${id}, ${hash})`,
  ]);
  console.log(`Created ${USERNAME} (${id}).`);
}
if (added.length)
  console.log(`Saved ${added.map((l) => l.split("=")[0]).join(", ")} to ${ENV_FILE}.`);
