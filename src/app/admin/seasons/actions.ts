"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { seasons, type SeasonState } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { discordConfig } from "@/lib/discord-api";
import { syncSignupRoles } from "@/lib/discord-ping-roles";
import { syncCaptainRole, syncInBackground } from "@/lib/discord-roles";
import { syncSeasonDiscord } from "@/lib/discord-sync";
import { deleteOldTeamChannels, emailUnmatchedPlayers, syncNicknames } from "@/lib/discord-admin";
import { canTransition, isValidSlug, SEASON_STATES } from "@/lib/seasons";
import { parsePrizeSplit } from "@/lib/prize-pool";
import { diffFields, type EventType } from "@/lib/event-format";
import { logEvent } from "@/lib/events";

const gameSchema = z.enum(["lol", "cs2"]);

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? new Date(v) : null));

const seasonInputSchema = z
  .object({
    name: z.string().trim().min(3).max(80),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .refine(isValidSlug, "Slug must be 3–48 chars, lowercase alphanumeric with hyphens"),
    game: gameSchema,
    // See seasons.groupBestOf. Only 1 and 2 have a reporting flow.
    groupBestOf: z.enum(["1", "2"]).transform(Number),
    // Checkbox: "on" when ticked, absent otherwise.
    fearlessDraft: z
      .string()
      .nullish()
      .transform((v) => v === "on"),
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
    draftAt: optionalDate,
    seasonStartAt: optionalDate,
    groupStageEndsAt: optionalDate,
    semisAt: optionalDate,
    finalAt: optionalDate,
    // Whole dollars; blank = no prize pool (and the split is ignored).
    prizePool: z
      .string()
      .nullish()
      .transform((v) => (v?.trim() ? Number(v) : null))
      .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 1_000_000)),
    prizeSplit: z.string().nullish(),
  })
  .transform(({ prizeSplit, ...rest }) => ({
    ...rest,
    prizeSplit: rest.prizePool === null ? null : parsePrizeSplit(prizeSplit ?? ""),
  }))
  .refine((v) => v.prizePool === null || v.prizeSplit !== null);

function parseSeasonInput(formData: FormData) {
  return seasonInputSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    game: formData.get("game"),
    groupBestOf: formData.get("groupBestOf"),
    fearlessDraft: formData.get("fearlessDraft"),
    description: formData.get("description"),
    rules: formData.get("rules"),
    signupOpensAt: formData.get("signupOpensAt"),
    signupClosesAt: formData.get("signupClosesAt"),
    draftAt: formData.get("draftAt"),
    seasonStartAt: formData.get("seasonStartAt"),
    groupStageEndsAt: formData.get("groupStageEndsAt"),
    semisAt: formData.get("semisAt"),
    finalAt: formData.get("finalAt"),
    prizePool: formData.get("prizePool"),
    prizeSplit: formData.get("prizeSplit"),
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

  const [created] = await db
    .insert(seasons)
    .values({
      ...parsed.data,
      createdBy: session.user.id,
    })
    .returning({ id: seasons.id });
  await logEvent("season.created", { actorId: session.user.id, seasonId: created?.id });

  revalidatePath("/admin");
  revalidatePath("/seasons");
  redirect(`/admin/seasons/${parsed.data.slug}`);
}

/** Dates and arrays compare by value in the event diff, as strings. */
function comparable(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join("/") : v,
    ]),
  );
}

export async function updateSeason(slug: string, formData: FormData) {
  const session = await requireAdmin();
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
  const after = comparable(parsed.data);
  const before = comparable(existing);
  const changes = diffFields(
    Object.fromEntries(Object.keys(after).map((k) => [k, before[k]])),
    after,
  );
  if (Object.keys(changes).length) {
    await logEvent("season.updated", {
      actorId: session.user.id,
      seasonId: existing.id,
      data: { changes },
    });
  }

  revalidatePath("/admin");
  revalidatePath("/seasons");
  revalidatePath(`/seasons/${parsed.data.slug}`);
  redirect(`/admin/seasons/${parsed.data.slug}?saved=1`);
}

