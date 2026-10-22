import "server-only";

import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { teams } from "@/db/schema/drafts";
import { events } from "@/db/schema/events";
import { matches } from "@/db/schema/matches";
import { seasons } from "@/db/schema/seasons";
import { eventTypesIn, type EventCategory, type EventType } from "@/lib/event-format";

/** Events older than this are deleted by the daily cron (pruneOldEvents). */
export const EVENT_RETENTION_DAYS = 60;

export const EVENTS_PAGE_SIZE = 50;

type LogInput = {
  actorId?: string | null;
  subjectUserId?: string | null;
  seasonId?: string | null;
  data?: Record<string, unknown>;
};

/**
 * Record one event for the admin inbox. Call it after the change has
 * succeeded (before any redirect()). Never throws: a failed log must not
 * fail the action that triggered it.
 */
export async function logEvent(type: EventType, input: LogInput = {}): Promise<void> {
  try {
    await db.insert(events).values({
      type,
      actorId: input.actorId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      seasonId: input.seasonId ?? null,
      data: input.data ?? {},
    });
  } catch (err) {
    console.error(`[events] failed to log ${type}`, err);
  }
}

/**
 * `{ matchId, matchLabel: "Home vs Away" }` for match events, so the inbox
 * still reads right after teams are renamed or the match is regenerated.
 */
export async function matchEventData(matchId: string): Promise<Record<string, unknown>> {
  try {
    const home = aliasedTable(teams, "home");
    const away = aliasedTable(teams, "away");
    const [row] = await db
      .select({ home: home.name, away: away.name })
      .from(matches)
      .innerJoin(home, eq(matches.homeTeamId, home.id))
      .innerJoin(away, eq(matches.awayTeamId, away.id))
      .where(eq(matches.id, matchId));
    return { matchId, matchLabel: row ? `${row.home} vs ${row.away}` : null };
  } catch {
    return { matchId };
  }
}

export async function pruneOldEvents(): Promise<number> {
  const cutoff = new Date(Date.now() - EVENT_RETENTION_DAYS * 86_400_000);
  const deleted = await db
    .delete(events)
    .where(lt(events.createdAt, cutoff))
    .returning({ id: events.id });
  return deleted.length;
}

export type EventFilters = {
  category?: EventCategory;
  /** Username: matches events this user did or that affected them. */
  username?: string;
  seasonSlug?: string;
  unreadOnly?: boolean;
  /** Event id to page after (older than it). */
  before?: string;
};

const actors = aliasedTable(users, "actor");
const subjects = aliasedTable(users, "subject");

/**
 * "Unread" for one admin: newer than their eventsSeenAt, and not something
 * they did themselves.
 */
export function unreadFor(adminId: string, seenAt: Date | null) {
  const notMine = or(isNull(events.actorId), ne(events.actorId, adminId));
  return seenAt ? and(gt(events.createdAt, seenAt), notMine) : notMine;
}

/** One page of events, newest first, with the names they mention. */
export async function listEvents(filters: EventFilters, adminId: string, seenAt: Date | null) {
  const where = [];
  if (filters.category) where.push(inArray(events.type, eventTypesIn(filters.category)));
  if (filters.username) {
    const u = filters.username.toLowerCase();
    where.push(or(eq(actors.username, u), eq(subjects.username, u)));
  }
  if (filters.seasonSlug) where.push(eq(seasons.slug, filters.seasonSlug));
  if (filters.unreadOnly) where.push(unreadFor(adminId, seenAt));
  if (filters.before) {
    // Row comparison against the cursor row itself, so equal timestamps and
    // Postgres' microsecond precision can't skip or repeat rows.
    where.push(
      sql`(${events.createdAt}, ${events.id}) < (select created_at, id from events where id = ${filters.before})`,
    );
  }

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      data: events.data,
      backfilled: events.backfilled,
      actorId: events.actorId,
      createdAt: events.createdAt,
      actorUsername: actors.username,
      actorName: actors.name,
      subjectUsername: subjects.username,
      subjectName: subjects.name,
      seasonName: seasons.name,
      seasonSlug: seasons.slug,
    })
    .from(events)
    .leftJoin(actors, eq(events.actorId, actors.id))
    .leftJoin(subjects, eq(events.subjectUserId, subjects.id))
    .leftJoin(seasons, eq(events.seasonId, seasons.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(EVENTS_PAGE_SIZE + 1);

  const hasMore = rows.length > EVENTS_PAGE_SIZE;
  return { rows: rows.slice(0, EVENTS_PAGE_SIZE), hasMore };
}

/** When this admin last marked the inbox read (null = never). */
export async function getEventsSeenAt(userId: string): Promise<Date | null> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { eventsSeenAt: true },
  });
  return row?.eventsSeenAt ?? null;
}

export async function countUnreadEvents(adminId: string, seenAt: Date | null): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(unreadFor(adminId, seenAt));
  return n;
}

export async function markEventsSeen(adminId: string, upTo: Date): Promise<void> {
  await db.update(users).set({ eventsSeenAt: upTo }).where(eq(users.id, adminId));
}
