import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
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
import { setDiscordUsername } from "@/lib/account-edits";
import { requireOnboarded } from "@/lib/auth-helpers";
import { DISCORD_USERNAME_HELP } from "@/lib/discord";
import { setTenManRole } from "@/lib/discord-ping-roles";
import { syncInBackground } from "@/lib/discord-roles";
import { opggUrlForRiotId } from "@/lib/opgg";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalTime } from "@/components/ui/local-time";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FlashToast } from "@/components/flash-toast";
import { cn } from "@/lib/utils";
import { diffFields } from "@/lib/event-format";
import { logEvent } from "@/lib/events";

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

    const before = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { name: true, bio: true, pronouns: true },
    });
    await db
      .update(users)
      .set({ name: nameRaw, bio, pronouns, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    const changes = diffFields(before ?? {}, { name: nameRaw, bio, pronouns });
    if (Object.keys(changes).length) {
      await logEvent("profile.updated", { actorId: session.user.id, data: { changes } });
    }

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

    const before = await db.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { opggUrl: true },
    });
    await db
      .update(users)
      .set({ opggUrl: opggUrlRaw, updatedAt: new Date() })
      .where(eq(users.id, session.user.id));
    const changes = diffFields(before ?? {}, { opggUrl: opggUrlRaw });
    if (Object.keys(changes).length) {
      await logEvent("profile.opgg_updated", { actorId: session.user.id, data: { changes } });
    }

    redirect("/profile?saved=1");
  }

  // Own form, like saveOpggUrl. Required for season signups, so it can be
  // changed but not cleared.
  async function saveDiscordUsername(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const error = await setDiscordUsername(
      session.user.id,
      formData.get("discordUsername")?.toString(),
      session.user.id,
    );
    if (error) redirect(`/profile?error=discord-${error}`);

    redirect("/profile?saved=1");
  }

  // Opt in/out of the Discord "10-man" ping role.
  async function saveTenManPings(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const on = formData.get("tenManPings") === "on";
    // Log only real changes; the role sync is idempotent, so re-saving also
    // retries one that failed.
    const updated = await db
      .update(users)
      .set({ tenManPings: on, updatedAt: new Date() })
      .where(and(eq(users.id, session.user.id), ne(users.tenManPings, on)))
      .returning({ id: users.id });
    if (updated.length) {
      await logEvent("profile.ten_man_pings", { actorId: session.user.id, data: { enabled: on } });
    }
    syncInBackground("10-man role", () => setTenManRole(session.user.id, on));
    redirect("/profile?saved=1");
  }

  // "Interested in being a captain" — also set by the season signup form.
  async function saveCaptainInterest(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const on = formData.get("captainInterest") === "on";
    const updated = await db
      .update(users)
      .set({ captainInterest: on, updatedAt: new Date() })
      .where(and(eq(users.id, session.user.id), ne(users.captainInterest, on)))
      .returning({ id: users.id });
    if (updated.length) {
      await logEvent("profile.captain_interest", {
        actorId: session.user.id,
        data: { enabled: on },
      });
    }
    redirect("/profile?saved=1");
  }

  // Public per-player Riot stats from league games (Riot policy: opt-in
  // only). LoL season signups require it; opting out here never touches
  // existing signups. Re-opting in restarts the timestamp.
  async function saveStatsOptIn(formData: FormData) {
    "use server";
    const session = await requireOnboarded();
    const on = formData.get("statsOptIn") === "on";
    const updated = await db
      .update(users)
      .set({ statsOptInAt: on ? new Date() : null, updatedAt: new Date() })
      .where(
        and(
          eq(users.id, session.user.id),
          on ? isNull(users.statsOptInAt) : isNotNull(users.statsOptInAt),
        ),
      )
      .returning({ id: users.id });
    if (updated.length) {
      await logEvent("profile.stats_opt_in", { actorId: session.user.id, data: { enabled: on } });
    }
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
          <PendingSubmitButton variant="outline">Sign out</PendingSubmitButton>
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
              <PendingSubmitButton>Save</PendingSubmitButton>
            </div>
          </form>
          <form
            action={saveTenManPings}
            className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="tenManPings" defaultChecked={user.tenManPings} />
              Ping me in Discord when a 10-man opens
            </label>
            <PendingSubmitButton variant="outline" size="sm">
              Save
            </PendingSubmitButton>
          </form>
        </CardContent>
      </Card>

      {/* Captain interest: a hint for admins picking captains */}
      <Card>
        <CardHeader>
          <CardTitle>Captaining</CardTitle>
          <CardDescription>
            Let admins know you&apos;d like to captain a team. Only admins see this, and they still
            choose captains by hand. The season signup form updates this too.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action={saveCaptainInterest}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="captainInterest" defaultChecked={user.captainInterest} />
              I&apos;m interested in being a captain
            </label>
            <PendingSubmitButton variant="outline" size="sm">
              Save
            </PendingSubmitButton>
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
              <PendingSubmitButton>Save</PendingSubmitButton>
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
                      <PendingSubmitButton
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                      >
                        Unlink
                      </PendingSubmitButton>
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
                  <PendingSubmitButton variant="outline" size="sm">
                    Refresh stats
                  </PendingSubmitButton>
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
              <PendingSubmitButton variant="outline">Save</PendingSubmitButton>
            </form>
          </div>

          <Separator />

          <form action={saveStatsOptIn} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="statsOptIn" defaultChecked={!!user.statsOptInAt} />
                Show my per-player stats from league games publicly
              </label>
              <PendingSubmitButton variant="outline" size="sm">
                Save
              </PendingSubmitButton>
            </div>
            <p className="text-muted-foreground text-xs">
              KDA, CS, damage, champions played and similar, from Riot, for Spicy League games.
              Required to sign up for a League of Legends season. If you opt out, your per-player
              stats are hidden (team and champion totals still show); seasons you&apos;ve already
              signed up for aren&apos;t affected.
              {user.statsOptInAt ? (
                <>
                  {" "}
                  Opted in <LocalTime date={user.statsOptInAt} preset="date-short" />.
                </>
              ) : null}
            </p>
          </form>
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
                  <PendingSubmitButton
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                  >
                    Unlink
                  </PendingSubmitButton>
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

      <p className="text-muted-foreground text-sm">
        Want to leave for good?{" "}
        <Link
          href={`/users/${user.username}#delete-account`}
          className="text-destructive underline-offset-4 hover:underline"
        >
          Delete your account
        </Link>
      </p>
    </div>
  );
}
