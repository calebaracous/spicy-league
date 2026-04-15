"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups } from "@/db/schema/seasons";
import { requireOnboarded } from "@/lib/auth-helpers";

const LOL_ROLES = ["top", "jungle", "mid", "adc", "support", "fill"] as const;
const CS2_MAPS = ["dust2", "mirage", "inferno", "nuke", "overpass", "anubis", "ancient"] as const;

const lolPrefsSchema = z.object({
  primaryRole: z.enum(LOL_ROLES),
  secondaryRole: z.enum(LOL_ROLES),
});

const cs2PrefsSchema = z.object({
  mapPrefs: z.array(z.enum(CS2_MAPS)).min(1),
});

export async function submitSignup(slug: string, formData: FormData) {
  const session = await requireOnboarded();

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), eq(seasons.state, "signups_open")),
  });

  if (!season) {
    redirect(`/seasons/${slug}?error=signups-closed`);
  }

  const now = new Date();
  if (season.signupOpensAt && now < season.signupOpensAt) {
    redirect(`/seasons/${slug}?error=signups-not-open`);
  }
  if (season.signupClosesAt && now > season.signupClosesAt) {
    redirect(`/seasons/${slug}?error=signups-closed`);
  }

  const existing = await db.query.seasonSignups.findFirst({
    where: and(
      eq(seasonSignups.seasonId, season.id),
      eq(seasonSignups.userId, session.user.id),
    ),
  });
  if (existing) {
    redirect(`/seasons/${slug}?error=already-signed-up`);
  }

  let rolePrefs: unknown;

  if (season.game === "lol") {
    const parsed = lolPrefsSchema.safeParse({
      primaryRole: formData.get("primaryRole"),
      secondaryRole: formData.get("secondaryRole"),
    });
    if (!parsed.success) {
      redirect(`/seasons/${slug}/signup?error=invalid`);
    }
    rolePrefs = parsed.data;
  } else {
    const mapPrefs = formData.getAll("mapPrefs");
    const parsed = cs2PrefsSchema.safeParse({ mapPrefs });
    if (!parsed.success) {
      redirect(`/seasons/${slug}/signup?error=invalid`);
    }
    rolePrefs = parsed.data;
  }

  const notes = (formData.get("notes") as string | null)?.trim() || null;

  await db.insert(seasonSignups).values({
    seasonId: season.id,
    userId: session.user.id,
    rolePrefs,
    notes,
  });

  revalidatePath(`/seasons/${slug}`);
  redirect(`/seasons/${slug}?signed-up=1`);
}
