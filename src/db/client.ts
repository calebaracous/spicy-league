import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import { env } from "@/lib/env";
import * as schema from "@/db/schema";

let _db: NeonHttpDatabase<typeof schema> | undefined;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (_db) return _db;
  const url = env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Provision Neon and add the connection string to .env.",
    );
  }
  _db = drizzle(neon(url), { schema, casing: "snake_case" });
  return _db;
}

export { schema };
