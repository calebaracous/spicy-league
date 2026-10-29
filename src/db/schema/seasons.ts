import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  boolean,
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
    // Doubles as the group stage start; the rest of the schedule follows.
    seasonStartAt: timestamp("season_start_at", { mode: "date" }),
    draftAt: timestamp("draft_at", { mode: "date" }),
    groupStageEndsAt: timestamp("group_stage_ends_at", { mode: "date" }),
    semisAt: timestamp("semis_at", { mode: "date" }),
    finalAt: timestamp("final_at", { mode: "date" }),
    // Group-stage series length. 1 = report a winner (+ optional score);
    // 2 = Bo2 series, reported as 2–0 / 1–1 / 0–2, and a 1–1 is a draw.
    groupBestOf: integer("group_best_of").notNull().default(1),
    // Playoff series lengths (semis, final). Match day ends a series once a
    // team has a majority (docs/MATCH-DAY.md); reporting is winner + score.
    playoffBestOf: integer("playoff_best_of").notNull().default(3),
    finalBestOf: integer("final_best_of").notNull().default(5),
    // Fearless draft: a champion picked in one game of a series can't be
    // picked again by either team in that series. Display only (the site
    // doesn't run champ select); shown wherever the series format is.
    fearlessDraft: boolean("fearless_draft").notNull().default(false),
    // Prize pool in whole dollars, and its payout split in percent per
    // place (1st first, sums to 100). Both null = no prize pool.
    prizePool: integer("prize_pool"),
    prizeSplit: integer("prize_split").array(),
    // Discord category holding this season's team channels (syncTeamRoles).
    discordCategoryId: text("discord_category_id"),
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

// "player" = regular signup (draft pool). "sub" = signed up after regular
// signups closed, only to be picked as a substitute — never drafted.
export const signupKindEnum = pgEnum("signup_kind", ["player", "sub"]);

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
    // Free-text answer to the signup form's moral quandary (SIGNUP_QUANDARY).
    quandary: text("quandary"),
    kind: signupKindEnum("kind").notNull().default("player"),
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
