import { expect, it } from "vitest";
import { failureText, nativeFailure } from "@/server/pi-failure";
import { projectTranscript, MESSAGE_TAG } from "@/server/pi-transcript";

it("keeps a useful reason while omitting secrets, payloads, URLs, paths and stacks before bounding it", () => {
  const failure = nativeFailure(
    "model",
    'HTTP 400 context window exceeded; ghp_testsecrettoken0123456789abcdef; app-credential; Authorization: Bearer opaque-value; /Users/private/account.json; https://example.test/api?token=opaque-query; response body {"prompt":"private instruction"}\n at worker (/Users/private/source.ts)',
    (text) => text.replaceAll("app-credential", "[REDACTED]"),
  );
  expect(failure.reason).toContain("HTTP 400 context window exceeded");
  for (const privateText of [
    "ghp_",
    "app-credential",
    "opaque-value",
    "opaque-query",
    "/Users",
    "private instruction",
    " at worker",
  ])
    expect(failure.reason).not.toContain(privateText);
  expect(failure.category).toBe("unknown");
  expect(failureText(failure)).not.toMatch(
    /outage|could not be reached|Settings/,
  );
  expect(
    nativeFailure("model", "x".repeat(600), (text) => text).reason?.length,
  ).toBe(400);
  // OpenRouter's spent balance says what to do about it, not "try again".
  const credit = nativeFailure(
    "model",
    "402 This request requires more credits, or fewer max_tokens.",
    (text) => text,
  );
  expect(credit.category).toBe("credit");
  expect(failureText(credit)).toContain("Add credit on openrouter.ai");
  const missing = nativeFailure("model", undefined, (text) => text);
  expect(missing.reason).toBeNull();
  expect(failureText(missing)).toContain("without recording a reason");
  expect(
    nativeFailure("model", '{"request":{"prompt":"private"}}', (text) => text)
      .reason,
  ).toBeNull();
});

it("reads a native terminal runtime error when Pi wrote no assistant message, while open work stays interrupted", () => {
  const history = [
    {
      type: "message",
      id: "entry-user",
      timestamp: 1,
      message: {
        role: "user",
        content: [{ type: "text", text: "Check status" }],
        timestamp: 1,
        [MESSAGE_TAG]: "request",
      },
    },
  ];
  const result = {
    operationId: "request",
    kind: "run",
    status: "failed",
    fromTipId: null,
    tipId: "entry-user",
    startedAt: 1,
    endedAt: 2,
    error: {
      code: "runtime_error",
      message: "Worker dispatcher rejected the model response",
      details: { token: "never-copy-details" },
    },
  };
  const transcript = projectTranscript(
    "chat",
    history as never,
    [result] as never,
    { operation: null, queues: [] },
    false,
  );
  expect(transcript.messages.at(-1)).toMatchObject({
    status: "failed",
    operationId: "request",
    failure: {
      source: "runtime",
      reason: "Worker dispatcher rejected the model response",
    },
  });
  expect(JSON.stringify(transcript)).not.toContain("never-copy-details");
  const unknown = projectTranscript(
    "chat",
    history as never,
    [{ ...result, error: undefined }] as never,
    { operation: null, queues: [] },
    false,
  );
  expect(unknown.messages.at(-1)?.failure).toEqual({
    source: "runtime",
    category: "unknown",
    reason: null,
  });
  expect(unknown.messages.at(-1)?.error).toContain(
    "Pi stopped without recording a reason",
  );
  const interrupted = projectTranscript(
    "chat",
    history as never,
    [],
    { operation: { id: "request", startedAt: 1, fromTipId: null }, queues: [] },
    false,
  );
  expect(interrupted.messages.at(-1)).toMatchObject({
    status: "interrupted",
    error: expect.stringContaining("not known"),
  });
  expect(interrupted.messages.at(-1)?.failure).toBeUndefined();
});

it("an early runtime failure stays under its request when a later request succeeds", () => {
  const history = [
    {
      type: "message",
      id: "first",
      timestamp: 1,
      message: {
        role: "user",
        content: "First",
        timestamp: 1,
        [MESSAGE_TAG]: "early",
      },
    },
    {
      type: "message",
      id: "second",
      timestamp: 3,
      message: {
        role: "user",
        content: "Second",
        timestamp: 3,
        [MESSAGE_TAG]: "later",
      },
    },
    {
      type: "message",
      id: "answer",
      timestamp: 4,
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Done" }],
        timestamp: 4,
        stopReason: "stop",
      },
    },
  ];
  const results = [
    {
      operationId: "early",
      kind: "run",
      status: "failed",
      fromTipId: null,
      tipId: "first",
      startedAt: 1,
      endedAt: 2,
      error: { code: "dispatcher_error", message: "Response rejected" },
    },
    {
      operationId: "later",
      kind: "run",
      status: "completed",
      fromTipId: "first",
      tipId: "answer",
      startedAt: 3,
      endedAt: 4,
    },
  ];
  const read = projectTranscript(
    "chat",
    history as never,
    results as never,
    { operation: null, queues: [] },
    false,
  );
  expect(read.messages.map((message) => [message.id, message.status])).toEqual([
    ["early", "delivered"],
    ["reply:early", "failed"],
    ["later", "delivered"],
    ["reply:later", "completed"],
  ]);
});

it("omits Unix account paths with Unicode, spaces, home shorthand or one component", () => {
  for (const path of [
    "/tmp/用户/profile.json",
    "/secret.json",
    "/Users/alice/Library/Application Support/Hallvi/account.json",
    "~/Library/Application Support/Hallvi/account.json",
    '\"/Users/alice/Library/Application Support/Hallvi/account.json\"',
  ]) {
    const read = nativeFailure(
      "runtime",
      `HTTP 400 unsupported response: ${path}; later information`,
      (text) => text,
    );
    expect(read.reason).toBe(
      "HTTP 400 unsupported response: [path omitted]; later information",
    );
  }
});
