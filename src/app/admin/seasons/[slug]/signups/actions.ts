"use server";

import { and, count, eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { drafts } from "@/db/schema/drafts";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups, seasonCaptains } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { updateSignupRolesForUser } from "@/lib/discord-ping-roles";
import { syncInBackground } from "@/lib/discord-roles";
import { logEvent } from "@/lib/events";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Compact captain orders to 1..N, keeping duo captains (rows that share a
 * captainOrder) together on one number.
 */
async function renumberCaptains(tx: Tx | typeof db, seasonId: string) {
  const rows = await tx.query.seasonCaptains.findMany({
    where: eq(seasonCaptains.seasonId, seasonId),
    orderBy: (t, { asc }) => [asc(t.captainOrder), asc(t.createdAt)],
  });
  const next = new Map([...new Set(rows.map((r) => r.captainOrder))].map((o, i) => [o, i + 1]));
  for (const r of rows) {
    const order = next.get(r.captainOrder)!;
    if (order !== r.captainOrder) {
      await tx
        .update(seasonCaptains)
        .set({ captainOrder: order })
        .where(eq(seasonCaptains.id, r.id));
    }
  }
}

/**
 * Captains (and duo pairings) are fixed once the draft has started: the
 * snake order and each team's pick count are derived from them, so a change
 * mid-draft would hand picks to the wrong team.
 */
async function loadEditableSeason(slug: string) {
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");
  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  if (draft && draft.state !== "pending") {
    redirect(`/admin/seasons/${slug}/signups?error=captains-locked`);
  }
  return season;
}

