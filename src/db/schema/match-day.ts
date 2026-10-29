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

import type { RpsRound } from "../../lib/rps";
import { users } from "./auth";
import { teams } from "./drafts";
import { matches } from "./matches";

// Match day (docs/MATCH-DAY.md): rock-paper-scissors for game 1's side, then
// one match_games row per game. LoL seasons only.

export const rpsThrowEnum = pgEnum("rps_throw", ["rock", "paper", "scissors"]);

// waiting: seats filling / readying up. throwing: a round is live until
// throwDeadline. revealed: both throws shown until revealUntil, then the next
// round or done. done: winnerTeamId set and game 1's side pick is open.
export const rpsStateEnum = pgEnum("rps_state", ["waiting", "throwing", "revealed", "done"]);

// rps: the RPS winner chose. loser: the previous game's loser chose (phase 2).
// auto: the chooser ran out of time, side was random. admin: set by an admin.
export const sideChosenViaEnum = pgEnum("side_chosen_via", ["rps", "loser", "auto", "admin"]);

export const matchRps = pgTable("match_rps", {
  matchId: text("match_id")
    .primaryKey()
    .references(() => matches.id, { onDelete: "cascade" }),
  state: rpsStateEnum("state").notNull().default("waiting"),
  // Seat holders: the first captain of each team to ready up plays.
  homeUserId: text("home_user_id").references(() => users.id, { onDelete: "set null" }),
  awayUserId: text("away_user_id").references(() => users.id, { onDelete: "set null" }),
  homeReadyAt: timestamp("home_ready_at", { mode: "date" }),
  awayReadyAt: timestamp("away_ready_at", { mode: "date" }),
  round: integer("round").notNull().default(0),
  throwDeadline: timestamp("throw_deadline", { mode: "date" }),
  revealUntil: timestamp("reveal_until", { mode: "date" }),
  homeThrow: rpsThrowEnum("home_throw"),
  awayThrow: rpsThrowEnum("away_throw"),
  // Finished rounds, oldest first (void = someone didn't throw → replayed).
  history: jsonb("history").$type<RpsRound[]>().notNull().default([]),
  winnerTeamId: text("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export const matchGames = pgTable(
  "match_games",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    gameNumber: integer("game_number").notNull(),
    sideChooserTeamId: text("side_chooser_team_id").references(() => teams.id, {
      onDelete: "set null",
    }),
    sideDeadline: timestamp("side_deadline", { mode: "date" }),
    sideChosenVia: sideChosenViaEnum("side_chosen_via"),
    sideChosenBy: text("side_chosen_by").references(() => users.id, { onDelete: "set null" }),
    sideChosenAt: timestamp("side_chosen_at", { mode: "date" }),
    blueTeamId: text("blue_team_id").references(() => teams.id, { onDelete: "set null" }),
    redTeamId: text("red_team_id").references(() => teams.id, { onDelete: "set null" }),
    // Riot Tournament API (phase 6).
    tournamentCode: text("tournament_code"),
    riotMatchId: text("riot_match_id"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("match_games_match_game_uniq").on(t.matchId, t.gameNumber),
    index("match_games_match_idx").on(t.matchId),
  ],
);

export type MatchRps = typeof matchRps.$inferSelect;
export type MatchGame = typeof matchGames.$inferSelect;
