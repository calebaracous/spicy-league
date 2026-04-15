import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db/client";
import { seasons, seasonSignups } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { requireAdmin } from "@/lib/auth-helpers";

type Params = Promise<{ slug: string }>;

function escapeCell(value: string | null | undefined): string {
  const str = value ?? "";
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(_req: Request, { params }: { params: Params }) {
  await requireAdmin();

  const { slug } = await params;

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) {
    return new NextResponse("Season not found", { status: 404 });
  }

  const signups = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      rolePrefs: seasonSignups.rolePrefs,
      notes: seasonSignups.notes,
      createdAt: seasonSignups.createdAt,
    })
    .from(seasonSignups)
    .innerJoin(users, eq(seasonSignups.userId, users.id))
    .where(eq(seasonSignups.seasonId, season.id))
    .orderBy(asc(seasonSignups.createdAt));

  const isLol = season.game === "lol";
  const headers = isLol
    ? ["Display Name", "Email", "Primary Role", "Secondary Role", "Notes", "Signed Up"]
    : ["Display Name", "Email", "Map Preferences", "Notes", "Signed Up"];

  const rows = signups.map((s) => {
    const prefs = s.rolePrefs as Record<string, unknown> | null;
    if (isLol) {
      return [
        escapeCell(s.displayName),
        escapeCell(s.email),
        escapeCell((prefs?.primaryRole as string) ?? ""),
        escapeCell((prefs?.secondaryRole as string) ?? ""),
        escapeCell(s.notes),
        escapeCell(s.createdAt.toISOString()),
      ].join(",");
    }
    return [
      escapeCell(s.displayName),
      escapeCell(s.email),
      escapeCell(((prefs?.mapPrefs as string[]) ?? []).join("; ")),
      escapeCell(s.notes),
      escapeCell(s.createdAt.toISOString()),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${slug}-signups.csv"`,
    },
  });
}
