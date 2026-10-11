import { subscribeRun } from "@/lib/runs/runner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noop = () => undefined;

/**
 * Server-sent events for a running agent: the full step list on every change, then
 * "end". A finished (or unknown) run ends at once and the client reads it over GET.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();
  let cleanup: () => void = noop;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        send("end", {});
        closed = true;
        cleanup();
        controller.close();
      };
      const unsubscribe = subscribeRun(id, ({ steps, finished }) => {
        send("trace", steps);
        if (finished) queueMicrotask(close);
      });
      if (!unsubscribe) return close();
      const ping = setInterval(() => send("ping", {}), 15_000);
      cleanup = () => {
        clearInterval(ping);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        closed = true;
        cleanup();
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
