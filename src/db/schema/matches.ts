import { index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { seasons } from "./seasons";
import { teams } from "./drafts";

export const matchStateEnum = pgEnum("match_state", [
  "scheduled",
  "reported",
  "confirmed",
  "disputed",
]);

export const matchStageEnum = pgEnum("match_stage", ["group", "semis", "final"]);

export const matches = pgTable(
  "matches",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    stage: matchStageEnum("stage").notNull().default("group"),
    homeTeamId: text("home_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    awayTeamId: text("away_team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { mode: "date" }),
    state: matchStateEnum("state").notNull().default("scheduled"),
    winnerTeamId: text("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    reportedBy: text("reported_by").references(() => users.id, { onDelete: "set null" }),
    reportedAt: timestamp("reported_at", { mode: "date" }),
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    index("matches_season_idx").on(t.seasonId),
    index("matches_home_idx").on(t.homeTeamId),
    index("matches_away_idx").on(t.awayTeamId),
  ],
);

export type Match = typeof matches.$inferSelect;
export type MatchState = Match["state"];
export type MatchStage = Match["stage"];
