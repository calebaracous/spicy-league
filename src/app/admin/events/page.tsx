import { desc } from "drizzle-orm";
import Link from "next/link";

import { markAllEventsRead } from "./actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { FlashToast } from "@/components/flash-toast";
import { Badge } from "@/components/ui/badge";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  EVENT_CATEGORIES,
  categoryOf,
  describeDetails,
  describeEvent,
  isEventCategory,
  type EventView,
} from "@/lib/event-format";
import { EVENT_RETENTION_DAYS, countUnreadEvents, getEventsSeenAt, listEvents } from "@/lib/events";
import { cn } from "@/lib/utils";

export const metadata = { title: "Events · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  category?: string;
  user?: string;
  season?: string;
  unread?: string;
  before?: string;
  saved?: string;
}>;

const selectClass =
  "border-input h-8 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3";

export default async function AdminEventsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireAdmin();
  const params = await searchParams;
  const category = isEventCategory(params.category) ? params.category : undefined;
  const username = params.user?.trim() || undefined;
  const seasonSlug = params.season || undefined;
  const unreadOnly = params.unread === "1";
  const renderedAt = new Date();

  const seenAt = await getEventsSeenAt(session.user.id);
  const [{ rows, hasMore }, unread, allSeasons] = await Promise.all([
    listEvents(
      { category, username, seasonSlug, unreadOnly, before: params.before },
      session.user.id,
      seenAt,
    ),
    countUnreadEvents(session.user.id, seenAt),
    db
      .select({ name: seasons.name, slug: seasons.slug })
      .from(seasons)
      .orderBy(desc(seasons.createdAt)),
  ]);

  const filterQuery = new URLSearchParams({
    ...(category ? { category } : {}),
    ...(username ? { user: username } : {}),
    ...(seasonSlug ? { season: seasonSlug } : {}),
    ...(unreadOnly ? { unread: "1" } : {}),
  });
  const filtered = filterQuery.size > 0;
  const olderHref = hasMore
    ? `/admin/events?${new URLSearchParams({ ...Object.fromEntries(filterQuery), before: rows[rows.length - 1].id })}`
    : null;
  const isUnread = (r: (typeof rows)[number]) =>
    r.actorId !== session.user.id && (!seenAt || r.createdAt > seenAt);

  return (
    <div className="page flex-1 space-y-6 [--page-max:64rem]">
      <header className="space-y-2">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Admin
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading flex items-center gap-2">
            Events
            {unread > 0 ? <Badge>{unread} new</Badge> : null}
          </h1>
          {unread > 0 ? (
            <form action={markAllEventsRead}>
              <input type="hidden" name="upTo" value={renderedAt.toISOString()} />
              <PendingSubmitButton variant="outline" size="sm">
                Mark all as read
              </PendingSubmitButton>
            </form>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          Everything that happens on the site, newest first. New since you last marked them read are
          highlighted; your own actions never count as new. Kept for {EVENT_RETENTION_DAYS} days.
        </p>
      </header>

      {params.saved === "read" ? <FlashToast message="All caught up." /> : null}

      <form className="flex flex-wrap items-center gap-2" role="search">
        <select
          name="category"
          defaultValue={category ?? ""}
          aria-label="Category"
          className={selectClass}
        >
          <option value="">All categories</option>
          {Object.entries(EVENT_CATEGORIES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="season"
          defaultValue={seasonSlug ?? ""}
          aria-label="Season"
          className={selectClass}
        >
          <option value="">All seasons</option>
          {allSeasons.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
        <Input
          name="user"
          defaultValue={username ?? ""}
          placeholder="Username"
          aria-label="Filter by username"
          className="h-8 max-w-40"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="unread" value="1" defaultChecked={unreadOnly} />
          Unread only
        </label>
        <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
          Filter
        </button>
        {filtered ? (
          <Link
            href="/admin/events"
            className="text-muted-foreground hover:text-foreground text-xs underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border px-4 py-6 text-center text-sm">
          {unreadOnly ? "Nothing new." : "No events match."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map((r) => {
            const view: EventView = {
              type: r.type,
              data: r.data,
              actor:
                r.actorUsername || r.actorName
                  ? { username: r.actorUsername, name: r.actorName }
                  : null,
              subject:
                r.subjectUsername || r.subjectName
                  ? { username: r.subjectUsername, name: r.subjectName }
                  : null,
              season: r.seasonSlug
                ? { name: r.seasonName ?? r.seasonSlug, slug: r.seasonSlug }
                : null,
            };
            const cat = categoryOf(r.type);
            const details = describeDetails(view);
            const fresh = isUnread(r);
            return (
              <li
                key={r.id}
                className={cn(
                  "flex flex-col gap-1 border-l-2 px-4 py-2.5 sm:flex-row sm:gap-3",
                  fresh ? "border-l-primary bg-primary/5" : "border-l-transparent",
                )}
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="text-sm">
                    {describeEvent(view).map((seg, i) =>
                      typeof seg === "string" ? (
                        <span key={i}>{seg}</span>
                      ) : (
                        <Link key={i} href={seg.href} className="font-medium hover:underline">
                          {seg.text}
                        </Link>
                      ),
                    )}
                  </p>
                  {details.length ? (
                    <ul className="text-muted-foreground text-xs">
                      {details.map((line, i) => (
                        <li key={i} className="break-words">
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-row-reverse items-center justify-end gap-2 sm:flex-col sm:items-end sm:gap-1 sm:text-right">
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    <LocalTime date={r.createdAt} preset="datetime" />
                  </span>
                  <span className="flex items-center gap-1">
                    {r.backfilled ? (
                      <span
                        className="text-muted-foreground text-[10px]"
                        title="Reconstructed from existing data"
                      >
                        reconstructed
                      </span>
                    ) : null}
                    {cat ? (
                      <Badge variant="outline" className="text-[10px]">
                        {EVENT_CATEGORIES[cat]}
                      </Badge>
                    ) : null}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <nav aria-label="Pages" className="flex items-center justify-between text-sm">
        {params.before ? (
          <Link
            href={`/admin/events${filtered ? `?${filterQuery}` : ""}`}
            className="text-accent-text hover:underline"
          >
            ← Newest
          </Link>
        ) : (
          <span />
        )}
        {olderHref ? (
          <Link href={olderHref} className="text-accent-text hover:underline">
            Older →
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
