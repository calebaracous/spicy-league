import { config } from "dotenv";

// Same DATABASE_URL `next dev` uses: the staging branch. E2E_DATABASE_URL
// overrides it.
config({ path: ".env.development.local", quiet: true });

export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
export const PORT = Number(process.env.E2E_PORT ?? 3100);
export const BASE_URL = `http://localhost:${PORT}`;

/** Every row the suite creates is tagged with one of these, so cleanup is exact. */
export const E2E_EMAIL_DOMAIN = "e2e.spicyleague.test";
export const E2E_SLUG_PREFIX = "e2e-";