export async function transitionSeasonState(slug: string, formData: FormData) {
  const session = await requireAdmin();
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
  await logEvent("season.state_changed", {
    actorId: session.user.id,
    seasonId: existing.id,
    data: { from: existing.state, to: nextState },
  });

  // Captains are final: give them the Discord Captain role (after the response).
  if (nextState === "captains_selected") {
    syncInBackground(`${slug} captain role`, () => syncCaptainRole(existing.id));
  }
  // A new signup window: Signed up / Sub list move to this season's people.
  if (nextState === "signups_open") {
    syncInBackground(`${slug} signup roles`, () => syncSignupRoles(existing.id));
  }

  revalidatePath("/admin");
  revalidatePath("/seasons");
  revalidatePath(`/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}?saved=1`);
}

/**
 * Re-runs every Discord sync (syncSeasonDiscord) and reports back via
 * the query string: `discord=<assigned>.<unmatched>.<errors>` plus the first
 * error's text. Unmatched people are listed on the page from the DB.
 */
export async function syncDiscordRoles(slug: string) {
  const session = await requireAdmin();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");
  if (!discordConfig()) redirect(`/admin/seasons/${slug}?error=discord-not-configured`);

  const report = await syncSeasonDiscord(season.id);
  if (report.errors.length) console.error("[discord] manual sync", JSON.stringify(report));
  await logEvent("discord.synced", {
    actorId: session.user.id,
    seasonId: season.id,
    data: {
      assigned: report.assigned,
      unmatched: report.unmatched.length,
      errors: report.errors.length,
    },
  });

  const params = new URLSearchParams({
    discord: `${report.assigned}.${report.unmatched.length}.${report.errors.length}`,
  });
  if (report.errors[0]) params.set("discordError", report.errors[0].slice(0, 300));
  revalidatePath(`/admin/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}?${params}`);
}

/** Shared shell for the admin Discord tools: auth, season, a one-line result. */
async function discordTool(
  slug: string,
  type: EventType,
  run: (seasonId: string) => Promise<string>,
) {
  const session = await requireAdmin();
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) redirect("/admin?error=not-found");
  if (!discordConfig()) redirect(`/admin/seasons/${slug}?error=discord-not-configured`);
  const note = await run(season.id);
  await logEvent(type, { actorId: session.user.id, seasonId: season.id, data: { note } });
  revalidatePath(`/admin/seasons/${slug}`);
  redirect(`/admin/seasons/${slug}?${new URLSearchParams({ discordNote: note.slice(0, 300) })}`);
}

/** Sets everyone's server nickname to their site display name. */
export async function setDiscordNicknames(slug: string) {
  await discordTool(slug, "discord.nicknames", async (seasonId) => {
    const r = await syncNicknames(seasonId);
    if (r.errors.length) console.error("[discord] nicknames", JSON.stringify(r));
    return `Nicknames set for ${r.renamed} player${r.renamed === 1 ? "" : "s"}${r.unmatched.length ? `, ${r.unmatched.length} not matched` : ""}${r.errors.length ? `. ${r.errors.length} failed, e.g. ${r.errors[0]}` : "."}`;
  });
}

/** Deletes older seasons' team channels and categories (irreversible). */
export async function deleteOldDiscordChannels(slug: string) {
  await discordTool(slug, "discord.channels_deleted", async (seasonId) => {
    const r = await deleteOldTeamChannels(seasonId);
    if (r.errors.length) console.error("[discord] cleanup", JSON.stringify(r));
    return `Deleted ${r.rolesDeleted} old channel${r.rolesDeleted === 1 ? "" : "s"}${r.errors.length ? `. ${r.errors.length} failed, e.g. ${r.errors[0]}` : "."}`;
  });
}

/** Emails players with no Discord username, or one that isn't in the server. */
export async function emailDiscordUnmatched(slug: string) {
  await discordTool(slug, "discord.emailed_unmatched", async (seasonId) => {
    const { sent, failed } = await emailUnmatchedPlayers(seasonId);
    return `Emailed ${sent} player${sent === 1 ? "" : "s"}${failed ? ` (${failed} failed)` : ""}.`;
  });
}
