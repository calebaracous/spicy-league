import { defineConfig, devices } from "@playwright/test";

// See docs/TESTING.md. One playthrough of the rps-test season against the
// deployed staging site (not a local server); it resets that season first.
export default defineConfig({
  testDir: ".",
  workers: 1,
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "../../test-results/staging",
  use: {
    baseURL:
      process.env.STAGING_URL ??
      "https://spicy-league-git-staging-calebaracous-projects.vercel.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
