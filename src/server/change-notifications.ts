// Ephemeral invalidations, not another record of the conversation. The worker
// fans them out on its existing socket; readers always reconstruct from state.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import {
  request,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { resolve } from "node:path";
import { z } from "zod";
import { workerSocketPath } from "../../scripts/worker-socket.mjs";
import { databasePath } from "./database-path";
import { piConfigDir } from "./pi-configuration";

const changeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    applicationId: z.uuid(),
    chatId: z.uuid(),
  }),
  z.object({
    kind: z.enum(["application", "information", "execution"]),
    applicationId: z.uuid(),
  }),
]);
export type StateChange = z.infer<typeof changeSchema>;
type Notice = StateChange | { kind: "connection" } | { kind: "error" };
type Listener = (notice: Notice) => void;
const canonical = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

/** Shared across Next route bundles and development module reloads. */
declare global {
  var __hallviChanges: Map<string, ChangeHub> | undefined;
}

class ChangeHub {
  readonly identity: string;
  readonly socket: string;
  owned = false;
  readonly listeners = new Set<Listener>();
  readonly peers = new Set<ServerResponse>();
  private upstream?: ClientRequest;
  private retry?: ReturnType<typeof setTimeout>;
  private retryMs = 250;
  private alive?: boolean;
  private ready?: Promise<void>;
  private resolveReady?: () => void;
  private rejectReady?: (error: Error) => void;
  private failure?: Error;
  private pending = new Map<string, StateChange>();
  private publishing = false;
  private publishRetry?: ReturnType<typeof setTimeout>;

  constructor(database: string, config: string) {
    this.identity = createHash("sha256")
      .update(JSON.stringify([database, config]))
      .digest("hex");
    this.socket = workerSocketPath(database);
  }

  private deliver(notice: Notice) {
    for (const listener of this.listeners) {
      try {
        listener(notice);
      } catch {
        // A broken observer must not fail an already committed mutation.
        // Give its stream a chance to close so reconnect reads current state.
        try {
          listener({ kind: "error" });
        } catch {
          /* observer is gone */
        }
      }
    }
  }

  receive(change: StateChange) {
    this.deliver(change);
    for (const peer of this.peers) {
      // A slow reader reconnects and reads current state. Never queue an
      // unbounded stream of invalidations or hold up the writer.
      try {
        if (!peer.write(JSON.stringify(change) + "\n")) peer.destroy();
      } catch {
        peer.destroy();
      }
    }
  }

  publish(change: StateChange) {
    this.receive(change);
    if (this.owned) return;
    const key =
      change.kind === "chat"
        ? change.chatId
        : `${change.applicationId}:${change.kind}`;
    this.pending.set(key, change);
    void this.flush();
  }

  private async flush() {
    if (this.publishing || this.publishRetry || !this.pending.size) return;
    this.publishing = true;
    const sent = new Map([...this.pending].slice(0, 256));
    try {
      await new Promise<void>((done, failed) => {
        const asked = request(
          {
            socketPath: this.socket,
            path: "/changed",
            method: "POST",
            agent: false,
            headers: {
              "Content-Type": "application/json",
              "X-Hallvi-State": this.identity,
            },
          },
          (response) => {
            response.resume();
            response.on("error", failed);
            response.on("end", () =>
              response.statusCode === 200
                ? done()
                : failed(new Error("Change relay refused.")),
            );
          },
        );
        asked.on("error", failed);
        asked.setTimeout(5_000, () =>
          asked.destroy(new Error("Change relay timed out.")),
        );
        asked.end(JSON.stringify([...sent.values()]));
      });
      for (const [key, value] of sent)
        if (this.pending.get(key) === value) this.pending.delete(key);
    } catch {
      // Only invalidations are retried. A committed write is never replayed,
      // and local readers were notified even while the worker was absent.
      this.publishRetry = setTimeout(() => {
        this.publishRetry = undefined;
        void this.flush();
      }, 1_000);
      this.publishRetry.unref();
    } finally {
      this.publishing = false;
    }
    if (!this.publishRetry) void this.flush();
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    if (!this.ready) {
      this.ready = new Promise<void>((resolve, reject) => {
        this.resolveReady = resolve;
        this.rejectReady = reject;
      });
      if (this.owned) this.resolveReady!();
      else this.connect();
    }
    return {
      ready: this.ready,
      close: () => {
        this.listeners.delete(listener);
        if (this.listeners.size) return;
        clearTimeout(this.retry);
        this.retry = undefined;
        const upstream = this.upstream;
        this.upstream = undefined;
        upstream?.destroy();
        this.resolveReady?.();
        this.ready = undefined;
        this.alive = undefined;
        this.failure = undefined;
        this.retryMs = 250;
      },
    };
  }

