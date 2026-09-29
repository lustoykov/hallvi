import { handle } from "@/server/http";
import { chatSnapshot } from "@/server/pi-conversation";
import {
  invalidateSnapshotRead,
  refreshSnapshot,
} from "@/server/chat-snapshot-reads";
import { assertSameOrigin } from "@/server/schemas";
import { loadChat } from "@/server/applications";
import { subscribeChanges } from "@/server/change-notifications";
import { invalidateExecutionReads } from "@/server/operator-execution";
import { ChatFrames } from "@/server/chat-frames";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string; chatId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId, chatId } = await context.params;
    await loadChat(applicationId, chatId);
    const frames = new ChatFrames();
    // Installed clients may reconnect with JavaScript from before an upgrade.
    // Only clients that can apply changes opt in; the old URL stays full-state.
    const incremental =
      new URL(request.url).searchParams.get("changes") === "1";
    let latestFull = "";
    let initial = "";
    const encode = (snapshot: Awaited<ReturnType<typeof chatSnapshot>>) => {
      if (incremental) {
        const frame = frames.next(snapshot);
        return frame ? JSON.stringify(frame) : undefined;
      }
      const text = JSON.stringify(snapshot);
      if (text === latestFull) return undefined;
      latestFull = text;
      return text;
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let reading = false;
    let lastReadAt = 0;
    let generation = 0;
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const clean = () => {
      closed = true;
      frames.clear();
      latestFull = "";
      initial = "";
      clearTimeout(timer);
      clearInterval(heartbeat);
      subscription.close();
      request.signal.removeEventListener("abort", close);
    };
    const close = () => {
      if (closed) return;
      clean();
      controller?.close();
    };
    const send = (text: string) => {
      if (closed || !controller) return;
      // Keep at most the current frame. A stalled reader reconnects for full
      // state instead of retaining every snapshot in an unbounded queue.
      if ((controller.desiredSize ?? 0) <= 0) {
        close();
        return;
      }
      controller.enqueue(encoder.encode(text));
    };
    const schedule = () => {
      if (closed || reading || timer || !controller) return;
      // A short leading delay batches one mutation's notices; sustained
      // output never rebuilds a long history faster than the former 500ms poll.
      timer = setTimeout(
        () => {
          timer = undefined;
          void refresh();
        },
        Math.max(100, 500 - (Date.now() - lastReadAt)),
      );
    };
    const refresh = async () => {
      reading = true;
      lastReadAt = Date.now();
      const at = generation;
      try {
        const snapshot = await refreshSnapshot(applicationId, chatId);
        if (closed) return;
        const next = encode(snapshot);
        if (next) send(`data: ${next}\n\n`);
      } catch {
        close();
      } finally {
        reading = false;
        // A notification arriving during an async read must survive it.
        if (generation !== at) schedule();
      }
    };
    const subscription = subscribeChanges(
      { applicationId, chatId },
      (notice) => {
        invalidateSnapshotRead(applicationId, chatId);
        if (notice.kind === "error") {
          close();
          return;
        }
        if (notice.kind === "execution" || notice.kind === "connection")
          invalidateExecutionReads(applicationId);
        generation++;
        schedule();
      },
    );
    request.signal.addEventListener("abort", close, { once: true });
    let initialGeneration: number;
    try {
      // Register first, then read. An initial failure to connect still allows
      // the existing worker-unavailable snapshot; reconnect reads again.
      await subscription.ready;
      request.signal.throwIfAborted();
      // Another chat may have kept the shared connection alive while this
      // reader was away. Never join its abandoned pre-disconnect scan.
      invalidateExecutionReads(applicationId);
      invalidateSnapshotRead(applicationId, chatId);
      initialGeneration = generation;
      lastReadAt = Date.now();
      const snapshot = await chatSnapshot(applicationId, chatId);
      request.signal.throwIfAborted();
      initial = encode(snapshot)!;
    } catch (error) {
      clean();
      throw error;
    }
    const stream = new ReadableStream<Uint8Array>({
      start(opened) {
        controller = opened;
        if (closed || request.signal.aborted) {
          clean();
          opened.close();
          return;
        }
        // Reconnect always starts with authoritative latest state; no token
        // history, cursor retention, or missed frame can lose an accepted run.
        send(`data: ${initial}\n\n`);
        initial = "";
        if (generation !== initialGeneration) schedule();
        heartbeat = setInterval(() => send(": keep-alive\n\n"), 15_000);
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
