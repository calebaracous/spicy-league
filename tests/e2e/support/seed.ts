import { hashPassword } from "@better-auth/utils/password";

import * as schema from "../../../src/db/schema";
import { db, userIdsByUsername } from "./db";
import { E2E_EMAIL_DOMAIN, E2E_SLUG_PREFIX } from "./env";

const { users, accounts, seasons, seasonSignups, seasonCaptains, drafts } = schema;

export const PLAYER_COUNT = 24;

/** Run-scoped identity. Set by global-setup via process.env so every worker
 *  sees the same run id and password. */
export function run() {
  const id = process.env.E2E_RUN_ID;
  const password = process.env.E2E_PASSWORD;
  if (!id || !password) throw new Error("E2E run not initialised (global-setup did not run)");
  return { id, password };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Player n (1-based): username, display name, email. */
export function player(n: number) {
  const { id } = run();
  return {
    username: `e2e_${id}_p${pad(n)}`,
    name: `E2E P${pad(n)}`,
    email: `e2e_${id}_p${pad(n)}@${E2E_EMAIL_DOMAIN}`,
  };
}

export function admin() {
  const { id } = run();
  return {
    username: `e2e_${id}_adm`,
    name: "E2E Admin",
    email: `e2e_${id}_adm@${E2E_EMAIL_DOMAIN}`,
  };
}

export function seasonSlug(suffix: string) {
  return `${E2E_SLUG_PREFIX}${run().id}-${suffix}`;
}

/** Create the admin and PLAYER_COUNT players, verified, with the run password. */
export async function seedUsers(): Promise<void> {
  const hash = await hashPassword(run().password);
  const people = [
    { ...admin(), role: "admin" as const },
    ...Array.from({ length: PLAYER_COUNT }, (_, i) => ({
      ...player(i + 1),
      role: "user" as const,
    })),
  ];
  for (const p of people) {
    const id = crypto.randomUUID();
    await db.insert(users).values({
      id,
      email: p.email,
      emailVerified: true,
      username: p.username,
      name: p.name,
      role: p.role,
    });
    await db.insert(accounts).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: hash,
    });
  }
}

const LOL_ROLES = ["top", "jungle", "mid", "adc", "support"] as const;

export async function seedSignups(seasonId: string, playerNumbers: number[]): Promise<void> {
  const ids = await userIdsByUsername(playerNumbers.map((n) => player(n).username));
  for (const n of playerNumbers) {
    await db.insert(seasonSignups).values({
      seasonId,
      userId: ids.get(player(n).username)!,
      rolePrefs: { primaryRole: LOL_ROLES[n % 5], secondaryRole: "fill" },
    });
  }
}

/** A LoL season straight into captains_selected (or drafting with a running
 *  draft), skipping the admin UI. Used by the edge-case specs; the main spec
 *  drives setup through the UI. */
export async function seedDraftSeason(opts: {
  suffix: string;
  captains: number[];
  others: number[];
  startDraft: boolean;
}): Promise<{ slug: string; seasonId: string }> {
  const slug = seasonSlug(opts.suffix);
  const [season] = await db
    .insert(seasons)
    .values({
      name: `E2E ${run().id} ${opts.suffix}`,
      slug,
      game: "lol",
      state: opts.startDraft ? "drafting" : "captains_selected",
    })
    .returning({ id: seasons.id });
  await seedSignups(season.id, [...opts.captains, ...opts.others]);
  const ids = await userIdsByUsername(opts.captains.map((n) => player(n).username));
  for (const [i, n] of opts.captains.entries()) {
    await db.insert(seasonCaptains).values({
      seasonId: season.id,
      userId: ids.get(player(n).username)!,
      captainOrder: i + 1,
    });
  }
  if (opts.startDraft) {
    await db
      .insert(drafts)
      .values({ seasonId: season.id, state: "in_progress", startedAt: new Date() });
  }
  return { slug, seasonId: season.id };
}
