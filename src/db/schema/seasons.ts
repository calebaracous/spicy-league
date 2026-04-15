import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
