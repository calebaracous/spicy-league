import { defineConfig, devices } from "@playwright/test";

import { BASE_URL, DATABASE_URL, PORT } from "./tests/e2e/support/env";

// See docs/TESTING.md. The suite writes e2e-tagged rows to DATABASE_URL and
// removes them in global teardown.
export default defineConfig({
  testDir: "./tests/e2e",
  // One shared database and one admin: run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 5 * 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // Production build so timings match the deployed app. E2E_SKIP_BUILD=1
    // reuses the last `.next` build.
    command: `${process.env.E2E_SKIP_BUILD === "1" ? "" : "npm run build && "}npx next start -p ${PORT}`,
    url: BASE_URL,
    timeout: 5 * 60_000,
    reuseExistingServer: false,
    env: {
      ...(process.env as Record<string, string>),
      DATABASE_URL,
      // `next start` loads .env.production.local, which points Better Auth at
      // production; the test server must trust and issue cookies for
      // localhost instead. It also holds the real Discord bot: blank it so
      // e2e seasons never touch the server (empty reads as unset, see env.ts).
      BETTER_AUTH_URL: BASE_URL,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      DISCORD_BOT_TOKEN: "",
      DISCORD_GUILD_ID: "",
    },
  },
});
