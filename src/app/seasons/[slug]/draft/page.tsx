import Link from "next/link";
import { notFound } from "next/navigation";

import { LiveBoard } from "./live-board";
import { auth } from "@/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { GAME_LABELS } from "@/lib/seasons";
import { getDraftSnapshot } from "@/lib/draft";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  "no-draft": "The draft hasn't been created yet.",
  "not-running": "The draft isn't active right now.",
  "draft-complete": "The draft is already complete.",
  "not-your-turn": "It isn't your pick.",
  "cant-pick-captain": "You can't pick another captain.",
  "already-picked": "That player has already been picked.",
  "not-in-pool": "That player isn't in the signup pool.",
  internal: "Something went wrong. Try again.",
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  return { title: `Draft — ${slug} — Spicy League` };
}

export default async function DraftPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const snap = await getDraftSnapshot(slug);
  if (!snap) notFound();

  const session = await auth();
  const viewerUserId = session?.user?.id ?? null;
  const isAdmin = session?.user?.role === "admin";
  const errorMessage = error ? ERROR_MESSAGES[error] : null;

  // Re-fetch the season just for the game label (snapshot doesn't carry it)
  const { db } = await import("@/db/client");
  const { seasons } = await import("@/db/schema/seasons");
  const { eq } = await import("drizzle-orm");
  const season = await db.query.seasons.findFirst({ where: eq(seasons.slug, slug) });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-6 py-12">
      <header className="space-y-2">
        <Link href={`/seasons/${slug}`} className="text-muted-foreground text-xs hover:underline">
          ← Back to season
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{snap.season.name} Draft</h1>
          {season ? <Badge variant="outline">{GAME_LABELS[season.game]}</Badge> : null}
        </div>
      </header>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <LiveBoard
        initial={JSON.parse(JSON.stringify(snap))}
        slug={slug}
        viewerUserId={viewerUserId}
        isAdmin={isAdmin}
      />
    </main>
  );
}
