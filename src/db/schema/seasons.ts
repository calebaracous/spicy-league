import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";

export const gameEnum = pgEnum("game", ["lol", "cs2"]);

export const seasonStateEnum = pgEnum("season_state", [
  "draft",
  "signups_open",
  "signups_closed",
  "captains_selected",
  "drafting",
  "group_stage",
  "playoffs",
  "complete",
]);

export const seasons = pgTable(
  "seasons",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    game: gameEnum("game").notNull(),
    state: seasonStateEnum("state").notNull().default("draft"),
    description: text("description"),
    rules: text("rules"),
    signupOpensAt: timestamp("signup_opens_at", { mode: "date" }),
    signupClosesAt: timestamp("signup_closes_at", { mode: "date" }),
    seasonStartAt: timestamp("season_start_at", { mode: "date" }),
    championTeamId: text("champion_team_id"),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [index("seasons_state_idx").on(table.state)],
);

export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type SeasonState = Season["state"];
export type Game = Season["game"];

export const seasonSignups = pgTable(
  "season_signups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rolePrefs: jsonb("role_prefs"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("season_signups_season_user_uniq").on(table.seasonId, table.userId),
    index("season_signups_season_idx").on(table.seasonId),
  ],
);

export const seasonCaptains = pgTable(
  "season_captains",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    captainOrder: integer("captain_order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    unique("season_captains_season_user_uniq").on(table.seasonId, table.userId),
    index("season_captains_season_idx").on(table.seasonId),
  ],
);

export type SeasonSignup = typeof seasonSignups.$inferSelect;
export type SeasonCaptain = typeof seasonCaptains.$inferSelect;
