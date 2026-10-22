"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { matches, matchSubstitutions } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups } from "@/db/schema/seasons";
import { requireOnboarded } from "@/lib/auth-helpers";
import { getActiveBan } from "@/lib/bans";
import { updateSignupRolesForUser } from "@/lib/discord-ping-roles";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent } from "@/lib/events";
import { missingSignupRequirements } from "@/lib/signup-gate";
import { openSignupKind, resolveSignupKind } from "@/lib/seasons";

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
  if (await getActiveBan(session.user.id)) redirect(`/seasons/${slug}?error=banned`);

  const season = await db.query.seasons.findFirst({
    where: and(eq(seasons.slug, slug), ne(seasons.state, "draft")),
  });
  if (!season) redirect(`/seasons/${slug}?error=signups-closed`);

  // Regular signups during the window (or sub-only, if chosen); sub signups
  // after it until the season completes (see openSignupKind).
  const open = openSignupKind(season);
  if (!open) {
    const notYet = season.signupOpensAt && new Date() < season.signupOpensAt;
    redirect(`/seasons/${slug}?error=${notYet ? "signups-not-open" : "signups-closed"}`);
  }
  const kind = resolveSignupKind(open, formData.get("kind"));

  const existing = await db.query.seasonSignups.findFirst({
    where: and(eq(seasonSignups.seasonId, season.id), eq(seasonSignups.userId, session.user.id)),
  });
  if (existing) {
    redirect(`/seasons/${slug}?error=already-signed-up`);
  }

  // Every signup needs a Discord username; LoL ones also a linked Riot account
  // (captains scout via rank/OP.GG). Only gates new signups; existing ones are
  // never revisited. The signup page explains what's missing.
  const missing = await missingSignupRequirements(session.user.id, season.game);
  if (missing.discord || missing.riot) redirect(`/seasons/${slug}/signup`);

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
  const quandary = (formData.get("quandary") as string | null)?.trim() ?? "";
  if (!quandary) redirect(`/seasons/${slug}/signup?error=quandary`);

  await db.insert(seasonSignups).values({
    seasonId: season.id,
    userId: session.user.id,
    rolePrefs,
    notes,
    quandary,
    kind,
  });
  await logEvent("signup.created", {
    actorId: session.user.id,
    seasonId: season.id,
    data: { kind },
  });

  syncInBackground(`${slug} signup roles`, () =>
    updateSignupRolesForUser(season.id, session.user.id),
  );

  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/seasons/${slug}/teams`);
  revalidatePath(`/admin/seasons/${slug}/signups`);
  redirect(`/seasons/${slug}?signed-up=${kind === "sub" ? "sub" : "1"}`);
}

/**
 * A sub signup takes themself off the sub list. Pending sub requests for
 * them are withdrawn; refused while they hold an approved slot in a match
 * that hasn't been reported yet (a captain or admin must release it first).
 */
export async function leaveSubList(slug: string) {
  const session = await requireOnboarded();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/seasons");

  const signup = await db.query.seasonSignups.findFirst({
    where: and(
      eq(seasonSignups.seasonId, season.id),
      eq(seasonSignups.userId, session.user.id),
      eq(seasonSignups.kind, "sub"),
    ),
  });
  if (!signup) redirect(`/seasons/${slug}`);

  const booked = await db
    .select({ id: matchSubstitutions.id })
    .from(matchSubstitutions)
    .innerJoin(matches, eq(matchSubstitutions.matchId, matches.id))
    .where(
      and(
        eq(matches.seasonId, season.id),
        eq(matches.state, "scheduled"),
        eq(matchSubstitutions.subUserId, session.user.id),
        eq(matchSubstitutions.status, "approved"),
      ),
    )
    .limit(1);
  if (booked.length) redirect(`/seasons/${slug}?error=sub-booked`);

  await db.transaction(async (tx) => {
    await tx
      .update(matchSubstitutions)
      .set({ status: "withdrawn", decidedBy: session.user.id, decidedAt: new Date() })
      .where(
        and(
          eq(matchSubstitutions.subUserId, session.user.id),
          eq(matchSubstitutions.status, "pending"),
          inArray(
            matchSubstitutions.matchId,
            tx.select({ id: matches.id }).from(matches).where(eq(matches.seasonId, season.id)),
          ),
        ),
      );
    await tx.delete(seasonSignups).where(eq(seasonSignups.id, signup.id));
  });
  await logEvent("signup.left_subs", { actorId: session.user.id, seasonId: season.id });
  syncInBackground(`${slug} signup roles`, () =>
    updateSignupRolesForUser(season.id, session.user.id),
  );

  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/seasons/${slug}/teams`);
  revalidatePath(`/admin/seasons/${slug}/signups`);
  redirect(`/seasons/${slug}?left-subs=1`);
}
