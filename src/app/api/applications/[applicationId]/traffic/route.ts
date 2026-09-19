import {
  accessLogSource,
  followAccessLog,
  type AccessLine,
  type TrafficEvent,
} from "@/server/access-log";
import { handle } from "@/server/http";
import { operatorSettings } from "@/server/operator-execution";
import { assertSameOrigin } from "@/server/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Requests as they arrive, for as long as Overview is open. */
export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
) {
  return handle(async () => {
    assertSameOrigin(request);
    const { applicationId } = await context.params;
    const configuration = () => {
      const host = operatorSettings(applicationId).host;
      return { host, source: host ? accessLogSource(applicationId) : null };
    };
    const initial = configuration();
    const { host, source } = initial;

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
      start(controller) {
        const send = (event: TrafficEvent) => {
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
        watch = setInterval(() => {
          try {
            if (JSON.stringify(configuration()) === JSON.stringify(initial))
              return;
          } catch {
            // Deleting the application also ends its observation.
          }
          controller.enqueue(encoder.encode("retry: 1000\n\n"));
          close();
        }, 1000);
        // A server that will not answer is asked again four times a minute,
        // not twenty.
        controller.enqueue(encoder.encode("retry: 15000\n\n"));

        if (!host || !source) {
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
        let pending: AccessLine[] = [];
        let answered = false;
        flush = setInterval(() => {
          if (!pending.length) return;
          // A burst is summarised by its newest lines; the page is a picture
          // of traffic, not a copy of the log.
          send({ type: "lines", lines: pending });
          pending = [];
        }, 400);
        heartbeat = setInterval(
          () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
          15_000,
        );

        followAccessLog(
          host,
          source,
          (line) => {
            pending.push(line);
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
