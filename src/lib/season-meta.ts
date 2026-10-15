import "server-only";

import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";

/** Season name for `<title>`s under /seasons/[slug]; null if no such season. */
export const getSeasonName = cache(async (slug: string): Promise<string | null> => {
  const row = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
    columns: { name: true },
  });
  return row?.name ?? null;
});

/** generateMetadata for a season sub-page: "<Page> · <Season name>". */
export function seasonPageMetadata(page: string | null) {
  return async ({ params }: { params: Promise<{ slug: string }> }) => {
    const { slug } = await params;
    const name = await getSeasonName(slug);
    // Unknown slug: the page calls notFound(); keep not-found.tsx's title.
    if (!name) return {};
    return { title: page ? `${page} · ${name}` : name };
  };
}
