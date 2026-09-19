// What a reader is told Pi did, derived from Pi's own history. These assert
// the parts a reader depends on: order, honest status, redaction on the way
// out, and that a run nobody is driving never leaves a row claiming to still
// be running.

import { expect, it } from "vitest";

import { activityFromTranscript } from "@/server/pi-activity";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { Transcript, TranscriptCall } from "@/server/pi-transcript";
import type { ChatMessage } from "@/server/types";

const APPLICATION = "11111111-2222-4333-8444-555555555555";
const REPLY = "reply:asked";
const AT = "2026-09-20T08:00:00.000Z";

const reply = (id = REPLY): ChatMessage => ({
  id,
  chatId: "chat",
  role: "assistant",
  body: "",
  source: "pi",
  status: "completed",
  createdAt: AT,
  revision: 0,
});

function transcript(
  calls: Record<string, Partial<TranscriptCall>>,
  extra: Partial<Transcript> = {},
): Transcript {
  return {
    status: "idle",
    messages: [reply()],
    said: [],
    ...extra,
    calls: Object.fromEntries(
      Object.entries(calls).map(([id, call], index) => [
        id,
        {
          replyId: REPLY,
          sequence: index + 1,
          tool: "server_bash",
          args: {},
          at: AT,
          ...call,
        } satisfies TranscriptCall,
      ]),
    ),
  };
}

const read = (value: Transcript, executions: Partial<ExecutionRecord>[] = []) =>
  activityFromTranscript({
    applicationId: APPLICATION,
    transcript: value,
    executions: executions as ExecutionRecord[],
  });

it("keeps a call in order, with what went in and what came back", () => {
  const rows = read(
    transcript(
      {
        first: { args: { command: "uptime" }, sequence: 1 },
        second: {
          sequence: 3,
          tool: "read",
          result: { text: "the file", failed: false, at: AT },
        },
      },
      { said: [{ replyId: REPLY, sequence: 2, text: "Looking.", at: AT }] },
    ),
  );
  expect(
    rows.map((row) => [row.sequence, row.kind, row.text ?? row.tool]),
  ).toEqual([
    [1, "tool", "server_bash"],
    [2, "message", "Looking."],
    [3, "tool", "read"],
  ]);
  expect(rows[0]).toMatchObject({
    args: '{\n  "command": "uptime"\n}',
    status: "interrupted",
  });
  expect(rows[2]).toMatchObject({ result: "the file", status: "succeeded" });
});

it("says a call failed when Pi's own result says it failed", () => {
  const [row] = read(
    transcript({
      call: { result: { text: "no such host", failed: true, at: AT } },
    }),
  );
  expect(row).toMatchObject({ status: "failed", result: "no such host" });
});

it("reads a call with no result as running while Pi is working", () => {
  const [row] = read(transcript({ call: {} }, { status: "working" }));
  expect(row.status).toBe("running");
});

it("reads a call with no result as interrupted once nobody is driving", () => {
  // The worker went away mid-call: Pi wrote the call and never a result.
  const [row] = read(transcript({ call: {} }, { status: "interrupted" }));
  expect(row).toMatchObject({ status: "interrupted", finishedAt: undefined });
});

it("takes the outcome from the execution record when there is one", () => {
  // A declined command returns an ordinary result to the runtime, so Pi's
  // history says it came back. Only the executor knows nothing ran.
  const rows = read(
    transcript({
      call: { result: { text: '{"declined":true}', failed: false, at: AT } },
    }),
    [{ id: "exec-1", toolCallId: "call", status: "declined" }],
  );
  expect(rows[0]).toMatchObject({ status: "declined", executionId: "exec-1" });
});

it("reads an approval still waiting as work in progress", () => {
  const rows = read(transcript({ call: {} }), [
    { id: "exec-1", toolCallId: "call", status: "awaiting-approval" },
  ]);
  expect(rows[0]).toMatchObject({ status: "running", executionId: "exec-1" });
});

it("never hands out a secret Pi kept, and says when it cut", () => {
  const rows = read(
    transcript({
      call: {
        args: { token: "ghp_livesecrettoken0123456789abcdefghij" },
        result: { text: "x".repeat(20_001), failed: false, at: AT },
      },
    }),
  );
  expect(rows[0].args).not.toContain("ghp_live");
  expect(rows[0].args).toContain("[REDACTED]");
  expect(rows[0].result).toHaveLength(20_000);
  expect(rows[0].truncated).toBe(true);
});

it("reads the text out of a runtime result object", () => {
  const [row] = read(
    transcript({
      call: {
        result: {
          text: JSON.stringify({ content: [{ type: "text", text: "said" }] }),
          failed: false,
          at: AT,
        },
      },
    }),
  );
  // The result arrives as Pi's own text; scaffolding it still carries is read
  // through rather than printed at the reader.
  expect(row.result).toContain("said");
});

it("carries what a call in flight has streamed back", () => {
  const [row] = read(
    transcript({ call: { preview: "line one\n" } }, { status: "working" }),
  );
  expect(row).toMatchObject({ preview: "line one\n", status: "running" });
});

it("orders replies as the transcript does, whatever the clock did", () => {
  const rows = read({
    status: "idle",
    messages: [reply("reply:first"), reply("reply:second")],
    said: [],
    calls: {
      later: {
        replyId: "reply:first",
        sequence: 1,
        tool: "read",
        args: {},
        at: "2026-09-20T09:00:00.000Z",
      },
      earlier: {
        replyId: "reply:second",
        sequence: 1,
        tool: "read",
        args: {},
        at: "2026-09-20T08:00:00.000Z",
      },
    },
  });
  expect(rows.map((row) => row.id)).toEqual(["later", "earlier"]);
});

it("has nothing to say about a conversation with no calls", () => {
  expect(read(transcript({}))).toEqual([]);
});
