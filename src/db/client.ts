import "server-only";

import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "@/db/schema";

// Node.js 22 ships a native WebSocket; the Pool driver needs it for
// interactive transactions (SELECT … FOR UPDATE, db.transaction()).
neonConfig.webSocketConstructor = globalThis.WebSocket;

// Fallback keeps module load side-effect free when DATABASE_URL is missing
// (build-time page collection, CI, first-time setup). Queries against this
// placeholder fail with a clear connection error at request time.
const DB_URL_FALLBACK = "postgres://placeholder:placeholder@localhost:5432/placeholder";

const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? DB_URL_FALLBACK });

export const db = drizzle(pool, {
  schema,
  casing: "snake_case",
});

export { schema };
