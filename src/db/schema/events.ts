import { boolean, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { seasons } from "./seasons";

// Append-only site activity log for the admin events inbox (src/lib/events.ts,
// /admin/events). `type` is plain text, typed by the EventType union in code,
// so adding an event type needs no migration. FKs are set null on delete so
// history outlives the row; `data` keeps the names needed to render it.
// Rows older than EVENT_RETENTION_DAYS are pruned by the daily cron.
export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: text("type").notNull(),
    // Who did it. Null for system jobs (cron).
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    // Whose account it affected, when that's someone other than the actor.
    subjectUserId: text("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    seasonId: text("season_id").references(() => seasons.id, { onDelete: "set null" }),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
    // Reconstructed from existing timestamps by scripts/backfill-events.ts.
    backfilled: boolean("backfilled").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    index("events_created_idx").on(table.createdAt),
    index("events_actor_idx").on(table.actorId),
    index("events_subject_idx").on(table.subjectUserId),
    index("events_season_idx").on(table.seasonId),
  ],
);

export type EventRow = typeof events.$inferSelect;
