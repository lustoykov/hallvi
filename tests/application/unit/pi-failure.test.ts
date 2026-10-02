import { expect, it } from "vitest";
import { failureText, nativeFailure } from "@/server/pi-failure";
import { projectTranscript } from "@/server/pi-transcript";

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

/** What Pi holds of a conversation, as the worker reads it. */
const held = (over: object) =>
  ({
    entries: [],
    submissions: [],
    live: {},
    inbox: { items: [] },
    tasks: 0,
    ...over,
  }) as never;
const asked = (id: number, text: string) => ({
  id,
  conversationId: 1,
  kind: "pi.user",
  model: [{ role: "user", content: [{ type: "text", text }], timestamp: id }],
});
const record = (
  id: number,
  requestId: string,
  entry: number,
  rest: object,
) => ({
  id,
  conversationId: 1,
  type: "input",
  requestId,
  entry,
  ...rest,
});

it("reads Pi's own reason when it wrote no reply, while open work stays interrupted", () => {
  const entries = [asked(6, "Check status")];
  const failed = (rest: object) =>
    projectTranscript(
      "chat",
      held({
        entries,
        submissions: [
          record(7, "request", 6, { status: "unanswered", ...rest }),
        ],
      }),
      false,
    );
  const transcript = failed({
    reason: "faulted",
    detail: "Worker dispatcher rejected the model response",
  });
  expect(transcript.messages.at(-1)).toMatchObject({
    status: "failed",
    operationId: "request",
    failure: {
      source: "runtime",
      reason: "Worker dispatcher rejected the model response",
    },
  });
  expect(transcript.operations).toMatchObject({
    request: { status: "failed" },
  });
  // Only words Pi wrote as the reason are shown, never a structure beside it.
  expect(
    JSON.stringify(
      failed({ reason: "faulted", detail: { token: "never-copy-details" } }),
    ),
  ).not.toContain("never-copy-details");
  // A model that is no longer offered is said in words, not in Pi's code.
  expect(failed({ reason: "no_model" }).messages.at(-1)?.error).toContain(
    "The selected model is not available",
  );
  const interrupted = projectTranscript(
    "chat",
    held({
      entries,
      submissions: [record(7, "request", 6, { status: "placed" })],
      live: { run: { taskId: 8, inputs: [7] } },
      tasks: 1,
    }),
    false,
  );
  expect(interrupted.status).toBe("interrupted");
  expect(interrupted.messages.at(-1)).toMatchObject({
    status: "interrupted",
    operationId: "request",
    error: expect.stringContaining("not known"),
  });
  expect(interrupted.messages.at(-1)?.failure).toBeUndefined();
});

it("an early failure stays under its request when a later request succeeds", () => {
  const read = projectTranscript(
    "chat",
    held({
      entries: [
        asked(6, "First"),
        asked(9, "Second"),
        {
          id: 11,
          conversationId: 1,
          kind: "pi.assistant",
          byTaskId: 10,
          model: [
            {
              role: "assistant",
              content: [{ type: "text", text: "Done" }],
              timestamp: 11,
              stopReason: "stop",
            },
          ],
        },
      ],
      submissions: [
        record(7, "early", 6, {
          status: "unanswered",
          reason: "faulted",
          detail: "Response rejected",
        }),
        record(10, "later", 9, { status: "done", answer: 11 }),
      ],
    }),
    false,
  );
  expect(read.messages.map((message) => [message.id, message.status])).toEqual([
    ["early", "delivered"],
    ["reply:early", "failed"],
    ["later", "delivered"],
    ["reply:later", "completed"],
  ]);
  expect(read.operations).toMatchObject({
    early: { status: "failed" },
    later: { status: "completed" },
  });
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
