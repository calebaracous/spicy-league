import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  pauseDraft,
  resumeDraft,
  startDraft,
  undoLastPick,
} from "@/app/seasons/[slug]/draft/actions";
import { db } from "@/db/client";
import { drafts } from "@/db/schema/drafts";
import { seasons } from "@/db/schema/seasons";
import { requireAdmin } from "@/lib/auth-helpers";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getDraftSnapshot, totalPicks } from "@/lib/draft";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ saved?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "need-captains": "You need at least 2 captains to start the draft.",
  "already-complete": "This draft is already complete.",
  "no-draft": "No draft has been created yet.",
  "no-picks": "There are no picks to undo.",
};

const STATE_LABELS: Record<string, string> = {
  pending: "Not started",
  in_progress: "Live",
  paused: "Paused",
  completed: "Complete",
};

export const dynamic = "force-dynamic";

export default async function AdminDraftPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const { slug } = await params;
  const { saved, error } = await searchParams;

  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });
  if (!season) notFound();

  const draft = await db.query.drafts.findFirst({ where: eq(drafts.seasonId, season.id) });
  const snap = await getDraftSnapshot(slug);
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  const startWithSlug = startDraft.bind(null, slug);
  const pauseWithSlug = pauseDraft.bind(null, slug);
  const resumeWithSlug = resumeDraft.bind(null, slug);
  const undoWithSlug = undoLastPick.bind(null, slug);

  const captainCount = snap?.captains.length ?? 0;
  const expectedTotal = totalPicks(captainCount);
  const pickCount = snap?.picks.length ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-2">
        <Link
          href={`/admin/seasons/${slug}`}
          className="text-muted-foreground text-xs hover:underline"
        >
          ← Back to {season.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">Draft control</h1>
          {draft ? (
            <Badge>{STATE_LABELS[draft.state]}</Badge>
          ) : (
            <Badge variant="secondary">No draft</Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {captainCount} captain{captainCount === 1 ? "" : "s"} · {pickCount} / {expectedTotal}{" "}
          picks
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
          <CardTitle>Controls</CardTitle>
          <CardDescription>
            Captains pick at their own pace — there&apos;s no clock. Admins can pick on behalf of
            anyone from the live board.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {!draft || draft.state === "pending" || draft.state === "paused" ? (
              <form action={startWithSlug}>
                <Button type="submit">
                  {!draft
                    ? "Start draft"
                    : draft.state === "paused"
                      ? "Resume draft"
                      : "Start draft"}
                </Button>
              </form>
            ) : null}
            {draft?.state === "in_progress" ? (
              <form action={pauseWithSlug}>
                <Button type="submit" variant="outline">
                  Pause
                </Button>
              </form>
            ) : null}
            {draft?.state === "paused" ? (
              <form action={resumeWithSlug}>
                <Button type="submit">Resume</Button>
              </form>
            ) : null}
            {draft && draft.state !== "completed" && pickCount > 0 ? (
              <form action={undoWithSlug}>
                <Button
                  type="submit"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                >
                  Undo last pick
                </Button>
              </form>
            ) : null}
          </div>

          <Separator />

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/seasons/${slug}/draft`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Open live draft board
            </Link>
            <Link
              href={`/admin/seasons/${slug}/signups`}
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Reorder captains
            </Link>
          </div>
        </CardContent>
      </Card>

      {snap && snap.captains.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Captain order</CardTitle>
            <CardDescription>
              This is the snake order for round 1. Round 2 reverses, round 3 forward, round 4
              reverse — 4 picks per captain, 5-player teams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1 text-sm">
              {snap.captains.map((c) => (
                <li key={c.userId} className="flex items-center gap-3">
                  <span className="text-muted-foreground w-6 text-right font-mono text-xs">
                    {c.captainOrder}.
                  </span>
                  <span>{c.displayName}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
