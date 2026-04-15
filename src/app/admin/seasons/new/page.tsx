import Link from "next/link";

import { createSeason } from "@/app/admin/seasons/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GAME_LABELS } from "@/lib/seasons";
import { cn } from "@/lib/utils";

type SearchParams = Promise<{ error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  invalid: "Some fields are invalid. Double-check name, slug, and game.",
  "slug-taken": "That slug is already in use. Pick a different one.",
};

export default async function NewSeasonPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-1">
        <Link href="/admin" className="text-muted-foreground text-xs hover:underline">
          ← Back to admin
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">New season</h1>
        <p className="text-muted-foreground text-sm">
          Seasons begin as drafts. You can fill in everything now or iterate later.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>The slug is permanent-ish — it becomes part of the URL.</CardDescription>
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
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                maxLength={5000}
                rows={3}
                placeholder="Short pitch shown on the season landing page."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rules">Rules</Label>
              <Textarea
                id="rules"
                name="rules"
                maxLength={10000}
                rows={5}
                placeholder="Optional longer-form ruleset. Markdown is fine."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="signupOpensAt">Signups open</Label>
                <Input id="signupOpensAt" name="signupOpensAt" type="datetime-local" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="signupClosesAt">Signups close</Label>
                <Input id="signupClosesAt" name="signupClosesAt" type="datetime-local" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="seasonStartAt">Season starts</Label>
                <Input id="seasonStartAt" name="seasonStartAt" type="datetime-local" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }))}>
                Cancel
              </Link>
              <Button type="submit">Create draft</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
