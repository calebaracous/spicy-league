"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { teams } from "@/db/schema/drafts";
import { matches, matchSubstitutions } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin, requireOnboarded } from "@/lib/auth-helpers";
import { checkSubEligibility } from "@/lib/substitutions";

/**
 * Substitution actions. Captains request / withdraw; admins approve, reject
 * or revoke. Every request needs admin approval. Rules: substitution-rules.ts.
 * Form actions: errors redirect back with ?error=<code>, successes with
 * ?saved=<code> (the match page and admin matches page map both).
 */

async function load(slug: string, matchId: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/seasons");
  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.seasonId, season.id)),
  });
  if (!match) redirect(`/seasons/${slug}/matches`);
  return { season, match };
}

function revalidateMatch(slug: string, matchId: string) {
  revalidatePath(`/seasons/${slug}/matches/${matchId}`);
  revalidatePath(`/seasons/${slug}/matches`);
  revalidatePath(`/admin/seasons/${slug}/matches`);
  revalidatePath("/admin");
  revalidatePath("/users/[username]", "page");
}

/** Only redirect back to this season's public or admin pages. */
function backTo(raw: FormDataEntryValue | null, slug: string, fallback: string, extra: string) {
  const v = raw?.toString() ?? "";
  const ok = v.startsWith(`/seasons/${slug}/`) || v.startsWith(`/admin/seasons/${slug}/`);
  const base = ok ? v.split("?")[0] : fallback;
  return `${base}?${extra}`;
}

/** The team (home/away) the caller may manage subs for, or null. */
async function managedTeamId(
  userId: string,
  isAdmin: boolean,
  seasonId: string,
  match: { homeTeamId: string; awayTeamId: string },
  requestedTeamId: string | null,
): Promise<string | null> {
  if (isAdmin) {
    return requestedTeamId === match.homeTeamId || requestedTeamId === match.awayTeamId
      ? requestedTeamId
      : null;
  }
  // Captains only — not every roster member.
  const team = await db.query.teams.findFirst({
    where: and(eq(teams.seasonId, seasonId), eq(teams.captainUserId, userId)),
  });
  if (!team) return null;
  return team.id === match.homeTeamId || team.id === match.awayTeamId ? team.id : null;
}

export async function requestSub(slug: string, matchId: string, formData: FormData) {
  const session = await requireOnboarded();
  const { season, match } = await load(slug, matchId);
  const here = `/seasons/${slug}/matches/${matchId}`;
  const isAdmin = session.user.role === "admin";

  const teamId = await managedTeamId(
    session.user.id,
    isAdmin,
    season.id,
    match,
    formData.get("teamId")?.toString() || null,
  );
  if (!teamId) redirect(`${here}?error=not-captain`);

  const subUserId = formData.get("subUserId")?.toString() ?? "";
  if (!subUserId) redirect(`${here}?error=no-candidate`);
  const replacedUserId = formData.get("replacedUserId")?.toString() || null;
  const reason = formData.get("reason")?.toString().trim().slice(0, 200) || null;

  const verdict = await checkSubEligibility({
    match,
    requestingTeamId: teamId,
    candidateId: subUserId,
    replacedUserId,
  });
  if (!verdict.ok) redirect(`${here}?error=${verdict.error}`);

  // A previous rejected/withdrawn request for the same player is reused
  // (unique on match + sub).
  const existing = await db.query.matchSubstitutions.findFirst({
    where: and(
      eq(matchSubstitutions.matchId, matchId),
      eq(matchSubstitutions.subUserId, subUserId),
    ),
  });
  const values = {
    teamId,
    replacedUserId,
    reason,
    status: "pending" as const,
    requestedBy: session.user.id,
    decidedBy: null,
    decidedAt: null,
  };
  if (existing) {
    await db.update(matchSubstitutions).set(values).where(eq(matchSubstitutions.id, existing.id));
  } else {
    await db.insert(matchSubstitutions).values({ ...values, matchId, subUserId });
  }

  revalidateMatch(slug, matchId);
  redirect(`${here}?saved=sub-requested`);
}

export async function withdrawSub(slug: string, matchId: string, subId: string) {
  const session = await requireOnboarded();
  const { season, match } = await load(slug, matchId);
  const here = `/seasons/${slug}/matches/${matchId}`;
  const sub = await db.query.matchSubstitutions.findFirst({
    where: and(eq(matchSubstitutions.id, subId), eq(matchSubstitutions.matchId, matchId)),
  });
  if (!sub) redirect(`${here}?error=sub-not-found`);
  if (sub.status !== "pending") redirect(`${here}?error=not-pending`);

  const isAdmin = session.user.role === "admin";
  const teamId = await managedTeamId(session.user.id, isAdmin, season.id, match, sub.teamId);
  if (teamId !== sub.teamId) redirect(`${here}?error=not-captain`);

  await db
    .update(matchSubstitutions)
    .set({ status: "withdrawn", decidedBy: session.user.id, decidedAt: new Date() })
    .where(eq(matchSubstitutions.id, subId));

  revalidateMatch(slug, matchId);
  redirect(`${here}?saved=sub-withdrawn`);
}

/** Admin: approve / reject a pending request, or revoke an approved one. */
export async function decideSub(slug: string, matchId: string, subId: string, formData: FormData) {
  const session = await requireAdmin();
  const { match } = await load(slug, matchId);
  const fallback = `/seasons/${slug}/matches/${matchId}`;
  const back = formData.get("back");
  const decision = formData.get("decision")?.toString();

  const sub = await db.query.matchSubstitutions.findFirst({
    where: and(eq(matchSubstitutions.id, subId), eq(matchSubstitutions.matchId, matchId)),
  });
  if (!sub) redirect(backTo(back, slug, fallback, "error=sub-not-found"));

  if (decision === "approve" || decision === "reject") {
    if (sub.status !== "pending") redirect(backTo(back, slug, fallback, "error=not-pending"));
    if (decision === "approve") {
      // Re-check: rosters, bans or other subs may have changed since the request.
      const verdict = await checkSubEligibility({
        match,
        requestingTeamId: sub.teamId,
        candidateId: sub.subUserId,
        replacedUserId: sub.replacedUserId,
        excludeSubId: sub.id,
      });
      if (!verdict.ok) redirect(backTo(back, slug, fallback, `error=${verdict.error}`));
    }
    await db
      .update(matchSubstitutions)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        decidedBy: session.user.id,
        decidedAt: new Date(),
      })
      .where(eq(matchSubstitutions.id, subId));
    revalidateMatch(slug, matchId);
    redirect(backTo(back, slug, fallback, `saved=sub-${decision}d`));
  }

  if (decision === "revoke") {
    if (sub.status !== "approved") redirect(backTo(back, slug, fallback, "error=not-pending"));
    if (match.state !== "scheduled") redirect(backTo(back, slug, fallback, "error=locked"));
    await db
      .update(matchSubstitutions)
      .set({ status: "withdrawn", decidedBy: session.user.id, decidedAt: new Date() })
      .where(eq(matchSubstitutions.id, subId));
    revalidateMatch(slug, matchId);
    redirect(backTo(back, slug, fallback, "saved=sub-revoked"));
  }

  redirect(backTo(back, slug, fallback, "error=sub-not-found"));
}
