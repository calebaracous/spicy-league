import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { transitionSeasonState, updateSeason } from "@/app/admin/seasons/actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LocalDateTimeInput, LocalTime } from "@/components/ui/local-time";
import { Textarea } from "@/components/ui/textarea";
import { FlashToast } from "@/components/flash-toast";
import { seasonPageMetadata } from "@/lib/season-meta";
import { GAME_LABELS, SEASON_STATE_LABELS, nextStates } from "@/lib/seasons";
import { cn } from "@/lib/utils";

export const generateMetadata = seasonPageMetadata("Admin");

type SearchParams = Promise<{ saved?: string; error?: string }>;
type Params = Promise<{ slug: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid.",
  "slug-taken": "That slug is already in use.",
  "invalid-state": "That state isn't recognized.",
  "bad-transition": "That transition isn't allowed from the current state.",
  "not-found": "Season not found.",
};

export default async function EditSeasonPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { saved, error } = await searchParams;

  const season = await db.query.seasons.findFirst({
    where: eq(seasons.slug, slug),
  });
  if (!season) notFound();

  const updateWithSlug = updateSeason.bind(null, slug);
  const transitionWithSlug = transitionSeasonState.bind(null, slug);
  const errorMessage = error ? ERROR_MESSAGES[error] : null;
  const available = nextStates(season.state);

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
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
