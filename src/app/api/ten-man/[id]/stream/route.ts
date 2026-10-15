import { getTenManSnapshot } from "@/lib/ten-man";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2000;

// Compare the whole serialized snapshot, not a summary of it. Counts alone
// miss changes that keep them equal — e.g. a player changing their vote
// (castVote deletes and re-inserts, so votes.length is unchanged).
function snapshotHash(snap: Awaited<ReturnType<typeof getTenManSnapshot>>): string {
  return JSON.stringify(snap);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastHash = "";
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const tick = async () => {
        try {
          const snap = await getTenManSnapshot(id);
          const hash = snapshotHash(snap);
          if (hash !== lastHash) {
            lastHash = hash;
            send("update", snap);
          } else {
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch {
              closed = true;
            }
          }
        } catch {
          // swallow; client will reconnect
        }
      };

      await tick();
      const interval = setInterval(tick, POLL_MS);

      _req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
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
