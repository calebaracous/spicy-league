import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";

import { manualRefreshStats, unlinkCs2Account, unlinkRiotAccount } from "./account-actions";
import { Cs2LinkForm, RiotLinkForm } from "./_components/link-forms";
import { MAX_RIOT_ACCOUNTS } from "./constants";
import { db } from "@/db/client";
import { users } from "@/db/schema/auth";
import { accountLinks, riotStatSnapshots } from "@/db/schema/stats";
import { signOut } from "@/auth";
import { cookies } from "next/headers";
import { requireOnboarded } from "@/lib/auth-helpers";
import { DISCORD_USERNAME_HELP, normalizeDiscordUsername } from "@/lib/discord";
import { opggUrlForRiotId } from "@/lib/opgg";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FlashToast } from "@/components/flash-toast";
import { cn } from "@/lib/utils";

export const metadata = { title: "Your profile" };

type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "opgg-host": "The OP.GG link must point to op.gg.",
  "opgg-url": "Enter a valid URL.",
  "refresh-rate-limited": "You can only refresh stats once per hour.",
  "name-required": "Display name cannot be empty.",
  "name-too-long": "Display name must be 50 characters or fewer.",
  "discord-invalid": `That isn't a valid Discord username. ${DISCORD_USERNAME_HELP}.`,
  "discord-taken": "That Discord username is already on another account.",
};

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireOnboarded();
  const { saved, error } = await searchParams;

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });
  if (!user) redirect("/signin");

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

  const lastRefreshed = riotSnapshots[0]?.capturedAt ?? null;
  const canAddRiot = riotLinks.length < MAX_RIOT_ACCOUNTS;

  async function saveProfile(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const nameRaw = (formData.get("name") ?? "").toString().trim();
    const bio = (formData.get("bio") ?? "").toString().slice(0, 500) || null;
    const pronouns = (formData.get("pronouns") ?? "").toString().slice(0, 40) || null;

    if (!nameRaw) redirect("/profile?error=name-required");
    if (nameRaw.length > 50) redirect("/profile?error=name-too-long");

    await db
      .update(users)
      .set({ name: nameRaw, bio, pronouns, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    redirect("/profile?saved=1");
  }

  // Separate from saveProfile so each form only writes its own fields.
  async function saveOpggUrl(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const opggUrlRaw = (formData.get("opggUrl") ?? "").toString().trim() || null;

    if (opggUrlRaw) {
      // redirect() throws, so validate outside the try or the catch eats it.
      let url: URL | null = null;
      try {
        url = new URL(opggUrlRaw);
      } catch {
        url = null;
      }
      if (!url || !/^https?:$/.test(url.protocol)) redirect("/profile?error=opgg-url");
      const host = url.hostname.toLowerCase();
      if (host !== "op.gg" && !host.endsWith(".op.gg")) redirect("/profile?error=opgg-host");
    }

    await db
      .update(users)
      .set({ opggUrl: opggUrlRaw, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));

    redirect("/profile?saved=1");
  }

  // Own form, like saveOpggUrl. Required for season signups, so it can be
  // changed but not cleared.
  async function saveDiscordUsername(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const discordUsername = normalizeDiscordUsername(formData.get("discordUsername")?.toString());
    if (!discordUsername) redirect("/profile?error=discord-invalid");

    const taken = await db.query.users.findFirst({
      where: and(eq(users.discordUsername, discordUsername), ne(users.id, session.user.id)),
      columns: { id: true },
    });
    if (taken) redirect("/profile?error=discord-taken");

    // A different username may be a different Discord account: forget the
    // resolved ID so the next role sync searches again.
    const current = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { discordUsername: true },
    });
    await db
      .update(users)
      .set({
        discordUsername,
        ...(current?.discordUsername !== discordUsername ? { discordUserId: null } : {}),
        updatedAt: new Date(),
      })
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
    <div className="page flex-1 space-y-6 [--page-max:42rem]">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-heading">Profile</h1>
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

      {saved ? <FlashToast message="Saved." /> : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {/* Discord: required for season signups, so it sits first and nags when missing */}
      <Card style={user.discordUsername ? undefined : { borderColor: "var(--accent)" }}>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>
            {user.discordUsername
              ? "Admins and captains use this to reach you. Shown to signed-in players on your public page."
              : "Add your Discord username. You need it to sign up for a season, and admins and captains use it to reach you."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveDiscordUsername} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="discordUsername">Discord username</Label>
              <Input
                id="discordUsername"
                name="discordUsername"
                defaultValue={user.discordUsername ?? ""}
                maxLength={33}
                placeholder="spicy_boy"
                autoComplete="off"
                required
              />
              <p className="text-muted-foreground text-xs">{DISCORD_USERNAME_HELP}.</p>
            </div>
            <div className="flex justify-end">
              <Button type="submit">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Public profile */}
      <Card>
        <CardHeader>
          <CardTitle>Public profile</CardTitle>
          <CardDescription>
            Your username <span className="font-mono">@{user.username}</span> is permanent and used
            in your public URL. Your display name is shown to teammates and can be changed anytime.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                name="name"
                defaultValue={user.name ?? user.username ?? ""}
                maxLength={50}
                placeholder="Your name"
                required
              />
            </div>
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
                href={`/users/${user.username}`}
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
            Link up to {MAX_RIOT_ACCOUNTS} Riot accounts to display rank, champion stats and OP.GG
            on your profile. Required to sign up for League of Legends seasons.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {riotLinks.length > 0 ? (
            <div className="space-y-3">
              {riotLinks.map((link) => {
                const linkSnaps = riotSnapshots.filter((s) => s.accountLinkId === link.id);
                const solo = linkSnaps.find((s) => s.queue === "solo");
                const opgg = opggUrlForRiotId(link.externalHandle);
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div>
                      <p className="flex items-baseline gap-2 text-sm font-medium">
                        {link.externalHandle}
                        {opgg ? (
                          <Link
                            href={opgg}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent-text text-xs underline-offset-4 hover:underline"
                          >
                            OP.GG →
                          </Link>
                        ) : null}
                      </p>
                      {solo?.tier ? (
                        <p className="text-muted-foreground text-xs">
                          {solo.tier} {solo.rankDivision} · {solo.lp} LP · {solo.wins}W{" "}
                          {solo.losses}L
                        </p>
                      ) : (
                        <p className="text-muted-foreground text-xs">Unranked</p>
                      )}
                    </div>
                    <form action={unlinkRiotAccount}>
                      <input type="hidden" name="linkId" value={link.id} />
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
                );
              })}
              <div className="flex items-center justify-between">
                <p className="text-muted-foreground text-xs">
                  {lastRefreshed ? (
                    <>
                      Last updated <LocalTime date={lastRefreshed} />
                    </>
                  ) : (
                    "Stats not yet loaded"
                  )}
                </p>
                <form action={manualRefreshStats}>
                  <Button type="submit" variant="outline" size="sm">
                    Refresh stats
                  </Button>
                </form>
              </div>
            </div>
          ) : null}

          {canAddRiot ? (
            <RiotLinkForm
              label={riotLinks.length === 0 ? "Riot ID" : "Add another Riot account"}
              hint={
                riotLinks.length > 0
                  ? `${MAX_RIOT_ACCOUNTS - riotLinks.length} slot${
                      MAX_RIOT_ACCOUNTS - riotLinks.length === 1 ? "" : "s"
                    } remaining.`
                  : ""
              }
            />
          ) : (
            <p className="text-muted-foreground text-xs">
              Maximum of {MAX_RIOT_ACCOUNTS} Riot accounts reached. Unlink one to add another.
            </p>
          )}

          <Separator />

          <div className="space-y-1.5">
            <Label htmlFor="opggUrl">
              Custom OP.GG URL <span className="text-muted-foreground">(optional)</span>
            </Label>
            <p className="text-muted-foreground text-xs">
              Each linked Riot account gets an OP.GG link automatically. Use this for a multi-search
              or another page.
            </p>
            <form action={saveOpggUrl} className="flex gap-2">
              <Input
                id="opggUrl"
                name="opggUrl"
                type="url"
                defaultValue={user.opggUrl ?? ""}
                placeholder="https://op.gg/lol/multisearch/na?summoners=…"
              />
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
            <Cs2LinkForm />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
