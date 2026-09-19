// What Pi actually did, in the order it did it — read from Pi's own history.
//
// Pi writes a tool call to its branch before the tool runs and the tool's
// result when it returns, and keeps both through a compaction and across a
// restart. So this is derived on every read rather than kept a second time:
// there is no store here, nothing to sweep, and no way for two records of the
// same call to disagree.
//
// Two things Pi's history cannot answer, and where they come from instead:
//
//   The outcome of a call the executor owns — waiting for the owner, declined,
//   running, failed — is the execution record's, by Pi's own tool-call id.
//
//   What has streamed back from a call still in flight is the worker's, held
//   in its memory for as long as the call lasts and never written down.
//
// Redaction happens here, on the way out. Pi's history keeps what the model
// actually sent, secrets and all; nothing leaves this file unredacted.

import type { ExecutionRecord } from "./operator-execution";
import type { Transcript } from "./pi-transcript";
import { redactSecrets } from "./secrets";

/** How much of a tool's argument or result is worth keeping for a reader. */
const ARGUMENT_LIMIT = 8_000;
const RESULT_LIMIT = 20_000;
const PREVIEW_LIMIT = 20_000;

export type ActivityStatus =
  | "running"
  | "succeeded"
  | "failed"
  /** The run stopped before this call reported an end. */
  | "interrupted"
  /** The user was asked and said no, so nothing ran. */
  | "declined";

export interface ActivityRecord {
  /**
   * What this is: a tool Pi called, or something Pi said on the way. Both sit
   * in one sequence, because the reader wants the transcript, not two lists.
   */
  kind: "tool" | "message";
  /** Pi's own tool-call id: stable across start, update and end. */
  id: string;
  applicationId: string;
  /** The assistant message this call belongs to. */
  runId: string;
  /** Position within the run, so order survives any read. */
  sequence: number;
  tool: string;
  /** For a message, what Pi said at this point in the run. */
  text?: string;
  /** Redacted arguments, as Pi passed them. */
  args: string;
  /** Whatever streamed back before the call finished. */
  preview: string;
  /** Redacted final result, once there is one. */
  result: string;
  status: ActivityStatus;
  /**
   * The executor record this call produced. When set, the conversation draws
   * that card — which already knows waiting, declined, running and failed —
   * instead of a second row for the same work.
   */
  executionId?: string;
  /** True when the stored text was cut to its limit. */
  truncated: boolean;
  startedAt: string;
  finishedAt?: string;
}

/**
 * How an execution record's outcome reads as activity. The executor knows
 * things Pi's history cannot: that the owner was asked and said no, that a
 * command is still running under an approval, that it failed.
 */
const fromExecution: Record<ExecutionRecord["status"], ActivityStatus> = {
  "awaiting-approval": "running",
  running: "running",
  succeeded: "succeeded",
  failed: "failed",
  declined: "declined",
  interrupted: "interrupted",
};

/**
 * A tool result is usually `{content:[{type:"text",text}]}`. Reading the text
 * out of it keeps the record readable and, more importantly, stops the JSON
 * scaffolding being shown as if it were output.
 */
function words(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const content = (value as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const parts = content
        .map((part) =>
          part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : null,
        )
        .filter((part): part is string => part !== null);
      if (parts.length) return parts.join("");
    }
    const output = (value as { output?: unknown }).output;
    if (typeof output === "string") return output;
  }
  return safeStringify(value);
}

/** Redacts, then cuts, and says whether anything was cut. */
function keep(value: unknown, limit: number) {
  const redacted = redactSecrets(words(value)).text;
  return redacted.length > limit
    ? { text: redacted.slice(0, limit), truncated: true }
    : { text: redacted, truncated: false };
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Pi's calls and its own words, in the order Pi recorded them.
 *
 * A call with no result is one that never reported an end: it is running while
 * the reply it belongs to is being written, and interrupted otherwise — which
 * is what a reader needs to know after a restart, and keeps a call from an
 * older stopped reply from springing back to life when a new reply starts.
 */
export function activityFromTranscript(input: {
  applicationId: string;
  transcript: Transcript;
  executions: ExecutionRecord[];
}): ActivityRecord[] {
  const { applicationId, transcript } = input;
  const executionOf = new Map(
    input.executions.flatMap((record) =>
      record.toolCallId ? [[record.toolCallId, record] as const] : [],
    ),
  );
  /**
   * Whether the reply a call belongs to is the one being written now.
   *
   * Per reply, never per conversation. A call with no result under a reply
   * that was stopped or interrupted turns is finished business, and reading
   * the conversation's own status made every one of them spring back to
   * "running" the moment a later reply started.
   */
  const live = new Map(
    transcript.messages.map((message) => [
      message.id,
      message.status === "running",
    ]),
  );
  const tools: ActivityRecord[] = Object.entries(transcript.calls).map(
    ([id, call]) => {
      const execution = executionOf.get(id);
      const args = keep(call.args, ARGUMENT_LIMIT);
      const result = keep(call.result?.text, RESULT_LIMIT);
      const preview = keep(call.preview, PREVIEW_LIMIT);
      return {
        kind: "tool" as const,
        id,
        applicationId,
        runId: call.replyId,
        sequence: call.sequence,
        tool: call.tool,
        args: args.text,
        preview: preview.text,
        result: result.text,
        status: execution
          ? fromExecution[execution.status]
          : call.result
            ? call.result.failed
              ? "failed"
              : "succeeded"
            : live.get(call.replyId)
              ? "running"
              : "interrupted",
        executionId: execution?.id,
        truncated: args.truncated || result.truncated || preview.truncated,
        startedAt: call.at,
        finishedAt: call.result?.at,
      };
    },
  );
  const said: ActivityRecord[] = transcript.said.map((each) => {
    const text = keep(each.text, RESULT_LIMIT);
    return {
      kind: "message" as const,
      id: `${each.replyId}:said:${each.sequence}`,
      applicationId,
      runId: each.replyId,
      sequence: each.sequence,
      tool: "",
      text: text.text,
      args: "",
      preview: "",
      result: "",
      status: "succeeded" as const,
      truncated: text.truncated,
      startedAt: each.at,
      finishedAt: each.at,
    };
  });
  // Replies in the order Pi wrote them, and within a reply the sequence Pi
  // gave each call and each thing it said.
  const order = transcript.messages.map((message) => message.id);
  const place = (runId: string) => {
    const at = order.indexOf(runId);
    return at < 0 ? order.length : at;
  };
  return [...tools, ...said].sort(
    (a, b) => place(a.runId) - place(b.runId) || a.sequence - b.sequence,
  );
}
