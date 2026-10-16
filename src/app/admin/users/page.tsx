import { and, desc, eq, ilike, inArray, isNotNull, or, type SQL } from "drizzle-orm";
import Link from "next/link";

import { banUserAction, unbanUserAction } from "./actions";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { accountLinks } from "@/db/schema/stats";
import { FlashToast } from "@/components/flash-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { isBanActive } from "@/lib/bans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Players · Admin" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string; filter?: string; saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "That request was missing something. Try again.",
  "not-found": "That player no longer exists.",
  "cannot-ban-admin": "Admins can't be banned. Remove their admin role first.",
};

const FILTERS = [
  { id: "all", label: "All" },
  { id: "banned", label: "Banned" },
  { id: "unverified", label: "Unverified email" },
  { id: "admins", label: "Admins" },
] as const;

const selectClass =
  "border-input h-8 rounded-lg border bg-transparent px-2 text-sm outline-none focus-visible:ring-3";

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const { q = "", filter = "all", saved, error } = await searchParams;
  const query = q.trim();

  const conditions: SQL[] = [];
  if (query) {
    const like = `%${query}%`;
    conditions.push(
      or(ilike(users.username, like), ilike(users.email, like), ilike(users.name, like))!,
    );
  }
  if (filter === "banned") conditions.push(isNotNull(users.bannedAt));
  if (filter === "unverified") conditions.push(eq(users.emailVerified, false));
  if (filter === "admins") conditions.push(eq(users.role, "admin"));

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      createdAt: users.createdAt,
      bannedAt: users.bannedAt,
      banReason: users.banReason,
      banExpiresAt: users.banExpiresAt,
    })
    .from(users)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100);

  const riotLinked = rows.length
    ? new Set(
        (
          await db
            .select({ userId: accountLinks.userId })
            .from(accountLinks)
            .where(
              and(
                eq(accountLinks.provider, "riot"),
                inArray(
                  accountLinks.userId,
                  rows.map((r) => r.id),
                ),
              ),
            )
        ).map((r) => r.userId),
      )
    : new Set<string>();

  const back = `/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), filter }).toString()}`;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <div className="page flex-1 space-y-6 [--page-max:64rem]">
      <header className="space-y-2">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Admin
        </Link>
        <h1 className="text-heading">Players</h1>
        <p className="text-muted-foreground text-sm">
          Search accounts, check verification and linked Riot accounts, and ban or unban players.
        </p>
      </header>

      {saved ? (
        <FlashToast message={saved === "banned" ? "Player banned." : "Ban lifted."} />
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <form className="flex flex-wrap items-center gap-2" role="search">
        <Input
          name="q"
          defaultValue={query}
          placeholder="Search username, name or email"
          aria-label="Search players"
          className="max-w-xs"
        />
        <input type="hidden" name="filter" value={filter} />
        <button type="submit" className="rounded-lg border px-3 py-1.5 text-sm">
          Search
        </button>
        <nav aria-label="Filter players" className="flex flex-wrap gap-1 sm:ml-auto">
          {FILTERS.map((f) => (
            <Link
              key={f.id}
              href={`/admin/users?${new URLSearchParams({ ...(query ? { q: query } : {}), filter: f.id }).toString()}`}
              aria-current={filter === f.id ? "page" : undefined}
              className={cn(
                "rounded-md px-2 py-1 text-xs",
                filter === f.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </form>

      <p className="text-muted-foreground text-xs">
        {rows.length === 100 ? "Showing the newest 100 matches." : `${rows.length} player(s).`}
      </p>

      <ul className="divide-y rounded-xl border">
        {rows.map((u) => {
          const banned = isBanActive(u);
          return (
            <li key={u.id} className="space-y-3 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {u.username ? (
                      <Link
                        href={`/users/${u.username}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {u.name ?? u.username}
                      </Link>
                    ) : (
                      <span className="font-medium">{u.name ?? "(no username)"}</span>
                    )}
                    {u.username ? (
                      <span className="text-muted-foreground font-mono text-xs">@{u.username}</span>
                    ) : null}
                    {u.role === "admin" ? <Badge variant="outline">Admin</Badge> : null}
                    {banned ? <Badge variant="destructive">Banned</Badge> : null}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {u.email} · joined <LocalTime date={u.createdAt} preset="date-short" /> ·{" "}
                    {u.emailVerified ? "verified" : "email not verified"} ·{" "}
                    {riotLinked.has(u.id) ? "Riot linked" : "no Riot account"}
                  </p>
                  {banned ? (
                    <p className="text-destructive text-xs">
                      {u.banExpiresAt ? (
                        <>
                          Until <LocalTime date={u.banExpiresAt} />
                        </>
                      ) : (
                        "Permanent"
                      )}
                      {u.banReason ? ` · ${u.banReason}` : ""}
                    </p>
                  ) : null}
                </div>

                {banned ? (
                  <form action={unbanUserAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="back" value={back} />
                    <ConfirmSubmitButton
                      size="sm"
                      variant="outline"
                      confirmMessage={`Lift the ban on ${u.username ?? u.email}?`}
                    >
                      Unban
                    </ConfirmSubmitButton>
                  </form>
                ) : u.role === "admin" ? null : (
                  <details className="group">
                    <summary className="text-destructive cursor-pointer list-none text-sm select-none hover:underline">
                      Ban…
                    </summary>
                    <form
                      action={banUserAction}
                      className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border p-3"
                    >
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="back" value={back} />
                      <label className="flex flex-col gap-1 text-xs">
                        Reason (shown to them)
                        <Input name="reason" maxLength={300} placeholder="Optional" />
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        Length
                        <select name="duration" defaultValue="7" className={selectClass}>
                          <option value="1">1 day</option>
                          <option value="7">7 days</option>
                          <option value="30">30 days</option>
                          <option value="permanent">Permanent</option>
                        </select>
                      </label>
                      <ConfirmSubmitButton
                        size="sm"
                        variant="destructive"
                        confirmMessage={`Ban ${u.username ?? u.email}? They'll be signed out and blocked from signing in and joining seasons or 10-mans.`}
                      >
                        Ban player
                      </ConfirmSubmitButton>
                    </form>
                  </details>
                )}
              </div>
            </li>
          );
        })}
        {rows.length === 0 ? (
          <li className="text-muted-foreground px-4 py-6 text-center text-sm">No players match.</li>
        ) : null}
      </ul>
    </div>
  );
}
