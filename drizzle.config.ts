import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Defaults to the staging database (.env.development.local). Already-set env
// vars win, which is how the `:prod` scripts target production
// (`node --env-file=.env.production.local …`). See docs/STAGING.md.
config({ path: ".env.development.local", quiet: true });

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
