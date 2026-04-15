import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/db/schema";

// Fallback keeps module load side-effect free when DATABASE_URL is missing
// (build-time page collection, CI, first-time setup). Queries against this
// placeholder fail with a clear connection error at request time.
const DB_URL_FALLBACK = "postgres://placeholder:placeholder@localhost:5432/placeholder";

export const db = drizzle(neon(process.env.DATABASE_URL ?? DB_URL_FALLBACK), {
  schema,
  casing: "snake_case",
});

export { schema };
