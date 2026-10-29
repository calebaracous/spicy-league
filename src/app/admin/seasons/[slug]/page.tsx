import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  deleteOldDiscordChannels,
  emailDiscordUnmatched,
  setDiscordNicknames,
  syncDiscordRoles,
  transitionSeasonState,
  updateSeason,
} from "@/app/admin/seasons/actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDateTimeInput, LocalTime } from "@/components/ui/local-time";
import { Textarea } from "@/components/ui/textarea";
import { formatPrizeSplit } from "@/lib/prize-pool";
import { FlashToast } from "@/components/flash-toast";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS, SEASON_STATE_LABELS, nextStates } from "@/lib/seasons";
import { GROUP_BEST_OF_OPTIONS, PLAYOFF_BEST_OF_OPTIONS } from "@/lib/match-format";
import { discordConfig } from "@/lib/discord-api";
import { getDiscordRoster } from "@/lib/discord-admin";
import { cn } from "@/lib/utils";

export const generateMetadata = seasonPageMetadata("Admin");

type SearchParams = Promise<{
  saved?: string;
  error?: string;
  discord?: string;
  discordError?: string;
  discordNote?: string;
}>;
type Params = Promise<{ slug: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid. A prize pool needs a payout split that adds up to 100.",
  "slug-taken": "That slug is already in use.",
  "invalid-state": "That state isn't recognized.",
  "bad-transition": "That transition isn't allowed from the current state.",
  "not-found": "Season not found.",
  "discord-not-configured":
    "The Discord bot isn't set up: add DISCORD_BOT_TOKEN and DISCORD_GUILD_ID (docs/DISCORD.md).",
};

/** `?discord=<assigned>.<unmatched>.<errors>` from syncDiscordRoles → toast text. */
function discordFlash(code: string): string {
  const [assigned, unmatched, errors] = code.split(".").map(Number);
  const parts = [`${assigned} role${assigned === 1 ? "" : "s"} given`];
  if (unmatched) parts.push(`${unmatched} not matched`);
  if (errors) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
  return `Discord sync: ${parts.join(", ")}.`;
}

