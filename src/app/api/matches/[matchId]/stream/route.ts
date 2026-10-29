import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { matches } from "@/db/schema/matches";
import {
  getMatchDaySnapshot,
  getMatchDayViewer,
  matchDayIsHot,
  type MatchDaySnapshot,
} from "@/lib/match-day";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Same pattern as the draft and 10-man streams (docs/DRAFT.md), but 1s while
// something is ticking (RPS rounds, side pick clocks) and 2s when idle, so an
// open match page between games doesn't hammer the DB. Polling also drives
// the deadlines: getMatchDaySnapshot settles whatever has lapsed.
const HOT_MS = 1000;
const IDLE_MS = 2000;

// serverNow changes every tick; hashing it would push an update every poll.
function snapshotHash(snap: MatchDaySnapshot | null): string {
  return JSON.stringify(snap ? { ...snap, serverNow: null } : null);
}

export async function GET(req: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!match) return new Response("Not found", { status: 404 });
  // Resolved once per connection: the snapshot carries this viewer's own throw.
  const viewer = await getMatchDayViewer(match);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastHash = "";
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const enqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        let hot = false;
        try {
          const snap = await getMatchDaySnapshot(matchId, viewer);
          hot = snap ? matchDayIsHot(snap) : false;
          const hash = snapshotHash(snap);
          if (hash !== lastHash) {
            lastHash = hash;
            enqueue(`event: update\ndata: ${JSON.stringify(snap)}\n\n`);
          } else {
            enqueue(`: ping\n\n`);
          }
        } catch {
          // swallow; client will reconnect
        }
        if (!closed) timer = setTimeout(tick, hot ? HOT_MS : IDLE_MS);
      };

      req.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearTimeout(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });

      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
