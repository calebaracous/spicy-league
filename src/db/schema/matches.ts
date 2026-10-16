import { index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

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

// ── Substitutions ────────────────────────────────────────────────────────────
// A player who isn't on a team's roster playing one match for it. A match's
// lineup is derived: team roster − approved replacedUserIds + approved
// subUserIds (getMatchLineups in src/lib/substitutions.ts).
export const substitutionStatusEnum = pgEnum("substitution_status", [
  "pending", // captain asked, waiting on an admin
  "approved", // counts: sub plays, replaced player sits out
  "rejected",
  "withdrawn", // captain cancelled, or admin revoked before the match was reported
]);

export const matchSubstitutions = pgTable(
  "match_substitutions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    matchId: text("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    subUserId: text("sub_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Roster player sitting out. Null = the sub fills an empty slot.
    replacedUserId: text("replaced_user_id").references(() => users.id, { onDelete: "set null" }),
    status: substitutionStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
    decidedAt: timestamp("decided_at", { mode: "date" }),
  },
  (t) => [
    index("match_subs_match_idx").on(t.matchId),
    index("match_subs_sub_user_idx").on(t.subUserId),
    unique("match_subs_match_sub_uniq").on(t.matchId, t.subUserId),
  ],
);

export type MatchSubstitution = typeof matchSubstitutions.$inferSelect;
export type SubstitutionStatus = MatchSubstitution["status"];

export type Match = typeof matches.$inferSelect;
export type MatchState = Match["state"];
export type MatchStage = Match["stage"];