export default async function EditSeasonPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { saved, error, discord, discordError, discordNote } = await searchParams;

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) notFound();

  const updateWithSlug = updateSeason.bind(null, slug);
  const transitionWithSlug = transitionSeasonState.bind(null, slug);
  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  const available = nextStates(season.state);
  const discordReady = discordConfig() !== null;
  const discordRoster = await getDiscordRoster(season.id);
  const syncDiscordWithSlug = syncDiscordRoles.bind(null, slug);

  return (
    <div className="page flex-1 space-y-6 [--page-max:48rem]">
      <header className="space-y-2">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Back to admin
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-heading">{season.name}</h1>
          <Badge variant={season.state === "draft" ? "secondary" : "default"}>
            {SEASON_STATE_LABELS[season.state]}
          </Badge>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Slug <span className="font-mono">{season.slug}</span> · created{" "}
          <LocalTime date={season.createdAt} />
        </p>
      </header>

      {saved ? <FlashToast message="Saved." /> : null}
      {discord ? <FlashToast param="discord" message={discordFlash(discord)} /> : null}
      {discordNote ? <FlashToast param="discordNote" message={discordNote} /> : null}
      {discordError ? (
        <Alert variant="destructive">
          <AlertDescription>Discord: {discordError}</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>Move the season to the next or previous state.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {available.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              This season is complete. No further transitions are available.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((state) => (
                <form key={state} action={transitionWithSlug}>
                  <input type="hidden" name="to" value={state} />
                  <ConfirmSubmitButton
                    variant="outline"
                    confirmMessage={`Move ${season.name} from "${SEASON_STATE_LABELS[season.state]}" to "${SEASON_STATE_LABELS[state]}"? This changes what players see.`}
                  >
                    → {SEASON_STATE_LABELS[state]}
                  </ConfirmSubmitButton>
                </form>
              ))}
            </div>
          )}
          {season.state !== "draft" ? (
            <p className="text-muted-foreground text-xs">
              Public page:{" "}
              <Link href={`/seasons/${season.slug}`} className="underline underline-offset-2">
                /seasons/{season.slug}
              </Link>
              {" · "}
              <Link
                href={`/admin/seasons/${season.slug}/signups`}
                className="underline underline-offset-2"
              >
                Manage signups
              </Link>
              {" · "}
              <Link
                href={`/admin/seasons/${season.slug}/draft`}
                className="underline underline-offset-2"
              >
                Manage draft
              </Link>
              {" · "}
              <Link
                href={`/admin/seasons/${season.slug}/matches`}
                className="underline underline-offset-2"
              >
                Manage matches
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discord</CardTitle>
          <CardDescription>
            The bot keeps Captain, team roles and channels, Signed up, Sub list, Champion and 10-man
            roles in step with the site, and opens a thread per match. Sync re-runs all of it, e.g.
            after someone joins the server or fixes their username, or after a channel rename hit
            Discord&apos;s limit. Details: <code>docs/DISCORD.md</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!discordReady ? (
            <p className="text-muted-foreground text-sm">
              The bot isn&apos;t set up yet. Add <code>DISCORD_BOT_TOKEN</code> and{" "}
              <code>DISCORD_GUILD_ID</code> in Vercel (see <code>docs/DISCORD.md</code>).
            </p>
          ) : null}
          {discordRoster.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nobody has signed up yet, so there&apos;s no one to give roles to.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pr-4 pb-2 font-medium">Player</th>
                    <th className="pr-4 pb-2 font-medium">Role</th>
                    <th className="pr-4 pb-2 font-medium">Discord</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {discordRoster.map((p) => (
                    <tr key={p.id}>
                      <td className="py-1.5 pr-4">{p.label}</td>
                      <td className="text-muted-foreground py-1.5 pr-4">
                        {[
                          p.captain ? "Captain" : null,
                          p.teamName ?? (p.sub ? "Sub list" : "Signed up"),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                      <td className="py-1.5 pr-4 font-mono text-xs">{p.discordUsername ?? "—"}</td>
                      <td className="py-1.5 text-xs">
                        {!p.discordUsername ? (
                          <span style={{ color: "var(--accent-text)" }}>No username</span>
                        ) : p.discordUserId ? (
                          "Matched"
                        ) : (
                          <span className="text-muted-foreground">Not matched yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <form action={syncDiscordWithSlug}>
              <PendingSubmitButton
                variant="outline"
                disabled={!discordReady}
                pendingLabel="Syncing…"
              >
                Sync Discord
              </PendingSubmitButton>
            </form>
            <form action={emailDiscordUnmatched.bind(null, slug)}>
              <ConfirmSubmitButton
                variant="outline"
                disabled={!discordReady}
                confirmMessage="Email everyone listed as 'No username' or 'Not matched yet' asking them to fix their Discord? Run Sync first so the list is current."
              >
                Email unmatched players
              </ConfirmSubmitButton>
            </form>
            <form action={setDiscordNicknames.bind(null, slug)}>
              <ConfirmSubmitButton
                variant="outline"
                disabled={!discordReady}
                confirmMessage="Set every matched player's server nickname to their site display name?"
              >
                Set nicknames
              </ConfirmSubmitButton>
            </form>
            <form action={deleteOldDiscordChannels.bind(null, slug)}>
              <ConfirmSubmitButton
                variant="outline"
                disabled={!discordReady}
                className="text-destructive hover:text-destructive"
                confirmMessage="Delete every older season's team text and voice channels and categories? Their message history is lost. This can't be undone."
              >
                Delete old team channels
              </ConfirmSubmitButton>
            </form>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Edit season details. Changing the slug changes the season URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={updateWithSlug} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={3}
                maxLength={80}
                defaultValue={season.name}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                required
                minLength={3}
                maxLength={48}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                defaultValue={season.slug}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="game">Game</Label>
              <select
                id="game"
                name="game"
                required
                defaultValue={season.game}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
              >
                {Object.entries(GAME_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="groupBestOf">Group-stage series</Label>
              <select
                id="groupBestOf"
                name="groupBestOf"
                required
                defaultValue={String(season.groupBestOf)}
                className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
              >
                {GROUP_BEST_OF_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Set before group results come in: it changes how matches are reported and ranked.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="playoffBestOf">Semifinal series</Label>
                <select
                  id="playoffBestOf"
                  name="playoffBestOf"
                  required
                  defaultValue={String(season.playoffBestOf)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  {PLAYOFF_BEST_OF_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finalBestOf">Final series</Label>
                <select
                  id="finalBestOf"
                  name="finalBestOf"
                  required
                  defaultValue={String(season.finalBestOf)}
                  className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3"
                >
                  {PLAYOFF_BEST_OF_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Shown in the season format and on playoff match pages.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="fearlessDraft"
                defaultChecked={season.fearlessDraft}
                className="mt-0.5"
              />
              <span>
                Fearless draft
                <span className="text-muted-foreground block text-xs">
                  Once a champion is picked in a series, neither team can pick it again in that
                  series. Shown on the season, match pages and Discord match threads.
                </span>
              </span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="prizePool">Prize pool ($)</Label>
                <Input
                  id="prizePool"
                  name="prizePool"
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="None"
                  defaultValue={season.prizePool ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prizeSplit">Payout split (%)</Label>
                <Input
                  id="prizeSplit"
                  name="prizeSplit"
                  placeholder="75/25"
                  defaultValue={season.prizeSplit ? formatPrizeSplit(season.prizeSplit) : ""}
                />
              </div>
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Whole dollars. Split is percent per place, 1st first, adding up to 100 (e.g. 75/25).
                Leave the prize pool blank for none.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                maxLength={5000}
                rows={3}
                defaultValue={season.description ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rules">Rules</Label>
              <Textarea
                id="rules"
                name="rules"
                maxLength={10000}
                rows={5}
                defaultValue={season.rules ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="signupOpensAt">Signups open</Label>
                <LocalDateTimeInput
                  id="signupOpensAt"
                  name="signupOpensAt"
                  defaultValue={season.signupOpensAt}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signupClosesAt">Signups close</Label>
                <LocalDateTimeInput
                  id="signupClosesAt"
                  name="signupClosesAt"
                  defaultValue={season.signupClosesAt}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draftAt">Draft</Label>
                <LocalDateTimeInput id="draftAt" name="draftAt" defaultValue={season.draftAt} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seasonStartAt">Group stage starts</Label>
                <LocalDateTimeInput
                  id="seasonStartAt"
                  name="seasonStartAt"
                  defaultValue={season.seasonStartAt}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="groupStageEndsAt">Group stage ends</Label>
                <LocalDateTimeInput
                  id="groupStageEndsAt"
                  name="groupStageEndsAt"
                  defaultValue={season.groupStageEndsAt}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="semisAt">Semifinals</Label>
                <LocalDateTimeInput id="semisAt" name="semisAt" defaultValue={season.semisAt} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finalAt">Final</Label>
                <LocalDateTimeInput id="finalAt" name="finalAt" defaultValue={season.finalAt} />
              </div>
            </div>
            <p className="text-muted-foreground -mt-2 text-xs">
              Times are entered and shown in your local timezone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
                Cancel
              </Link>
              <PendingSubmitButton>Save changes</PendingSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
