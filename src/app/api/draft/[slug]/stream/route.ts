import { getDraftSnapshot } from "@/lib/draft";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POLL_MS = 2000;

function snapshotHash(snap: Awaited<ReturnType<typeof getDraftSnapshot>>): string {
  if (!snap) return "none";
  return `${snap.draft.state}:${snap.picks.length}:${snap.onTheClock?.captainUserId ?? ""}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
          const snap = await getDraftSnapshot(slug);
          const hash = snapshotHash(snap);
          if (hash !== lastHash) {
            lastHash = hash;
            send("update", snap);
          } else {
            // keep-alive comment
            try {
              controller.enqueue(encoder.encode(`: ping\n\n`));
            } catch {
              closed = true;
            }
          }
        } catch {
          // swallow; client will reconnect if connection drops
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
