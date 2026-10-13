import { cleanupE2EData } from "./support/db";

/** Removes everything the run created. Set E2E_KEEP=1 to leave it in place
 *  for inspection (the next run, or `npm run test:e2e:cleanup`, removes it). */
export default async function globalTeardown() {
  if (process.env.E2E_KEEP === "1") {
    console.log("[e2e] E2E_KEEP=1 — leaving test data in place");
    return;
  }
  const removed = await cleanupE2EData();
  console.log(`[e2e] cleanup: ${removed.seasons} seasons, ${removed.users} users removed`);
}
