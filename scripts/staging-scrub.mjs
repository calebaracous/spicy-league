// Make the staging database safe to test against. Staging is a Neon branch of
// production (see docs/STAGING.md), so it starts with real players' emails and
// live sessions. This:
//
//   - rewrites every real email to delivered+<username>@resend.dev (Resend's
//     test inbox: sends "succeed" without reaching anyone or hurting the
//     sender reputation). Test accounts (*.test, @test.spicyleague.dev) keep
//     theirs. Passwords are untouched, so sign in with your username.
//   - deletes all sessions and verification tokens
//   - clears OAuth tokens on non-credential accounts
//
// Reads DATABASE_URL from .env.development.local. Refuses to run against the
// production endpoint. Run after every `npm run staging:reset`.
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

// Neon compute endpoint of the production branch (`main`). Not a secret.
const PRODUCTION_ENDPOINT = "ep-bold-boat-am18lac9";

config({ path: ".env.development.local", quiet: true });
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (.env.development.local).");
  process.exit(1);
}
if (new URL(url).hostname.startsWith(PRODUCTION_ENDPOINT)) {
  console.error("DATABASE_URL is the production database. Refusing to scrub.");
  process.exit(1);
}
const sql = neon(url);

const [emails, sessions, verifications, tokens] = await sql.transaction([
  sql`update users
      set email = 'delivered+' || coalesce(username, id) || '@resend.dev'
      where email not like '%.test'
        and email not like '%@test.spicyleague.dev'
        and email not like '%@resend.dev'
      returning id`,
  sql`delete from sessions returning id`,
  sql`delete from verifications returning id`,
  sql`update accounts
      set access_token = null, refresh_token = null, id_token = null
      where provider_id <> 'credential' and
        (access_token is not null or refresh_token is not null or id_token is not null)
      returning id`,
]);
console.log(
  `staging scrubbed: ${emails.length} emails rewritten, ${sessions.length} sessions, ` +
    `${verifications.length} verification tokens deleted, ${tokens.length} OAuth tokens cleared`,
);
