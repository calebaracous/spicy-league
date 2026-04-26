import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { getChampionName } from "@/lib/riot-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `${username} — Spicy League` };
}

function formatRank(tier: string | null, division: string | null, lp: number | null): string {
  if (!tier) return "Unranked";
  const apex = ["MASTER", "GRANDMASTER", "CHALLENGER"];
  if (apex.includes(tier)) return `${capitalize(tier)} · ${lp ?? 0} LP`;
  return `${capitalize(tier)} ${division ?? ""} · ${lp ?? 0} LP`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function winRate(wins: number | null, losses: number | null): string {
  if (wins === null || losses === null) return "—";
  const total = wins + losses;
  if (total === 0) return "—";
  return `${Math.round((wins / total) * 100)}%`;
}

export default async function PublicProfilePage({ params }: Props) {
  const { username } = await params;
  const normalized = username.toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.username, normalized),
  });
  if (!user || !user.username) notFound();

  const [riotLink, steamLink, leetifyLink, riotSnapshots] = await Promise.all([
    db.query.accountLinks.findFirst({
      where: and(eq(accountLinks.userId, user.id), eq(accountLinks.provider, "riot")),
    }),
    db.query.accountLinks.findFirst({
      where: and(eq(accountLinks.userId, user.id), eq(accountLinks.provider, "steam")),
    }),
    db.query.accountLinks.findFirst({
      where: and(eq(accountLinks.userId, user.id), eq(accountLinks.provider, "leetify")),
    }),
    db.query.riotStatSnapshots.findMany({
      where: eq(riotStatSnapshots.userId, user.id),
      orderBy: (t, { desc }) => [desc(t.capturedAt)],
    }),
  ]);

  const soloSnap = riotSnapshots.find((s) => s.queue === "solo");
  const flexSnap = riotSnapshots.find((s) => s.queue === "flex");
  const lastRefreshed = riotSnapshots[0]?.capturedAt ?? null;

  type ChampEntry = { championId: number; championPoints: number };
  const topChamps = soloSnap?.topChamps as ChampEntry[] | null;
  const champNames = topChamps
    ? await Promise.all(topChamps.map((c) => getChampionName(c.championId)))
    : [];

  const hasLolData = riotLink || user.opggUrl;
  const hasCs2Data = steamLink;

  const displayName = user.name || user.username;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-0.5">
        <h1 className="font-mono text-4xl font-bold tracking-tight">{displayName}</h1>
        <p className="text-muted-foreground text-sm">@{user.username}</p>
        {user.pronouns ? <p className="text-muted-foreground text-sm">{user.pronouns}</p> : null}
      </header>
      <Separator />
      {user.bio ? <p className="text-base leading-relaxed">{user.bio}</p> : null}

      {hasLolData ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">League of Legends</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {riotLink ? (
              <>
                <p className="text-sm font-medium">{riotLink.externalHandle}</p>
                {soloSnap ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg border p-3">
                      <p className="text-muted-foreground text-xs">Solo/Duo</p>
                      <p className="mt-0.5 text-sm font-medium">
                        {formatRank(soloSnap.tier, soloSnap.rankDivision, soloSnap.lp)}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {winRate(soloSnap.wins, soloSnap.losses)} win rate
                        {soloSnap.wins !== null ? ` (${soloSnap.wins}W ${soloSnap.losses}L)` : ""}
                      </p>
                    </div>
                    {flexSnap?.tier ? (
                      <div className="rounded-lg border p-3">
                        <p className="text-muted-foreground text-xs">Flex</p>
                        <p className="mt-0.5 text-sm font-medium">
                          {formatRank(flexSnap.tier, flexSnap.rankDivision, flexSnap.lp)}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {winRate(flexSnap.wins, flexSnap.losses)} win rate
                        </p>
                      </div>
                    ) : null}
                    {champNames.length > 0 ? (
                      <div className="rounded-lg border p-3">
                        <p className="text-muted-foreground text-xs">Top champions</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {champNames.map((name, i) => (
                            <li key={i} className="text-sm">
                              {name}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">Unranked</p>
                )}
                {lastRefreshed ? (
                  <p className="text-muted-foreground text-xs">
                    Updated {lastRefreshed.toLocaleDateString()}
                  </p>
                ) : null}
              </>
            ) : null}
            {user.opggUrl ? (
              <Link
                href={user.opggUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm font-medium underline-offset-4 hover:underline"
              >
                Full stats on OP.GG →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {hasCs2Data ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Counter-Strike 2</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-muted-foreground text-xs">
              Steam ID:{" "}
              <Link
                href={`https://steamcommunity.com/profiles/${steamLink!.externalId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                {steamLink!.externalId}
              </Link>
            </p>
            {leetifyLink ? (
              <Link
                href={leetifyLink.externalHandle ?? leetifyLink.externalId}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary text-sm font-medium underline-offset-4 hover:underline"
              >
                Full stats on Leetify →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
