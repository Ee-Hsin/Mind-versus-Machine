import type { WordleStreamEvent } from "@ai-ramp/protocol";
import { requireOwnedGame } from "@/lib/api/game-access";
import { apiError } from "@/lib/api/repository";

export const runtime = "nodejs";
/** A live connection must never be cached or buffered by an intermediary. */
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

/**
 * Server-sent events for the model boards.
 *
 * SSE rather than WebSockets because traffic here is wildly asymmetric — the
 * server pushes model turns, the client sends about six POSTs a game — and
 * because `EventSource` gives resume-after-drop for free: the browser replays
 * `Last-Event-ID` on reconnect, which maps straight onto the per-game sequence
 * numbers the live game already assigns. Refresh, reconnect, and late-join all
 * become the same code path.
 *
 * The human's own guess results do not come down here; they are returned directly
 * from the guess POST.
 */
export async function GET(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  try {
    const access = await requireOwnedGame(request, gameId);
    if (!access.ok) return access.response;
    const { game } = access;

    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => {};
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const write = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            // The client went away between our check and the write.
            closed = true;
          }
        };

        const finish = () => {
          if (closed) return;
          closed = true;
          unsubscribe();
          if (heartbeat) clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // Already closed by the runtime.
          }
        };

        const send = (event: WordleStreamEvent) => {
          write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
          // Nothing more will ever be published for a finished game, so free the
          // connection rather than holding it open on a heartbeat forever.
          if (event.type === "finished") finish();
        };

        const lastEventId = Number(request.headers.get("last-event-id") ?? "0") || 0;
        unsubscribe = game.subscribe(send, lastEventId);

        // Comment frames keep proxies and load balancers from dropping an idle
        // stream while a human sits and thinks.
        heartbeat = setInterval(() => write(": keep-alive\n\n"), HEARTBEAT_MS);

        request.signal.addEventListener("abort", finish);

        // If the game is already over when the client connects, say so and close
        // instead of leaving a pointless connection open.
        if (game.humanFinished && game.modelsFinished) finish();
      },
      cancel() {
        closed = true;
        unsubscribe();
        if (heartbeat) clearInterval(heartbeat);
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, no-transform",
        Connection: "keep-alive",
        // Tells nginx-style proxies not to buffer, which would defeat streaming.
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
