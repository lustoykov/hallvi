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

/**
 * Stand in for the worker on its own socket, answering with a transcript the
 * spec writes. What these journeys check is the page: the app reads the
 * transcript over the real socket, places the evidence on disk into it, and
 * draws it. Needs `isolatedApp`, because the fixture's real worker is stopped.
 */
export async function scriptWorker(
  fixture: { state: string },
  transcript: () => Transcript,
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
  const server = createServer((incoming, outgoing) => {
    incoming.resume();
    incoming.on("end", () => {
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
  return () => new Promise((done) => server.close(done));
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

/**
 * The record the worker writes when Pi calls a tool, under Pi's id for the
 * call. It is what ties an execution record to its place in the transcript.
 */
export function seedToolCall(
  fixture: { state: string },
  call: {
    applicationId: string;
    chatId: string;
    toolCallId: string;
    tool: string;
    executionId?: string;
    status?: "running" | "succeeded";
  },
) {
  const directory = join(
    fixture.state,
    "operator",
    call.applicationId,
    "activity",
  );
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${call.toolCallId}.json`);
  const now = new Date().toISOString();
  writeFileSync(
    `${path}.tmp`,
    JSON.stringify({
      kind: "tool",
      id: call.toolCallId,
      applicationId: call.applicationId,
      runId: call.chatId,
      sequence: 1,
      tool: call.tool,
      args: "{}",
      preview: "",
      result: "",
      status: call.status ?? "running",
      executionId: call.executionId,
      truncated: false,
      startedAt: now,
    }),
  );
  renameSync(`${path}.tmp`, path);
}
