import {
  boolean,
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

// The game's draft room (phase 3). waiting: both sides ready up. countdown:
// 3s until step 1's clock (draftStartsAt). drafting: stepDeadline per step.
// complete: all 20 steps taken. skipped: an admin let the game go ahead
// without a draft here.
export const matchDraftStateEnum = pgEnum("match_draft_state", [
  "waiting",
  "countdown",
  "drafting",
  "complete",
  "skipped",
]);
export const draftSideEnum = pgEnum("draft_side", ["blue", "red"]);
export const draftKindEnum = pgEnum("draft_kind", ["ban", "pick"]);

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
    // Game result (phase 2): any captain of either team or an admin records
    // it; the other team can flag it for an admin.
    winnerTeamId: text("winner_team_id").references(() => teams.id, { onDelete: "set null" }),
    resultReportedBy: text("result_reported_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resultReportedAt: timestamp("result_reported_at", { mode: "date" }),
    resultFlaggedBy: text("result_flagged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resultFlaggedAt: timestamp("result_flagged_at", { mode: "date" }),
    // Draft room clock (phase 3). The step on the clock is derived from the
    // actions (count + 1), never stored. Hovers are Data Dragon keys.
    draftState: matchDraftStateEnum("draft_state").notNull().default("waiting"),
    blueReadyAt: timestamp("blue_ready_at", { mode: "date" }),
    redReadyAt: timestamp("red_ready_at", { mode: "date" }),
    draftStartsAt: timestamp("draft_starts_at", { mode: "date" }),
    stepDeadline: timestamp("step_deadline", { mode: "date" }),
    blueHover: text("blue_hover"),
    redHover: text("red_hover"),
    draftCompletedAt: timestamp("draft_completed_at", { mode: "date" }),
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
/**
 * One taken draft step, append-only. A champion appears at most once per game
 * (partial unique index on (game_id, champion_key) WHERE champion_key IS NOT
 * NULL, hand-written in 0018_match_draft.sql — Drizzle can't express it).
 */
export const matchDraftActions = pgTable(
  "match_draft_actions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    gameId: text("game_id")
      .notNull()
      .references(() => matchGames.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    side: draftSideEnum("side").notNull(),
    kind: draftKindEnum("kind").notNull(),
    // Null = a skipped ban (by choice or the clock).
    championKey: text("champion_key"),
    // Null when the clock picked (auto).
    actedBy: text("acted_by").references(() => users.id, { onDelete: "set null" }),
    auto: boolean("auto").notNull().default(false),
    // Picks only (phase 4): which lineup player played it — set by the team's
    // captains after the draft; per-player champion stats read it.
    assignedUserId: text("assigned_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [unique("match_draft_actions_game_step_uniq").on(t.gameId, t.step)],
);

export type MatchGame = typeof matchGames.$inferSelect;
export type MatchDraftAction = typeof matchDraftActions.$inferSelect;
