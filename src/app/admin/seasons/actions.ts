"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { seasons, type SeasonState } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { canTransition, isValidSlug, SEASON_STATES } from "@/lib/seasons";

const gameSchema = z.enum(["lol", "cs2"]);

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? new Date(v) : null));

const seasonInputSchema = z.object({
  name: z.string().trim().min(3).max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(isValidSlug, "Slug must be 3–48 chars, lowercase alphanumeric with hyphens"),
  game: gameSchema,
  description: z
    .string()
    .max(5000)
    .optional()
    .transform((v) => v?.trim() || null),
  rules: z
    .string()
    .max(10000)
    .optional()
    .transform((v) => v?.trim() || null),
  signupOpensAt: optionalDate,
  signupClosesAt: optionalDate,
  seasonStartAt: optionalDate,
});

function parseSeasonInput(formData: FormData) {
  return seasonInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    game: formData.get("game"),
    description: formData.get("description"),
    rules: formData.get("rules"),
    signupOpensAt: formData.get("signupOpensAt"),
    signupClosesAt: formData.get("signupClosesAt"),
    seasonStartAt: formData.get("seasonStartAt"),
  });
}

export async function createSeason(formData: FormData) {
  const session = await requireAdmin();
  const parsed = parseSeasonInput(formData);
  if (!parsed.success) {
    redirect("/admin/seasons/new?error=invalid");
  }

  const existing = await db.query.seasons.findFirst({
    where: eq(seasons.slug, parsed.data.slug),
  });
  if (existing) {
    redirect("/admin/seasons/new?error=slug-taken");
  }

  await db.insert(seasons).values({
    ...parsed.data,
    createdBy: session.user.id,
  });

  revalidatePath("/admin");
  revalidatePath("/seasons");
  redirect(`/admin/seasons/${parsed.data.slug}`);
}

export async function updateSeason(slug: string, formData: FormData) {
  await requireAdmin();
  const parsed = parseSeasonInput(formData);
  if (!parsed.success) {
    redirect(`/admin/seasons/${slug}?error=invalid`);
  }

  const existing = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!existing) redirect("/admin?error=not-found");

  if (parsed.data.slug !== slug) {
    const conflict = await db.query.seasons.findFirst({
      where: and(eq(seasons.slug, parsed.data.slug), ne(seasons.id, existing.id)),
    });
    if (conflict) {
      redirect(`/admin/seasons/${slug}?error=slug-taken`);
    }
  }

  await db
    .update(seasons)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(seasons.id, existing.id));

  revalidatePath("/admin");
  revalidatePath("/seasons");
  revalidatePath(`/seasons/${parsed.data.slug}`);
  redirect(`/admin/seasons/${parsed.data.slug}?saved=1`);
}

export async function transitionSeasonState(slug: string, formData: FormData) {
  await requireAdmin();
  const to = formData.get("to");
  if (typeof to !== "string" || !SEASON_STATES.includes(to as SeasonState)) {
    redirect(`/admin/seasons/${slug}?error=invalid-state`);
  }

  const existing = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!existing) redirect("/admin?error=not-found");

  const nextState = to as SeasonState;
  if (!canTransition(existing.state, nextState)) {
    redirect(`/admin/seasons/${slug}?error=bad-transition`);
  }

  await db
    .update(seasons)
    .set({ state: nextState, updatedAt: new Date() })
    .where(eq(seasons.id, existing.id));

  revalidatePath("/admin");
  revalidatePath("/seasons");
  revalidatePath(`/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}?saved=1`);
}
