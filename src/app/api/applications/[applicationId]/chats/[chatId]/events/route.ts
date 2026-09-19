import { handle } from "@/server/http";
import { chatSnapshot } from "@/server/pi-conversation";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    let latest = JSON.stringify(await chatSnapshot(applicationId, chatId));
    let timer: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let close: () => void = () => {};
    const clean = () => {
      closed = true;
      clearInterval(timer);
      clearInterval(heartbeat);
      request.signal.removeEventListener("abort", close);
    };
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        close = () => {
          if (!closed) {
            clean();
            controller.close();
          }
        };
        request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) {
          close();
          return;
        }
        // Reconnect always starts with authoritative latest state; no token
        // history, cursor retention, or missed frame can lose an accepted run.
        controller.enqueue(encoder.encode(`data: ${latest}\n\n`));
        let reading = false;
        timer = setInterval(async () => {
          if (reading) return;
          reading = true;
          try {
            const next = JSON.stringify(
              await chatSnapshot(applicationId, chatId),
            );
            if (next !== latest && !closed) {
              latest = next;
              controller.enqueue(encoder.encode(`data: ${next}\n\n`));
            }
          } catch {
            close();
          } finally {
            reading = false;
          }
        }, 500);
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
          15_000,
        );
      },
      cancel: clean,
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
