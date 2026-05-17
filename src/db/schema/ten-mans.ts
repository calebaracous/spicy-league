import { index, integer, pgEnum, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const tenManStateEnum = pgEnum("ten_man_state", [
  "signups",
  "voting",
  "drafting",
  "ready",
  "complete",
  "cancelled",
]);

export const tenMans = pgTable("ten_mans", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  state: tenManStateEnum("state").notNull().default("signups"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  signupsClosedAt: timestamp("signups_closed_at", { mode: "date" }),
  draftStartedAt: timestamp("draft_started_at", { mode: "date" }),
  readyAt: timestamp("ready_at", { mode: "date" }),
  completedAt: timestamp("completed_at", { mode: "date" }),
  lobbyCode: text("lobby_code"),
  winnerCaptainUserId: text("winner_captain_user_id").references(() => users.id),
  durationLabel: text("duration_label"),
});

export const tenManSignups = pgTable(
  "ten_man_signups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenManId: text("ten_man_id")
      .notNull()
      .references(() => tenMans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signupOrder: integer("signup_order").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("ten_man_signups_uniq").on(t.tenManId, t.userId),
    unique("ten_man_signups_order_uniq").on(t.tenManId, t.signupOrder),
    index("ten_man_signups_ten_idx").on(t.tenManId),
  ],
);

export const tenManVotes = pgTable(
  "ten_man_votes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenManId: text("ten_man_id")
      .notNull()
      .references(() => tenMans.id, { onDelete: "cascade" }),
    voterUserId: text("voter_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateUserId: text("candidate_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("ten_man_votes_uniq").on(t.tenManId, t.voterUserId, t.candidateUserId),
    index("ten_man_votes_ten_idx").on(t.tenManId),
  ],
);

export const tenManCaptains = pgTable(
  "ten_man_captains",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenManId: text("ten_man_id")
      .notNull()
      .references(() => tenMans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    captainOrder: integer("captain_order").notNull(),
    voteCount: integer("vote_count").notNull(),
  },
  (t) => [
    unique("ten_man_captains_uniq").on(t.tenManId, t.userId),
    unique("ten_man_captains_order_uniq").on(t.tenManId, t.captainOrder),
  ],
);

export const tenManPicks = pgTable(
  "ten_man_picks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tenManId: text("ten_man_id")
      .notNull()
      .references(() => tenMans.id, { onDelete: "cascade" }),
    pickNumber: integer("pick_number").notNull(),
    captainUserId: text("captain_user_id")
      .notNull()
      .references(() => users.id),
    pickedUserId: text("picked_user_id")
      .notNull()
      .references(() => users.id),
    pickedAt: timestamp("picked_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    unique("ten_man_picks_num_uniq").on(t.tenManId, t.pickNumber),
    unique("ten_man_picks_user_uniq").on(t.tenManId, t.pickedUserId),
  ],
);

export type TenMan = typeof tenMans.$inferSelect;
export type TenManState = TenMan["state"];
export type TenManSignup = typeof tenManSignups.$inferSelect;
export type TenManVote = typeof tenManVotes.$inferSelect;
export type TenManCaptain = typeof tenManCaptains.$inferSelect;
export type TenManPick = typeof tenManPicks.$inferSelect;
