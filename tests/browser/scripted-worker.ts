import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";

import { workerSocketPath } from "../../scripts/worker-socket.mjs";
import type { Transcript } from "../../src/server/pi-transcript";
import { ownChangeNotifications } from "../../src/server/change-notifications";

/**
 * Stand in for the worker on its own socket, answering with a transcript the
 * spec writes. What these journeys check is the page: the app reads the
 * transcript over the real socket, places the evidence on disk into it, and
 * draws it. Needs `scriptedWorker`: the fixture's real worker is stopped.
 */
export async function scriptWorker(
  fixture: { state: string },
  transcript: () => Transcript,
  onSend?: (body: {
    scope: { applicationId: string; chatId: string };
    message: { id: string; body: string; delivery: string };
  }) => void,
) {
  const hand = JSON.parse(
    readFileSync(join(dirname(fixture.state), "worker.json"), "utf8"),
  ) as { pid: number };
  try {
    process.kill(hand.pid, "SIGKILL");
  } catch {
    // Already gone: an earlier journey in this worker scripted it too.
  }
  const path = workerSocketPath(join(fixture.state, "qa.db"));
  const changes = ownChangeNotifications({
    database: join(fixture.state, "qa.db"),
    config: fixture.state,
  });
  let transcriptReads = 0;
  let subscriptions = 0;
  let activeSubscriptions = 0;
  let relays = 0;
  const server = createServer((incoming, outgoing) => {
    if (incoming.url === "/changes") {
      subscriptions++;
      activeSubscriptions++;
      outgoing.on("close", () => activeSubscriptions--);
    }
    if (incoming.url === "/changed") relays++;
    if (changes.handle(incoming, outgoing)) return;
    let body = "";
    incoming.on("data", (chunk) => {
      body += chunk.toString();
    });
    incoming.on("end", () => {
      if (incoming.url === "/send") onSend?.(JSON.parse(body));
      if (incoming.url === "/transcript") transcriptReads++;
      outgoing.writeHead(200, { "Content-Type": "application/json" });
      outgoing.end(
        JSON.stringify(incoming.url === "/transcript" ? transcript() : {}),
      );
    });
  });
  for (let attempt = 0; ; attempt++) {
    rmSync(path, { force: true });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(path, resolve);
      });
      break;
    } catch (error) {
      if (attempt > 20) throw error;
      await new Promise((wait) => setTimeout(wait, 100));
    }
  }
  return Object.assign(
    () =>
      new Promise<void>((done) => {
        changes.close();
        server.closeAllConnections();
        server.close(() => done());
      }),
    {
      changed: changes.notify,
      reads: () => transcriptReads,
      connections: () => subscriptions,
      subscribers: () => activeSubscriptions,
      relays: () => relays,
    },
  );
}

/** One time for everything scripted: a transcript at rest does not change. */
export const scriptedAt = new Date().toISOString();

/** One owner's message and the reply Pi is writing, or wrote, under it. */
export function exchange(
  chatId: string,
  asked: string,
  reply: { body: string; status: "running" | "completed"; startedAt?: string },
) {
  const now = scriptedAt;
  const replyId = "reply:asked";
  return {
    replyId,
    messages: [
      {
        id: "asked",
        requestKey: "asked",
        chatId,
        role: "user" as const,
        body: asked,
        source: "user" as const,
        status: "delivered" as const,
        createdAt: now,
        revision: 0,
      },
      {
        id: replyId,
        chatId,
        role: "assistant" as const,
        body: reply.body,
        source: "pi" as const,
        status: reply.status,
        createdAt: reply.startedAt ?? now,
        startedAt: reply.startedAt ?? now,
        finishedAt: reply.status === "completed" ? now : null,
        responseTo: "asked",
        revision: 0,
      },
    ],
  };
}
