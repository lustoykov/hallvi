import {
  accessLogRecord,
  followAccessLog,
  LIVE_WINDOW_MINUTES,
  LiveWindow,
} from "@/server/access-log";
import { handle } from "@/server/http";
import { operatorSettings } from "@/server/operator-execution";
import { assertSameOrigin } from "@/server/schemas";
import type { Arrival, LiveEvent } from "@/server/traffic/contract";
import { collectionOf } from "@/server/traffic/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requests as they arrive, for as long as Overview or Traffic is open. */
export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const configuration = async () => {
      const host = (await operatorSettings(applicationId)).host;
      return { host, log: host ? await accessLogRecord(applicationId) : null };
    };
    const initial = await configuration();
    const { host, log } = initial;

    const encoder = new TextEncoder();
    const session = new AbortController();
    let flush: ReturnType<typeof setInterval> | undefined;
    let watch: ReturnType<typeof setInterval> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const end = () => {
      session.abort();
      clearInterval(flush);
      clearInterval(heartbeat);
      clearInterval(watch);
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: LiveEvent) => {
          if (!session.signal.aborted)
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
        };
        const close = () => {
          if (session.signal.aborted) return;
          end();
          controller.close();
        };
        request.signal.addEventListener("abort", close, { once: true });
        if (request.signal.aborted) {
          close();
          return;
        }
        // A held-open page must discover a newly recorded source and stop
        // following one that was retired or moved, without a page reload.
        let checking = false;
        watch = setInterval(async () => {
          if (checking || session.signal.aborted) return;
          checking = true;
          try {
            if (
              JSON.stringify(await configuration()) === JSON.stringify(initial)
            )
              return;
          } catch {
            // Deleting the application also ends its observation.
          } finally {
            checking = false;
          }
          if (session.signal.aborted) return;
          controller.enqueue(encoder.encode("retry: 1000\n\n"));
          close();
        }, 1000);
        // A server that will not answer is asked again four times a minute,
        // not twenty.
        controller.enqueue(encoder.encode("retry: 15000\n\n"));

        if (!host || !log) {
          send({ type: "state", state: host ? "no-log" : "no-server" });
          // Held open, quietly: closing would have EventSource ask again
          // every three seconds for an answer that has not changed.
          heartbeat = setInterval(
            () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
            15_000,
          );
          return;
        }

        send({ type: "state", state: "connecting" });
        // Views come from the script once it has been heard from, as they do
        // in the totals; before that, from the log.
        let script = false;
        try {
          script = Boolean((await collectionOf(applicationId)).scriptSince);
        } catch {
          // No totals to read: the stream still tells the log's story.
        }
        if (session.signal.aborted) return;
        const window = new LiveWindow({
          hosts: log.hosts,
          pageKey: log.pageKey,
          hashRouting: log.hashRouting,
          script,
        });
        let pending: Arrival[] = [];
        let answered = false;
        let ticks = 0;
        flush = setInterval(() => {
          if (pending.length) {
            // A burst is summarised by its newest lines; the page is a
            // picture of traffic, not a copy of the log.
            send({ type: "arrivals", arrivals: pending });
            pending = [];
          }
          // The counts every few seconds, once the backlog has been read.
          if (answered && ticks++ % 8 === 2) send(window.now());
        }, 400);
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
          15_000,
        );

        followAccessLog(
          host,
          log,
          (line) => {
            const arrival = window.arrival(line);
            // The backlog only reaches as far back as the page's window.
            if (
              !arrival ||
              arrival.at < Date.now() - LIVE_WINDOW_MINUTES * 60_000
            )
              return;
            pending.push(arrival);
            if (pending.length > 400) pending.shift();
          },
          session.signal,
          () => {
            answered = true;
            send({ type: "state", state: "live" });
          },
        )
          .then(({ exitCode, said }) => {
            send({
              type: "state",
              state: "lost",
              detail:
                // Only a session that never answered was refused. One that
                // had been following simply stopped, whatever ssh exits with.
                said ||
                (!answered && exitCode === 255
                  ? "The server did not accept the connection."
                  : "The log stopped."),
            });
            close();
          })
          .catch(() => {
            send({
              type: "state",
              state: "lost",
              detail: "The connection to the server could not be opened.",
            });
            close();
          });
      },
      cancel: end,
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
