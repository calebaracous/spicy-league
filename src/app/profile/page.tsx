import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import {
  linkCs2Account,
  linkRiotAccount,
  manualRefreshStats,
  unlinkCs2Account,
  unlinkRiotAccount,
} from "./account-actions";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { signOut } from "@/auth";
import { cookies } from "next/headers";
import { requireOnboarded } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "opgg-host": "The OP.GG link must point to op.gg.",
  "opgg-url": "That doesn't look like a valid URL.",
  "riot-format": 'Enter your Riot ID as "GameName#TAG".',
  "riot-not-found": "That Riot ID wasn't found. Double-check your game name and tag.",
  "steam-required": "Steam ID is required.",
  "steam-format": "Enter a valid Steam64 ID (17-digit number starting with 7656).",
  "leetify-host": "The Leetify link must point to leetify.com.",
  "leetify-url": "That doesn't look like a valid URL.",
  "refresh-rate-limited": "You can only refresh stats once per hour.",
};

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireOnboarded();
  const { saved, error } = await searchParams;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) redirect("/signin");

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
  const lastRefreshed = riotSnapshots[0]?.capturedAt ?? null;

  async function saveProfile(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const bio = (formData.get("bio") ?? "").toString().slice(0, 500) || null;
    const pronouns = (formData.get("pronouns") ?? "").toString().slice(0, 40) || null;
    const opggUrlRaw = (formData.get("opggUrl") ?? "").toString().trim() || null;

    if (opggUrlRaw) {
      try {
        const url = new URL(opggUrlRaw);
        if (!url.hostname.includes("op.gg")) {
          redirect("/profile?error=opgg-host");
        }
      } catch {
        redirect("/profile?error=opgg-url");
      }
    }

    await db
      .update(users)
      .set({ bio, pronouns, opggUrl: opggUrlRaw, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    redirect("/profile?saved=1");
  }

  async function doSignOut() {
    "use server";
    await signOut();
    const cookieStore = await cookies();
    cookieStore.delete("sl.session_token");
    redirect("/");
  }

  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-muted-foreground text-sm">
            Signed in as <span className="font-medium">{user.email}</span>
          </p>
        </div>
        <form action={doSignOut}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </header>
      <Separator />

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

      {/* Public profile */}
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            Everyone in the league can see this. Your display name{" "}
            <span className="font-mono">{user.displayName}</span> is permanent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pronouns">Pronouns</Label>
              <Input
                id="pronouns"
                name="pronouns"
                defaultValue={user.pronouns ?? ""}
                maxLength={40}
                placeholder="they/them"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                defaultValue={user.bio ?? ""}
                maxLength={500}
                rows={4}
                placeholder="A short blurb for your public page."
              />
            </div>
            <div className="flex justify-between">
              <Link
                href={`/u/${user.displayName}`}
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                View public page
              </Link>
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* League of Legends */}
      <Card>
        <CardHeader>
          <CardTitle>League of Legends</CardTitle>
          <CardDescription>
            Link your Riot account to display your rank and champion stats on your profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {riotLink ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{riotLink.externalHandle}</p>
                  {soloSnap?.tier ? (
                    <p className="text-muted-foreground text-xs">
                      {soloSnap.tier} {soloSnap.rankDivision} · {soloSnap.lp} LP · {soloSnap.wins}W{" "}
                      {soloSnap.losses}L
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">Unranked</p>
                  )}
                </div>
                <form action={unlinkRiotAccount}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    Unlink
                  </Button>
                </form>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  {lastRefreshed
                    ? `Last updated ${lastRefreshed.toLocaleString()}`
                    : "Stats not yet loaded"}
                </p>
                <form action={manualRefreshStats}>
                  <Button type="submit" variant="outline" size="sm">
                    Refresh stats
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <form action={linkRiotAccount} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="riotId">Riot ID</Label>
                <Input id="riotId" name="riotId" placeholder="GameName#NA1" required />
                <p className="text-muted-foreground text-xs">
                  Found in the client under your profile icon (top right).
                </p>
              </div>
              <Button type="submit">Link Riot account</Button>
            </form>
          )}

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="opggUrl">
              OP.GG URL <span className="text-muted-foreground">(optional)</span>
            </Label>
            <form action={saveProfile} className="flex gap-2">
              <Input
                id="opggUrl"
                name="opggUrl"
                type="url"
                defaultValue={user.opggUrl ?? ""}
                placeholder="https://op.gg/summoners/na/YourName-NA1"
              />
              {/* hidden fields so saveProfile gets bio/pronouns too */}
              <input type="hidden" name="bio" value={user.bio ?? ""} />
              <input type="hidden" name="pronouns" value={user.pronouns ?? ""} />
              <Button type="submit" variant="outline">
                Save
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>

      {/* Counter-Strike 2 */}
      <Card>
        <CardHeader>
          <CardTitle>Counter-Strike 2</CardTitle>
          <CardDescription>
            Link your Steam account so captains can see your CS2 background.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {steamLink ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <div>
                  <p className="text-muted-foreground text-xs">Steam ID</p>
                  <p className="font-mono text-sm">{steamLink.externalId}</p>
                </div>
                <form action={unlinkCs2Account}>
                  <Button
                    type="submit"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    Unlink
                  </Button>
                </form>
              </div>
              {leetifyLink ? (
                <p className="text-muted-foreground text-xs">
                  Leetify:{" "}
                  <Link
                    href={leetifyLink.externalHandle ?? leetifyLink.externalId}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    {leetifyLink.externalHandle ?? leetifyLink.externalId}
                  </Link>
                </p>
              ) : null}
            </div>
          ) : (
            <form action={linkCs2Account} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="steamId">Steam64 ID</Label>
                <Input
                  id="steamId"
                  name="steamId"
                  placeholder="76561198000000000"
                  pattern="7656\d{13}"
                  required
                />
                <p className="text-muted-foreground text-xs">
                  Find yours at{" "}
                  <Link
                    href="https://steamid.io"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2"
                  >
                    steamid.io
                  </Link>{" "}
                  — use the steamID64 value.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="leetifyUrl">
                  Leetify profile URL <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="leetifyUrl"
                  name="leetifyUrl"
                  type="url"
                  placeholder="https://leetify.com/app/profile/76561198000000000"
                />
              </div>
              <Button type="submit">Link CS2 account</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
