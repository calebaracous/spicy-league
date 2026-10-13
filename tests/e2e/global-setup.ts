import { randomBytes } from "node:crypto";

import { cleanupE2EData } from "./support/db";
import { seedUsers } from "./support/seed";

/** Runs once before all specs. Values put on process.env here are inherited
 *  by the test workers. The password is random per run and never written to
 *  disk or logged. */
export default async function globalSetup() {
  process.env.E2E_RUN_ID = Date.now().toString(36);
  process.env.E2E_PASSWORD = randomBytes(18).toString("base64url");

  const leftover = await cleanupE2EData();
  if (leftover.seasons || leftover.users) {
    console.log(
      `[e2e] removed leftovers from a previous run: ${leftover.seasons} seasons, ${leftover.users} users`,
    );
  }
  await seedUsers();
  console.log(`[e2e] run ${process.env.E2E_RUN_ID}: seeded admin + players`);
}
