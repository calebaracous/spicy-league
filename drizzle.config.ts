import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Local dev keeps DATABASE_URL in .env.local. Already-set env vars (CI,
// Vercel, an explicit `DATABASE_URL=… npm run db:migrate`) win.
config({ path: ".env.local", quiet: true });

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
