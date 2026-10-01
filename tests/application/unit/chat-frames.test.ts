import { expect, it, vi } from "vitest";
import { ChatFrames } from "../../../src/server/chat-frames";
import {
  applyChatFrame,
  keepUnchanged,
  type ChatFrame,
} from "../../../src/lib/chat-stream";
import { activityFromTranscript } from "../../../src/server/pi-activity";
import type { ChatSnapshot } from "../../../src/server/types";
import { longHistory } from "../../fixtures/long-history";
import { informationInputSchema } from "../../../src/server/operator-data";

const wire = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function history(): ChatSnapshot {
  const { transcript, executions } = longHistory("chat", "app");
  return {
    status: "idle",
    worker: { alive: true },
    messages: transcript.messages,
    executions,
    information: [],
    piActivity: activityFromTranscript({
      applicationId: "app",
      transcript,
      executions,
    }),
  };
}

it("never serializes freshly reconstructed unchanged history while finding changes", () => {
  const encoder = new ChatFrames();
  const first = wire(history());
  expect(encoder.next(first)).toBe(first);
  const equivalent = wire(first);
  const stringify = vi.spyOn(JSON, "stringify");
  try {
    expect(encoder.next(structuredClone(equivalent))).toBeUndefined();
    expect(stringify).not.toHaveBeenCalled();
  } finally {
    stringify.mockRestore();
  }
});

it("reconstructs complete evidence through streaming, approval, completion, removals and reordering", () => {
  const encoder = new ChatFrames();
  const first = wire(history());
  let client = applyChatFrame(null, wire(encoder.next(first)!));
  const oldInformation = client.information;
  const next = wire(first);
  next.status = "working";
  next.messages.at(-1)!.body += " streaming answer";
  next.messages.at(-1)!.status = "running";
  next.messages.at(-1)!.revision++;
  next.executions.at(-1)!.status = "awaiting-approval";
  next.executions.at(-1)!.approvalId = "approval";
  next.piActivity.at(-1)!.status = "running";
  next.piActivity.at(-1)!.preview = "streaming output";
  const delta = wire(encoder.next(next)!);
  expect("type" in delta).toBe(true);
  expect(delta).not.toHaveProperty("information");
  const oldMessage = client.messages[0];
  client = applyChatFrame(client, delta);
  expect(client).toEqual(next);
  expect(client.messages[0]).toBe(oldMessage);
  expect(client.information).toBe(oldInformation);
  const done = wire(next);
  done.information = [
    {
      ...informationInputSchema.parse({
        title: "Saved evidence",
        body: "Recorded check",
      }),
      id: "saved",
      applicationId: "app",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      retiredAt: null,
    },
  ];
  done.status = "idle";
  done.messages.at(-1)!.status = "completed";
  done.executions.at(-1)!.status = "succeeded";
  done.executions.at(-1)!.output = "complete recorded output";
  delete done.executions.at(-1)!.approvalId;
  done.piActivity.at(-1)!.preview = "";
  done.piActivity.at(-1)!.result = "complete recorded result";
  done.piActivity.at(-1)!.status = "succeeded";
  done.messages = done.messages.slice(1).reverse();
  done.executions = done.executions.slice(1).reverse();
  done.piActivity = done.piActivity.slice(1).reverse();
  done.worker.alive = false;
  client = applyChatFrame(client, wire(encoder.next(done)!));
  expect(client).toEqual(done);
  expect(client.executions.at(0)).not.toHaveProperty("approvalId");
  const removed = { ...done, information: [] };
  client = applyChatFrame(client, wire(encoder.next(removed)!));
  expect(client).toEqual(removed);
});

it("a reconnect replaces all state and streams retain independent baselines", () => {
  const a = new ChatFrames(),
    b = new ChatFrames();
  const first = history();
  let client = applyChatFrame(null, wire(a.next(first)!));
  expect(b.next(first)).toBe(first);
  const latest = wire(first);
  latest.messages = latest.messages.slice(-2);
  latest.executions = [];
  latest.piActivity = [];
  a.clear();
  const frame = a.next(latest)!;
  expect(frame).not.toHaveProperty("type");
  client = applyChatFrame(client, wire(frame));
  expect(client).toEqual(latest);
  expect(() => applyChatFrame(null, { type: "changes" } as ChatFrame)).toThrow(
    "initial state",
  );
});

it("full state that repeats a held conversation keeps the records it repeats", () => {
  // The page was drawn from one copy; the stream's first frame is another.
  const held = wire(history());
  const next = wire(held);
  next.messages.at(-1)!.body += " and one more sentence";
  next.executions.pop();
  const kept = keepUnchanged(held, next);
  expect(kept).toEqual(next);
  expect(kept.messages[0]).toBe(held.messages[0]);
  expect(kept.messages.at(-1)).toBe(next.messages.at(-1));
  expect(kept.executions[0]).toBe(held.executions[0]);
  expect(kept.executions).not.toBe(held.executions);
  // A list nothing changed in is the list already held.
  expect(kept.piActivity).toBe(held.piActivity);
  expect(keepUnchanged(null, next)).toBe(next);
});
