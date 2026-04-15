import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { promoteCaptain, demoteCaptain } from "./actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups, seasonCaptains } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { GAME_LABELS } from "@/lib/seasons";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string; error?: string; role?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Signup not found.",
  "already-captain": "This player is already a captain.",
};

const LOL_ROLE_LABELS: Record<string, string> = {
  top: "Top",
  jungle: "Jungle",
  mid: "Mid",
  adc: "ADC",
  support: "Support",
  fill: "Fill",
};

type LolPrefs = { primaryRole: string; secondaryRole: string };
type Cs2Prefs = { mapPrefs: string[] };

function formatPrefs(game: string, prefs: unknown): string {
  if (!prefs) return "—";
  if (game === "lol") {
    const p = prefs as LolPrefs;
    return `${LOL_ROLE_LABELS[p.primaryRole] ?? p.primaryRole} / ${LOL_ROLE_LABELS[p.secondaryRole] ?? p.secondaryRole}`;
  }
  const p = prefs as Cs2Prefs;
  return p.mapPrefs?.join(", ") ?? "—";
}

export const dynamic = "force-dynamic";

export default async function AdminSignupsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { saved, error, role: roleFilter } = await searchParams;

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) notFound();

  const allSignups = await db
    .select({
      id: seasonSignups.id,
      userId: seasonSignups.userId,
      rolePrefs: seasonSignups.rolePrefs,
      notes: seasonSignups.notes,
      createdAt: seasonSignups.createdAt,
      displayName: users.displayName,
      email: users.email,
    })
    .from(seasonSignups)
    .innerJoin(users, eq(seasonSignups.userId, users.id))
    .where(eq(seasonSignups.seasonId, season.id))
    .orderBy(asc(seasonSignups.createdAt));

  const captainRows = await db
    .select({
      id: seasonCaptains.id,
      userId: seasonCaptains.userId,
      captainOrder: seasonCaptains.captainOrder,
      displayName: users.displayName,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder));

  const captainUserIds = new Set(captainRows.map((c) => c.userId));
  const total = allSignups.length;
  const recommended = Math.floor(total / 5);
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  // Filter signups by role (LoL only)
  const filteredSignups =
    season.game === "lol" && roleFilter
      ? allSignups.filter((s) => {
          const p = s.rolePrefs as LolPrefs | null;
          return p?.primaryRole === roleFilter || p?.secondaryRole === roleFilter;
        })
      : allSignups;

  const promoteWithSlug = promoteCaptain.bind(null, slug);
  const demoteWithSlug = demoteCaptain.bind(null, slug);

  const lolRoles = ["top", "jungle", "mid", "adc", "support", "fill"];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-1">
        <Link href={`/admin/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to {season.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Signups</h1>
          <a
            href={`/admin/seasons/${slug}/signups/export`}
            className="text-muted-foreground text-sm underline underline-offset-2 hover:text-foreground"
          >
            Export CSV
          </a>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {GAME_LABELS[season.game]} · {total} signup{total !== 1 ? "s" : ""}
        </p>
      </header>

      {saved ? (
        <Alert>
          <AlertDescription>Saved.</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Captains panel */}
      <Card>
        <CardHeader>
          <CardTitle>Captains</CardTitle>
          <CardDescription>
            {captainRows.length} selected · {recommended} recommended (floor({total} / 5))
          </CardDescription>
        </CardHeader>
        <CardContent>
          {captainRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No captains yet. Promote players from the roster below.</p>
          ) : (
            <div className="space-y-2">
              {captainRows.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-5 text-right text-sm font-mono">
                      {c.captainOrder}.
                    </span>
                    <span className="text-sm font-medium">{c.displayName}</span>
                  </div>
                  <form action={demoteWithSlug.bind(null, c.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                      Remove
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Roster */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Roster</CardTitle>
              <CardDescription className="mt-1">
                {filteredSignups.length} player{filteredSignups.length !== 1 ? "s" : ""}
                {roleFilter ? ` · filtered by ${LOL_ROLE_LABELS[roleFilter] ?? roleFilter}` : ""}
              </CardDescription>
            </div>
            {season.game === "lol" ? (
              <div className="flex flex-wrap gap-1">
                <Link
                  href={`/admin/seasons/${slug}/signups`}
                  className={`rounded px-2 py-1 text-xs ${!roleFilter ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                >
                  All
                </Link>
                {lolRoles.map((r) => (
                  <Link
                    key={r}
                    href={`/admin/seasons/${slug}/signups?role=${r}`}
                    className={`rounded px-2 py-1 text-xs ${roleFilter === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}
                  >
                    {LOL_ROLE_LABELS[r]}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {filteredSignups.length === 0 ? (
            <p className="text-muted-foreground text-sm">No signups yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 pr-4 font-medium">Player</th>
                    <th className="pb-2 pr-4 font-medium">
                      {season.game === "lol" ? "Roles" : "Maps"}
                    </th>
                    <th className="pb-2 pr-4 font-medium">Notes</th>
                    <th className="pb-2 pr-4 font-medium">Signed up</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSignups.map((s) => {
                    const isCaptain = captainUserIds.has(s.userId);
                    return (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.displayName}</span>
                            {isCaptain ? <Badge variant="secondary" className="text-xs">Captain</Badge> : null}
                          </div>
                          <div className="text-muted-foreground text-xs">{s.email}</div>
                        </td>
                        <td className="py-2 pr-4 text-sm">
                          {formatPrefs(season.game, s.rolePrefs)}
                        </td>
                        <td className="py-2 pr-4 max-w-xs text-xs text-muted-foreground">
                          {s.notes ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                          {s.createdAt.toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          {!isCaptain ? (
                            <form action={promoteWithSlug.bind(null, s.id)}>
                              <Button type="submit" variant="outline" size="sm">
                                Make captain
                              </Button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
