import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ADMIN_ERROR_MESSAGES, AdminAccountTools } from "./_components/admin-account-tools";
import { DeleteAccountForm } from "./_components/delete-account-form";
import { MatchHistory } from "./_components/match-history";
import { StatsTabs } from "./_components/stats-tabs";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { auth } from "@/auth";
import { deleteOwnAccount } from "@/app/profile/account-actions";
import { deletionBlocker } from "@/lib/account-deletion";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { formatRank } from "@/lib/rank";
import { opggUrlForRiotId } from "@/lib/opgg";
import { getChampionName } from "@/lib/riot-api";
import { getPlayerMatchHistory } from "@/lib/substitutions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FlashToast } from "@/components/flash-toast";
import { LocalTime } from "@/components/ui/local-time";
import { Separator } from "@/components/ui/separator";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
};

export async function generateMetadata({ params }: Pick<Props, "params">) {
  const { username } = await params;
  return { title: username };
}

function winRate(wins: number | null, losses: number | null): string {
  if (wins === null || losses === null) return "—";
  const total = wins + losses;
  if (total === 0) return "—";
  return `${Math.round((wins / total) * 100)}%`;
}

type ChampEntry = { championId: number; championPoints: number };

export default async function PublicProfilePage({ params, searchParams }: Props) {
  const [{ username }, { saved, error }] = await Promise.all([params, searchParams]);
  const normalized = username.toLowerCase();

  const user = await db.query.users.findFirst({
    where: eq(users.username, normalized),
  });
  if (!user || !user.username) notFound();

  const [riotLinks, steamLink, leetifyLink, riotSnapshots] = await Promise.all([
    db.query.accountLinks.findMany({
      where: and(eq(accountLinks.userId, user.id), eq(accountLinks.provider, "riot")),
      orderBy: (t, { asc }) => [asc(t.linkedAt)],
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

  // Resolve top-champion names per Riot link (using the most recent solo snap).
  const linkAccountData = await Promise.all(
    riotLinks.map(async (link) => {
      const snaps = riotSnapshots.filter((s) => s.accountLinkId === link.id);
      const solo = snaps.find((s) => s.queue === "solo");
      const flex = snaps.find((s) => s.queue === "flex");
      const topChamps = (solo?.topChamps as ChampEntry[] | null) ?? null;
      const champNames = topChamps
        ? await Promise.all(topChamps.map((c) => getChampionName(c.championId)))
        : [];
      const lastRefreshed = snaps[0]?.capturedAt ?? null;
      return { link, solo, flex, champNames, lastRefreshed };
    }),
  );

  const [history, viewer] = await Promise.all([getPlayerMatchHistory(user.id), auth()]);
  // Discord is for contacting players, so only signed-in visitors see it.
  const discordUsername = viewer?.user ? user.discordUsername : null;
  const isAdmin = viewer?.user.role === "admin";
  const isOwner = viewer?.user.id === user.id;
  // Only the owner and admins see the delete controls, so only they pay for the check.
  const blocker = isOwner || isAdmin ? await deletionBlocker(user.id) : null;
  const errorMessage = isAdmin && error ? (ADMIN_ERROR_MESSAGES[error] ?? null) : null;
  const hasLolData = riotLinks.length > 0 || !!user.opggUrl;
  const derivedOpgg = new Set(riotLinks.map((l) => opggUrlForRiotId(l.externalHandle)));
  const hasCs2Data = !!steamLink;
  const hasAnyStats = hasLolData || hasCs2Data;

  const displayName = user.name || user.username;

  const lolPanel = (
    <div className="space-y-5">
      {linkAccountData.map(({ link, solo, flex, champNames, lastRefreshed }) => (
        <div key={link.id} className="space-y-3">
          <OpggHandle handle={link.externalHandle} />
          {solo ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground text-xs">Solo/Duo</p>
                <p className="mt-0.5 text-sm font-medium">
                  {formatRank(solo.tier, solo.rankDivision, solo.lp)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {winRate(solo.wins, solo.losses)} win rate
                  {solo.wins !== null ? ` (${solo.wins}W ${solo.losses}L)` : ""}
                </p>
              </div>
              {flex?.tier ? (
                <div className="rounded-lg border p-3">
                  <p className="text-muted-foreground text-xs">Flex</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {formatRank(flex.tier, flex.rankDivision, flex.lp)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {winRate(flex.wins, flex.losses)} win rate
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
              Updated <LocalTime date={lastRefreshed} preset="date-short" />
            </p>
          ) : null}
        </div>
      ))}
      {user.opggUrl && !derivedOpgg.has(user.opggUrl) ? (
        <Link
          href={user.opggUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Full stats on OP.GG →
        </Link>
      ) : null}
      {!hasLolData ? (
        <p className="text-muted-foreground text-sm">No League of Legends accounts linked.</p>
      ) : null}
    </div>
  );

  const cs2Panel = (
    <div className="space-y-2">
      {steamLink ? (
        <p className="text-muted-foreground text-xs">
          Steam ID:{" "}
          <Link
            href={`https://steamcommunity.com/profiles/${steamLink.externalId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            {steamLink.externalId}
          </Link>
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">No Counter-Strike 2 account linked.</p>
      )}
      {leetifyLink ? (
        <Link
          href={leetifyLink.externalHandle ?? leetifyLink.externalId}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text text-sm font-medium underline-offset-4 hover:underline"
        >
          Full stats on Leetify →
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="page flex-1 space-y-6 [--page-max:42rem]">
      <header className="space-y-0.5">
        <h1 className="text-heading">{displayName}</h1>
        <p className="text-muted-foreground text-sm">@{user.username}</p>
        {user.pronouns ? <p className="text-muted-foreground text-sm">{user.pronouns}</p> : null}
        {discordUsername ? (
          <p className="text-muted-foreground text-sm">Discord: {discordUsername}</p>
        ) : null}
      </header>
      <Separator />
      {isAdmin && saved ? <FlashToast message="Saved." /> : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      {user.bio ? <p className="text-base leading-relaxed">{user.bio}</p> : null}

      {hasAnyStats ? (
        <Card>
          <CardContent className="pt-6">
            <StatsTabs
              defaultTab={hasLolData ? "lol" : "cs2"}
              tabs={[
                { id: "lol", label: "League of Legends", content: lolPanel, disabled: !hasLolData },
                { id: "cs2", label: "Counter-Strike 2", content: cs2Panel, disabled: !hasCs2Data },
              ]}
            />
          </CardContent>
        </Card>
      ) : null}

      <MatchHistory matches={history} />

      {isOwner ? (
        <Card id="delete-account" className="border-destructive/40 scroll-mt-24">
          <CardHeader>
            <CardTitle>Delete account</CardTitle>
            <CardDescription>
              Removes your profile, sign-in, Discord and Riot details, and any signups for seasons
              that haven&apos;t started. If you&apos;ve played in past seasons or 10-mans, those
              rosters and results stay, shown as &ldquo;Deleted player&rdquo;. This can&apos;t be
              undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {blocker ? (
              <p className="text-muted-foreground text-sm">{blocker}</p>
            ) : (
              <DeleteAccountForm username={user.username} deleteAction={deleteOwnAccount} />
            )}
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <AdminAccountTools
          user={{ ...user, username: user.username }}
          riotLinks={riotLinks}
          lastRefreshed={riotSnapshots[0]?.capturedAt ?? null}
          deletionBlocker={isOwner ? null : blocker}
          isSelf={isOwner}
        />
      ) : null}
    </div>
  );
}

function OpggHandle({ handle }: { handle: string | null }) {
  const href = opggUrlForRiotId(handle);
  return (
    <p className="flex items-baseline gap-2 text-sm font-medium">
      {handle}
      {href ? (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-text text-xs underline-offset-4 hover:underline"
        >
          OP.GG →
        </Link>
      ) : null}
    </p>
  );
}
