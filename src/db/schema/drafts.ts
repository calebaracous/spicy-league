import { index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { seasons } from "./seasons";

export const draftStateEnum = pgEnum("draft_state", [
  "pending",
  "in_progress",
  "paused",
  "completed",
]);

export const drafts = pgTable("drafts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  seasonId: text("season_id")
    .notNull()
    .unique()
    .references(() => seasons.id, { onDelete: "cascade" }),
  state: draftStateEnum("state").notNull().default("pending"),
  startedAt: timestamp("started_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export const draftPicks = pgTable(
  "draft_picks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    draftId: text("draft_id")
      .notNull()
      .references(() => drafts.id, { onDelete: "cascade" }),
    pickNumber: integer("pick_number").notNull(),
    captainUserId: text("captain_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickedUserId: text("picked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickedAt: timestamp("picked_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("draft_picks_draft_pick_uniq").on(t.draftId, t.pickNumber),
    unique("draft_picks_draft_picked_uniq").on(t.draftId, t.pickedUserId),
    index("draft_picks_draft_idx").on(t.draftId),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    seasonId: text("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    captainUserId: text("captain_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("teams_season_captain_uniq").on(t.seasonId, t.captainUserId),
    index("teams_season_idx").on(t.seasonId),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pickNumber: integer("pick_number"),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("team_members_team_user_uniq").on(t.teamId, t.userId),
    index("team_members_team_idx").on(t.teamId),
  ],
);

export type Draft = typeof drafts.$inferSelect;
export type DraftPick = typeof draftPicks.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type DraftState = Draft["state"];