  private connect() {
    if (!this.listeners.size || this.upstream || this.failure) return;
    const asked = request({
      socketPath: this.socket,
      path: "/changes",
      method: "GET",
      agent: false,
      headers: { "X-Hallvi-State": this.identity },
    });
    this.upstream = asked;
    const lost = () => {
      if (this.upstream !== asked) return;
      this.upstream = undefined;
      asked.destroy();
      this.resolveReady?.();
      if (this.alive !== false) {
        this.alive = false;
        this.deliver({ kind: "connection" });
      }
      if (this.listeners.size && !this.failure) {
        this.retry = setTimeout(() => {
          this.retry = undefined;
          this.connect();
        }, this.retryMs);
        this.retry.unref();
        this.retryMs = Math.min(5_000, this.retryMs * 2);
      }
    };
    const refuse = () => {
      this.failure = new Error(
        "The worker change subscription belongs to different controller storage or an incompatible worker. Restart Hallvi.",
      );
      this.rejectReady?.(this.failure);
      this.deliver({ kind: "error" });
      lost();
    };
    asked.on("response", (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        refuse();
        return;
      }
      let text = "";
      let ready = false;
      response.setEncoding("utf8");
      response.on("data", (chunk: string) => {
        text += chunk;
        if (text.length > 65_536) {
          refuse();
          return;
        }
        let boundary: number;
        while ((boundary = text.indexOf("\n")) >= 0) {
          const line = text.slice(0, boundary);
          text = text.slice(boundary + 1);
          if (!line) continue; // transport heartbeat, never a state change
          try {
            const frame = JSON.parse(line);
            if (!ready) {
              if (frame.kind !== "ready" || frame.identity !== this.identity) {
                refuse();
                return;
              }
              ready = true;
              this.alive = true;
              this.retryMs = 250;
              this.resolveReady?.();
              // Every new connection recovers changes missed in its gap.
              this.deliver({ kind: "connection" });
            } else this.receive(changeSchema.parse(frame));
          } catch {
            refuse();
            return;
          }
        }
      });
      response.on("error", lost);
      response.on("end", lost);
      response.on("close", lost);
    });
    asked.on("error", lost);
    asked.setTimeout(45_000, () =>
      asked.destroy(new Error("Change subscription stopped answering.")),
    );
    asked.end();
  }
}

function hub(
  storage = { database: databasePath(), config: piConfigDir() },
): ChangeHub {
  const database = canonical(storage.database);
  const config = canonical(storage.config);
  const key = JSON.stringify([database, config]);
  const hubs = (globalThis.__hallviChanges ??= new Map<string, ChangeHub>());
  let found = hubs.get(key);
  if (!found) hubs.set(key, (found = new ChangeHub(database, config)));
  return found;
}

/** Called only after the state a reader should see has changed. */
export function notifyChange(change: StateChange) {
  try {
    hub().publish(change);
  } catch {
    console.warn(
      "A Hallvi change notification could not be delivered; reconnect to read current state.",
    );
  }
}

export function subscribeChanges(
  scope: { applicationId: string; chatId: string },
  listener: Listener,
) {
  return hub().subscribe((notice) => {
    if (
      notice.kind === "connection" ||
      notice.kind === "error" ||
      (notice.applicationId === scope.applicationId &&
        (notice.kind !== "chat" || notice.chatId === scope.chatId))
    )
      listener(notice);
  });
}

/** Installed only by the process holding worker ownership, before recovery. */
export function ownChangeNotifications(storage?: {
  database: string;
  config: string;
}) {
  const current = hub(storage);
  current.owned = true;
  return {
    notify: (change: StateChange) => current.receive(change),
    handle(incoming: IncomingMessage, outgoing: ServerResponse) {
      if (incoming.url !== "/changes" && incoming.url !== "/changed")
        return false;
      if (incoming.headers["x-hallvi-state"] !== current.identity) {
        incoming.resume();
        outgoing.writeHead(409).end();
        return true;
      }
      if (incoming.url === "/changes" && incoming.method === "GET") {
        incoming.resume();
        outgoing.writeHead(200, {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-store",
        });
        // Listen before ready: the reader starts its snapshot after this frame.
        current.peers.add(outgoing);
        outgoing.write(
          JSON.stringify({ kind: "ready", identity: current.identity }) + "\n",
        );
        const heartbeat = setInterval(() => {
          if (!outgoing.write("\n")) outgoing.destroy();
        }, 15_000);
        heartbeat.unref();
        outgoing.on("close", () => {
          clearInterval(heartbeat);
          current.peers.delete(outgoing);
        });
      } else if (incoming.url === "/changed" && incoming.method === "POST") {
        let text = "";
        incoming.setEncoding("utf8");
        incoming.on("data", (chunk) => {
          text += chunk;
          if (text.length > 65_536) incoming.destroy();
        });
        incoming.on("end", () => {
          try {
            const changes = z
              .array(changeSchema)
              .max(256)
              .parse(JSON.parse(text));
            for (const change of changes) current.receive(change);
            outgoing.writeHead(200).end("{}");
          } catch {
            outgoing.writeHead(400).end();
          }
        });
      } else {
        incoming.resume();
        outgoing.writeHead(405).end();
      }
      return true;
    },
    close() {
      for (const peer of current.peers) peer.destroy();
      current.owned = false;
    },
  };
}
