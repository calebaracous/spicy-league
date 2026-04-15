import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { transitionSeasonState, updateSeason } from "@/app/admin/seasons/actions";
import { db } from "@/db/client";
import { seasons } from "@/db/schema/seasons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GAME_LABELS, SEASON_STATE_LABELS, nextStates } from "@/lib/seasons";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ saved?: string; error?: string }>;
type Params = Promise<{ slug: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid.",
  "slug-taken": "That slug is already in use.",
  "invalid-state": "That state isn't recognized.",
  "bad-transition": "That transition isn't allowed from the current state.",
  "not-found": "Season not found.",
};

function toDatetimeLocal(date: Date | null): string {
  if (!date) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

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
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-2">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Back to admin
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{season.name}</h1>
          <Badge variant={season.state === "draft" ? "secondary" : "default"}>
            {SEASON_STATE_LABELS[season.state]}
          </Badge>
          <Badge variant="outline">{GAME_LABELS[season.game]}</Badge>
        </div>
        <p className="text-muted-foreground text-sm">
          Slug <span className="font-mono">{season.slug}</span> · created{" "}
          {season.createdAt.toLocaleString()}
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

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>
            Move the season through its phases. Each transition is one click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {available.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No further transitions — this season is complete.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((state) => (
                <form key={state} action={transitionWithSlug}>
                  <input type="hidden" name="to" value={state} />
                  <Button type="submit" variant="outline">
                    → {SEASON_STATE_LABELS[state]}
                  </Button>
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
              <Link href={`/admin/seasons/${season.slug}/signups`} className="underline underline-offset-2">
                Manage signups
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Rename, rewrite, or reschedule. Slug changes update the URL.
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
                <Input
                  id="signupOpensAt"
                  name="signupOpensAt"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(season.signupOpensAt)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signupClosesAt">Signups close</Label>
                <Input
                  id="signupClosesAt"
                  name="signupClosesAt"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(season.signupClosesAt)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seasonStartAt">Season starts</Label>
                <Input
                  id="seasonStartAt"
                  name="seasonStartAt"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(season.seasonStartAt)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
                Cancel
              </Link>
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
