import { desc } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminOverview } from "@/lib/admin-overview";
import { GAME_LABELS, SEASON_STATE_LABELS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  const [allSeasons, overview] = await Promise.all([
    db.query.seasons.findMany({ orderBy: [desc(seasons.createdAt)] }),
    getAdminOverview(),
  ]);
  const { stats, latestUsers, latestSignups, activeSeasons, actionItems } = overview;

  const tiles = [
    { label: "Players", value: stats.totalUsers, href: "/admin/users" },
    { label: "New this week", value: stats.newUsers, href: "/admin/users" },
    { label: "Riot linked", value: stats.riotLinked, href: "/admin/users" },
    { label: "Unverified email", value: stats.unverified, href: "/admin/users?filter=unverified" },
    { label: "Banned", value: stats.activeBans, href: "/admin/users?filter=banned" },
  ];

  return (
    <div className="page flex-1 space-y-6 [--page-max:64rem]">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-heading">Admin</h1>
          <p className="text-muted-foreground text-sm">
            What needs attention, who&apos;s joining, and every season.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/users"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
          >
            Players
          </Link>
          <Link href="/admin/seasons/new" className={cn(buttonVariants({ size: "lg" }))}>
            New season
          </Link>
        </div>
      </header>

      <section aria-label="Site stats" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={t.href}
            className="bg-card hover:bg-muted/40 rounded-xl border px-4 py-3 transition-colors"
          >
            <p className="text-2xl font-medium tabular-nums">{t.value}</p>
            <p className="text-muted-foreground text-xs">{t.label}</p>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          Needs attention
        </h2>
        {actionItems.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border px-4 py-3 text-sm">
            Nothing waiting on an admin.
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {actionItems.map((item) => (
              <li key={`${item.href}-${item.label}`}>
                <Link
                  href={item.href}
                  className="hover:bg-muted/40 flex items-center justify-between gap-3 px-4 py-3 text-sm"
                >
                  <span>
                    <span className="font-medium">{item.label}</span>
                    {item.detail ? (
                      <span className="text-muted-foreground"> · {item.detail}</span>
                    ) : null}
                  </span>
                  <span aria-hidden className="text-muted-foreground">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeSeasons.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Active seasons
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {activeSeasons.map((s) => (
              <Link
                key={s.id}
                href={`/admin/seasons/${s.slug}/signups`}
                className="bg-card hover:bg-muted/40 rounded-xl border px-4 py-3 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{s.name}</p>
                  <Badge>{SEASON_STATE_LABELS[s.state]}</Badge>
                </div>
                <p className="text-muted-foreground mt-1 text-xs">
                  {GAME_LABELS[s.game]} · {s.signups} signup{s.signups !== 1 ? "s" : ""}
                  {s.state === "signups_open" && s.signupClosesAt ? (
                    <>
                      {" "}
                      · closes <LocalTime date={s.signupClosesAt} preset="weekday-datetime" />
                    </>
                  ) : null}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              Newest accounts
            </h2>
            <Link href="/admin/users" className="text-accent-text text-xs hover:underline">
              All players →
            </Link>
          </div>
          <ul className="divide-y rounded-xl border">
            {latestUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {u.username ? (
                    <Link href={`/users/${u.username}`} className="hover:underline">
                      {u.name ?? u.username}
                    </Link>
                  ) : (
                    (u.name ?? "(no username)")
                  )}
                  {!u.emailVerified ? (
                    <span className="text-muted-foreground text-xs"> · unverified</span>
                  ) : null}
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  <LocalTime date={u.createdAt} preset="date-short" />
                </span>
              </li>
            ))}
            {latestUsers.length === 0 ? (
              <li className="text-muted-foreground px-4 py-3 text-sm">No accounts yet.</li>
            ) : null}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
            Latest season signups
          </h2>
          <ul className="divide-y rounded-xl border">
            {latestSignups.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{s.name ?? s.username}</span>
                  <span className="text-muted-foreground"> → </span>
                  <Link href={`/admin/seasons/${s.seasonSlug}/signups`} className="hover:underline">
                    {s.seasonName}
                  </Link>
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  <LocalTime date={s.createdAt} preset="date-short" />
                </span>
              </li>
            ))}
            {latestSignups.length === 0 ? (
              <li className="text-muted-foreground px-4 py-3 text-sm">No season signups yet.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          All seasons
        </h2>
        {allSeasons.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No seasons yet</CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Create your first season to begin the lifecycle.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {allSeasons.map((season) => (
              <Link
                key={season.id}
                href={`/admin/seasons/${season.slug}`}
                className="group bg-card hover:bg-muted/40 rounded-xl border px-5 py-4 transition-colors"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg leading-tight font-semibold group-hover:underline">
                        {season.name}
                      </h3>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {season.slug}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {GAME_LABELS[season.game]} · created{" "}
                      <LocalTime date={season.createdAt} preset="date-short" />
                    </p>
                  </div>
                  <Badge variant={season.state === "draft" ? "secondary" : "default"}>
                    {SEASON_STATE_LABELS[season.state]}
                  </Badge>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
