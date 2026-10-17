import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { accountLinks } from "@/db/schema/stats";

/** LoL season signups require at least one linked Riot account. */
export async function hasRiotLink(userId: string): Promise<boolean> {
  const link = await db.query.accountLinks.findFirst({
    where: and(eq(accountLinks.userId, userId), eq(accountLinks.provider, "riot")),
    columns: { id: true },
  });
  return !!link;
}