function revalidateCaptains(slug: string) {
  revalidatePath(`/admin/seasons/${slug}/signups`);
  revalidatePath(`/admin/seasons/${slug}/draft`);
  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/seasons/${slug}/captains`);
}

export async function promoteCaptain(slug: string, signupId: string) {
  const session = await requireAdmin();
  const season = await loadEditableSeason(slug);

  const signup = await db.query.seasonSignups.findFirst({
    where: and(eq(seasonSignups.id, signupId), eq(seasonSignups.seasonId, season.id)),
  });
  if (!signup) redirect(`/admin/seasons/${slug}/signups?error=not-found`);
  if (signup.kind === "sub") redirect(`/admin/seasons/${slug}/signups?error=sub-captain`);

  const existing = await db.query.seasonCaptains.findFirst({
    where: and(eq(seasonCaptains.seasonId, season.id), eq(seasonCaptains.userId, signup.userId)),
  });
  if (existing) redirect(`/admin/seasons/${slug}/signups?error=already-captain`);

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(seasonCaptains.captainOrder) })
    .from(seasonCaptains)
    .where(eq(seasonCaptains.seasonId, season.id));

  await db.insert(seasonCaptains).values({
    seasonId: season.id,
    userId: signup.userId,
    captainOrder: (maxOrder ?? 0) + 1,
  });
  await logEvent("captain.promoted", {
    actorId: session.user.id,
    subjectUserId: signup.userId,
    seasonId: season.id,
  });

  revalidateCaptains(slug);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

/** States where a player can still be pulled from a season. */
const REMOVABLE_STATES = ["signups_open", "signups_closed", "captains_selected"] as const;

/**
 * Admin: remove a player from a season before the draft starts. Also drops
 * their captain spot (re-numbering the rest). Once a draft is running or
 * teams exist, removal would break rosters and the schedule, so it's refused.
 */
export async function removeSignup(slug: string, signupId: string) {
  const session = await requireAdmin();

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");

  const signup = await db.query.seasonSignups.findFirst({
    where: and(eq(seasonSignups.id, signupId), eq(seasonSignups.seasonId, season.id)),
  });
  if (!signup) redirect(`/admin/seasons/${slug}/signups?error=not-found`);

  // Sub signups were never in the draft pool, so they can go at any time.
  // (An approved-but-unplayed sub slot fails its re-check on approval and
  // shows "not signed up" if it's ever re-requested.)
  if (signup.kind === "player") {
    if (!(REMOVABLE_STATES as readonly string[]).includes(season.state)) {
      redirect(`/admin/seasons/${slug}/signups?error=remove-too-late`);
    }
    const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
    if (draft && draft.state !== "pending") {
      redirect(`/admin/seasons/${slug}/signups?error=remove-too-late`);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(seasonCaptains)
      .where(and(eq(seasonCaptains.seasonId, season.id), eq(seasonCaptains.userId, signup.userId)));
    await tx.delete(seasonSignups).where(eq(seasonSignups.id, signup.id));
    await renumberCaptains(tx, season.id);
  });
  await logEvent("signup.removed", {
    actorId: session.user.id,
    subjectUserId: signup.userId,
    seasonId: season.id,
    data: { kind: signup.kind },
  });
  syncInBackground(`${slug} signup roles`, () =>
    updateSignupRolesForUser(season.id, signup.userId),
  );

  revalidatePath(`/admin/seasons/${slug}/signups`);
  revalidatePath(`/seasons/${slug}`);
  revalidatePath(`/seasons/${slug}/captains`);
  revalidatePath("/admin");
  redirect(`/admin/seasons/${slug}/signups?saved=removed`);
}

/** Drop a captain. Their duo partner (if any) stays on as a solo captain. */
export async function demoteCaptain(slug: string, captainId: string) {
  const session = await requireAdmin();
  const season = await loadEditableSeason(slug);

  const removed = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(seasonCaptains)
      .where(and(eq(seasonCaptains.id, captainId), eq(seasonCaptains.seasonId, season.id)))
      .returning({ userId: seasonCaptains.userId });
    await renumberCaptains(tx, season.id);
    return row;
  });
  if (removed) {
    await logEvent("captain.demoted", {
      actorId: session.user.id,
      subjectUserId: removed.userId,
      seasonId: season.id,
    });
  }

  revalidateCaptains(slug);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

/** Move a whole team (one captain or a duo) one place up or down the order. */
export async function moveCaptain(slug: string, captainOrder: number, direction: "up" | "down") {
  const session = await requireAdmin();
  const season = await loadEditableSeason(slug);

  const ordered = await db.query.seasonCaptains.findMany({
    where: eq(seasonCaptains.seasonId, season.id),
    orderBy: (t, { asc }) => [asc(t.captainOrder)],
  });
  const orders = [...new Set(ordered.map((c) => c.captainOrder))];
  const idx = orders.indexOf(captainOrder);
  if (idx === -1) redirect(`/admin/seasons/${slug}/signups?error=not-found`);

  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= orders.length) {
    redirect(`/admin/seasons/${slug}/signups?saved=1`);
  }
  const a = orders[idx];
  const b = orders[swapWith];

  // Swap through a -1 placeholder in case a unique constraint is ever added.
  const at = (order: number) =>
    and(eq(seasonCaptains.seasonId, season.id), eq(seasonCaptains.captainOrder, order));
  await db.transaction(async (tx) => {
    await tx.update(seasonCaptains).set({ captainOrder: -1 }).where(at(a));
    await tx.update(seasonCaptains).set({ captainOrder: a }).where(at(b));
    await tx.update(seasonCaptains).set({ captainOrder: b }).where(at(-1));
  });
  await logEvent("captain.moved", {
    actorId: session.user.id,
    subjectUserId: ordered.find((c) => c.captainOrder === a)?.userId,
    seasonId: season.id,
    data: { order: a, direction },
  });

  revalidateCaptains(slug);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

/**
 * Make two solo captains duo captains of one team: the partner joins
 * captainId's spot in the order. The first-promoted of the two is the
 * team's primary captain; either can draft.
 */
export async function pairCaptain(slug: string, captainId: string, formData: FormData) {
  const session = await requireAdmin();
  const season = await loadEditableSeason(slug);
  const partnerId = formData.get("partnerId");

  const captains = await db.query.seasonCaptains.findMany({
    where: eq(seasonCaptains.seasonId, season.id),
  });
  const captain = captains.find((c) => c.id === captainId);
  const partner = captains.find((c) => c.id === partnerId);
  if (!captain || !partner || captain.id === partner.id) {
    redirect(`/admin/seasons/${slug}/signups?error=not-found`);
  }
  const teamSize = (order: number) => captains.filter((c) => c.captainOrder === order).length;
  if (teamSize(captain.captainOrder) > 1 || teamSize(partner.captainOrder) > 1) {
    redirect(`/admin/seasons/${slug}/signups?error=already-paired`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(seasonCaptains)
      .set({ captainOrder: captain.captainOrder })
      .where(eq(seasonCaptains.id, partner.id));
    await renumberCaptains(tx, season.id);
  });
  const partnerUser = await db.query.users.findFirst({
    where: eq(users.id, partner.userId),
    columns: { name: true, username: true },
  });
  await logEvent("captain.paired", {
    actorId: session.user.id,
    subjectUserId: captain.userId,
    seasonId: season.id,
    data: { partner: partnerUser?.name ?? partnerUser?.username ?? null },
  });

  revalidateCaptains(slug);
  redirect(`/admin/seasons/${slug}/signups?saved=paired`);
}

/** Split a duo: this captain becomes their own team at the end of the order. */
export async function splitCaptain(slug: string, captainId: string) {
  const session = await requireAdmin();
  const season = await loadEditableSeason(slug);

  const [{ maxOrder }] = await db
    .select({ maxOrder: max(seasonCaptains.captainOrder) })
    .from(seasonCaptains)
    .where(eq(seasonCaptains.seasonId, season.id));

  const split = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(seasonCaptains)
      .set({ captainOrder: (maxOrder ?? 0) + 1 })
      .where(and(eq(seasonCaptains.id, captainId), eq(seasonCaptains.seasonId, season.id)))
      .returning({ userId: seasonCaptains.userId });
    await renumberCaptains(tx, season.id);
    return row;
  });
  if (split) {
    await logEvent("captain.split", {
      actorId: session.user.id,
      subjectUserId: split.userId,
      seasonId: season.id,
    });
  }

  revalidateCaptains(slug);
  redirect(`/admin/seasons/${slug}/signups?saved=1`);
}

export async function getSignupStats(seasonId: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(seasonSignups)
    .where(and(eq(seasonSignups.seasonId, seasonId), eq(seasonSignups.kind, "player")));
  // Teams of 5, so this is a team count: a duo counts once.
  return { total, recommendedCaptains: Math.floor(total / 5) };
}
