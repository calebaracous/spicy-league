import Link from "next/link";

import { createSeason } from "@/app/admin/seasons/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { PendingSubmitButton } from "@/components/ui/pending-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDateTimeInput } from "@/components/ui/local-time";
import { Textarea } from "@/components/ui/textarea";
import { GAME_LABELS } from "@/lib/seasons";
import { GROUP_BEST_OF_OPTIONS, PLAYOFF_BEST_OF_OPTIONS } from "@/lib/match-format";
import { cn } from "@/lib/utils";

export const metadata = { title: "New season · Admin" };

type SearchParams = Promise<{ error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid:
    "Some fields are invalid. Double-check name, slug, game, and that a prize pool's payout split adds up to 100.",
  "slug-taken": "That slug is already in use. Pick a different one.",
};

export default async function NewSeasonPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <div className="page flex-1 space-y-6 [--page-max:42rem]">
      <header className="space-y-1">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Back to admin
        </Link>
        <h1 className="text-heading">New season</h1>
        <p className="text-muted-foreground text-sm">
          New seasons start in the draft state and are not public. All fields except name, slug, and
          game can be edited later.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            The slug is part of the season URL. Changing it later changes the URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {errorMessage ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          ) : null}
          <form action={createSeason} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                required
                minLength={3}
                maxLength={80}
                placeholder="Spicy League Season 4"
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
                placeholder="season-4"
              />
              <p className="text-muted-foreground text-xs">
                Lowercase letters, numbers, and hyphens. 3–48 chars.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="game">Game</Label>
              <select
                id="game"
                name="game"
                required
                defaultValue="lol"
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
                defaultValue={"1"}
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
                  defaultValue={"3"}
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
                  defaultValue={"5"}
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
                defaultChecked={false}
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
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prizeSplit">Payout split (%)</Label>
                <Input id="prizeSplit" name="prizeSplit" placeholder="75/25" />
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
                placeholder="Short description shown on the season page."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rules">Rules</Label>
              <Textarea
                id="rules"
                name="rules"
                maxLength={10000}
                rows={5}
                placeholder="Optional. Plain text; line breaks are preserved."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="signupOpensAt">Signups open</Label>
                <LocalDateTimeInput id="signupOpensAt" name="signupOpensAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signupClosesAt">Signups close</Label>
                <LocalDateTimeInput id="signupClosesAt" name="signupClosesAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draftAt">Draft</Label>
                <LocalDateTimeInput id="draftAt" name="draftAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seasonStartAt">Group stage starts</Label>
                <LocalDateTimeInput id="seasonStartAt" name="seasonStartAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="groupStageEndsAt">Group stage ends</Label>
                <LocalDateTimeInput id="groupStageEndsAt" name="groupStageEndsAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="semisAt">Semifinals</Label>
                <LocalDateTimeInput id="semisAt" name="semisAt" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="finalAt">Final</Label>
                <LocalDateTimeInput id="finalAt" name="finalAt" />
              </div>
            </div>
            <p className="text-muted-foreground -mt-2 text-xs">
              Times are entered and shown in your local timezone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
                Cancel
              </Link>
              <PendingSubmitButton>Create draft</PendingSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
