import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  promoteCaptain,
  demoteCaptain,
  moveCaptain,
  pairCaptain,
  removeSignup,
  splitCaptain,
} from "./actions";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { seasonSignups, seasonCaptains } from "@/db/schema/seasons";
import { users } from "@/db/schema/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FlashToast } from "@/components/flash-toast";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS } from "@/lib/seasons";

export const generateMetadata = seasonPageMetadata("Signups · Admin");

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string; error?: string; role?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "not-found": "Signup not found.",
  "already-captain": "This player is already a captain.",
  "sub-captain": "Sub signups can't be captains: they're not in the draft pool.",
  "already-paired": "Both captains must be solo to pair them as duo captains.",
  "captains-locked":
    "Captains can't change once the draft has started: the pick order and each team's pick count depend on them.",
  "remove-too-late":
    "Players can only be removed before the draft starts. Once teams exist, removing someone would break rosters and the schedule.",
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
      kind: seasonSignups.kind,
      notes: seasonSignups.notes,
      quandary: seasonSignups.quandary,
      createdAt: seasonSignups.createdAt,
      username: users.username,
      discordUsername: users.discordUsername,
      name: users.name,
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
      username: users.username,
      name: users.name,
    })
    .from(seasonCaptains)
    .innerJoin(users, eq(seasonCaptains.userId, users.id))
    .where(eq(seasonCaptains.seasonId, season.id))
    .orderBy(asc(seasonCaptains.captainOrder), asc(seasonCaptains.createdAt));

  // Captains sharing a captainOrder are duo captains of one team.
  const captainTeams = [...new Set(captainRows.map((c) => c.captainOrder))].map((order) => ({
    order,
    captains: captainRows.filter((c) => c.captainOrder === order),
  }));
  const soloCaptains = captainTeams
    .filter((t) => t.captains.length === 1)
    .map((t) => t.captains[0]);
  const captainUserIds = new Set(captainRows.map((c) => c.userId));
  // Teams of 5 — the recommendation counts teams, so a duo counts once.
  const total = allSignups.length;
  const draftPoolSize = allSignups.filter((s) => s.kind === "player").length;
  const recommended = Math.floor(draftPoolSize / 5);
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
  const removeWithSlug = removeSignup.bind(null, slug);
  const canRemove = ["signups_open", "signups_closed", "captains_selected"].includes(season.state);
  const demoteWithSlug = demoteCaptain.bind(null, slug);
  const moveWithSlug = moveCaptain.bind(null, slug);
  const pairWithSlug = pairCaptain.bind(null, slug);
  const splitWithSlug = splitCaptain.bind(null, slug);

  const lolRoles = ["top", "jungle", "mid", "adc", "support", "fill"];

  return (
    <div className="page flex-1 space-y-6 [--page-max:64rem]">
      <header className="space-y-1">
        <Link
          href={`/admin/seasons/${slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to {season.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-heading">Signups</h1>
          <a
            href={`/admin/seasons/${slug}/signups/export`}
            className="text-muted-foreground hover:text-foreground text-sm underline underline-offset-2"
          >
            Export CSV
          </a>
        </div>
        <p className="text-muted-foreground text-sm">
          {season.name} · {GAME_LABELS[season.game]} · {total} signup{total !== 1 ? "s" : ""}
        </p>
      </header>

      {saved ? (
        <FlashToast
          message={
            saved === "removed"
              ? "Player removed from the season."
              : saved === "paired"
                ? "Duo captains paired."
                : "Saved."
          }
        />
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
            {captainTeams.length} team{captainTeams.length !== 1 ? "s" : ""} · {recommended}{" "}
            recommended (floor({draftPoolSize} / 5)). Pair two captains to make them duo captains of
            one team: either can draft, and the team picks 3 players instead of 4.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {captainTeams.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No captains yet. Promote players from the roster below.
            </p>
          ) : (
            <div className="space-y-2">
              {captainTeams.map((team, i) => {
                const isDuo = team.captains.length > 1;
                const solo = isDuo ? null : team.captains[0];
                const partners = solo ? soloCaptains.filter((c) => c.id !== solo.id) : [];
                return (
                  <div
                    key={team.order}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="text-muted-foreground w-5 pt-1 text-right font-mono text-sm">
                        {team.order}.
                      </span>
                      <ul className="space-y-1">
                        {team.captains.map((c) => (
                          <li key={c.id} className="flex flex-wrap items-center gap-1">
                            <span className="text-sm font-medium">{c.name ?? c.username}</span>
                            {isDuo ? (
                              <form action={splitWithSlug.bind(null, c.id)}>
                                <Button type="submit" variant="ghost" size="sm">
                                  Split
                                </Button>
                              </form>
                            ) : null}
                            <form action={demoteWithSlug.bind(null, c.id)}>
                              <Button
                                type="submit"
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive"
                              >
                                Remove
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                      {isDuo ? <Badge variant="outline">Duo</Badge> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {solo && partners.length > 0 ? (
                        <form
                          action={pairWithSlug.bind(null, solo.id)}
                          className="flex items-center gap-1"
                        >
                          <select
                            name="partnerId"
                            required
                            defaultValue=""
                            aria-label={`Duo partner for ${solo.name ?? solo.username}`}
                            className="border-input h-7 rounded-md border bg-transparent px-1.5 text-xs"
                          >
                            <option value="" disabled>
                              Pair with…
                            </option>
                            {partners.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name ?? p.username}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" variant="outline" size="sm">
                            Pair
                          </Button>
                        </form>
                      ) : null}
                      <form action={moveWithSlug.bind(null, team.order, "up")}>
                        <Button type="submit" variant="ghost" size="sm" disabled={i === 0}>
                          ↑
                        </Button>
                      </form>
                      <form action={moveWithSlug.bind(null, team.order, "down")}>
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          disabled={i === captainTeams.length - 1}
                        >
                          ↓
                        </Button>
                      </form>
                    </div>
                  </div>
                );
              })}
              <div className="pt-2">
                <Link
                  href={`/admin/seasons/${slug}/draft`}
                  className="text-accent-text text-xs underline-offset-4 hover:underline"
                >
                  → Manage draft
                </Link>
              </div>
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
                    <th className="pr-4 pb-2 font-medium">Player</th>
                    <th className="pr-4 pb-2 font-medium">
                      {season.game === "lol" ? "Roles" : "Maps"}
                    </th>
                    <th className="pr-4 pb-2 font-medium">Notes</th>
                    <th className="pr-4 pb-2 font-medium">Quandary</th>
                    <th className="pr-4 pb-2 font-medium">Signed up</th>
                    <th className="pb-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSignups.map((s) => {
                    const isCaptain = captainUserIds.has(s.userId);
                    const isSub = s.kind === "sub";
                    return (
                      <tr key={s.id} className="hover:bg-muted/50">
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{s.name ?? s.username}</span>
                            {isCaptain ? (
                              <Badge variant="secondary" className="text-xs">
                                Captain
                              </Badge>
                            ) : null}
                            {isSub ? (
                              <Badge variant="outline" className="text-xs">
                                Sub
                              </Badge>
                            ) : null}
                          </div>
                          <div className="text-muted-foreground text-xs">{s.email}</div>
                          <div className="text-muted-foreground text-xs">
                            {s.discordUsername ? `Discord: ${s.discordUsername}` : "No Discord"}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-sm">
                          {formatPrefs(season.game, s.rolePrefs)}
                        </td>
                        <td className="text-muted-foreground max-w-xs py-2 pr-4 text-xs">
                          {s.notes ?? "—"}
                        </td>
                        <td className="text-muted-foreground max-w-xs py-2 pr-4 text-xs">
                          {s.quandary ?? "—"}
                        </td>
                        <td className="text-muted-foreground py-2 pr-4 text-xs whitespace-nowrap">
                          <LocalTime date={s.createdAt} preset="date-short" />
                        </td>
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-1">
                            {!isCaptain && !isSub ? (
                              <form action={promoteWithSlug.bind(null, s.id)}>
                                <Button type="submit" variant="outline" size="sm">
                                  Make captain
                                </Button>
                              </form>
                            ) : null}
                            {canRemove || isSub ? (
                              <form action={removeWithSlug.bind(null, s.id)}>
                                <ConfirmSubmitButton
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  confirmMessage={`Remove ${s.name ?? s.username} from ${season.name}?${isCaptain ? " They'll also lose their captain spot." : ""}`}
                                >
                                  Remove
                                </ConfirmSubmitButton>
                              </form>
                            ) : null}
                          </div>
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
    </div>
  );
}
