import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const accountProviderEnum = pgEnum("account_provider", ["riot", "steam", "leetify"]);

// Multiple links per (user, provider) are allowed for "riot" (up to 3, enforced
// in app code). For "steam"/"leetify" the app still treats it as one-per-user.
// The unique constraint is on (userId, provider, externalId) so a user can't
// link the same Riot ID twice.
export const accountLinks = pgTable(
  "account_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: accountProviderEnum("provider").notNull(),
    // For riot: PUUID. For steam: Steam64 ID. For leetify: profile URL.
    externalId: text("external_id").notNull(),
    // For riot: gameName#tagLine. For steam: display name. For leetify: profile URL.
    externalHandle: text("external_handle"),
    linkedAt: timestamp("linked_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("account_links_user_provider_external_uniq").on(
      table.userId,
      table.provider,
      table.externalId,
    ),
    index("account_links_user_idx").on(table.userId),
  ],
);

export const riotStatSnapshots = pgTable(
  "riot_stat_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountLinkId: text("account_link_id")
      .notNull()
      .references(() => accountLinks.id, { onDelete: "cascade" }),
    queue: text("queue").notNull(), // "solo" | "flex"
    tier: text("tier"),
    rankDivision: text("rank_division"),
    lp: integer("lp"),
    wins: integer("wins"),
    losses: integer("losses"),
    topChamps: jsonb("top_champs"), // [{ championId, championPoints }]
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("riot_snapshots_user_idx").on(table.userId),
    index("riot_snapshots_link_idx").on(table.accountLinkId),
  ],
);

export const leetifyStatSnapshots = pgTable(
  "leetify_stat_snapshots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rating: numeric("rating"),
    winrate: numeric("winrate"),
    avgKd: numeric("avg_kd"),
    avgAdr: numeric("avg_adr"),
    capturedAt: timestamp("captured_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("leetify_snapshots_user_idx").on(table.userId)],
);

export type AccountLink = typeof accountLinks.$inferSelect;
export type RiotStatSnapshot = typeof riotStatSnapshots.$inferSelect;
export type LeetifyStatSnapshot = typeof leetifyStatSnapshots.$inferSelect;
