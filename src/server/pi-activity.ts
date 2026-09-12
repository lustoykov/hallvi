// What Pi actually did, in the order it did it.
//
// Pi's runtime already emits a start, streaming updates and an end for every
// tool call. Until now those were consumed as anonymous progress signals, so a
// conversation could say Pi was working but never what it ran or what came
// back. This projects them into ordered records the conversation can render.
//
// Records live beside execution records on disk rather than in the message
// row, for the same reason executions do: a streaming update rewrites one
// small file instead of a JSON column and a revision bump per delta.
//
// Nothing here re-runs anything. Reading a record is reading evidence.

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";

import { piConfigDir } from "./pi-configuration";
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

function directory(applicationId: string) {
  return join(
    piConfigDir(),
    "operator",
    z.uuid().parse(applicationId),
    "activity",
  );
}

function recordPath(applicationId: string, id: string) {
  // A tool-call id comes from the runtime, so it is not trusted as a filename.
  return join(directory(applicationId), `${encodeURIComponent(id)}.json`);
}

function write(path: string, value: ActivityRecord) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}

function read(path: string): ActivityRecord | undefined {
  try {
    const record = JSON.parse(readFileSync(path, "utf8")) as ActivityRecord;
    // Records written before messages joined the transcript carry no kind.
    return record.kind ? record : { ...record, kind: "tool" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * A tool result is usually `{content:[{type:"text",text}]}`. Reading the text
 * out of it keeps the record readable and, more importantly, stops the JSON
 * scaffolding being compared and re-appended as if it were output.
 */
function words(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
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

export function startActivity(input: {
  applicationId: string;
  runId: string;
  sequence: number;
  id: string;
  tool: string;
  args: unknown;
}): ActivityRecord {
  mkdirSync(directory(input.applicationId), { recursive: true, mode: 0o700 });
  const args = keep(input.args, ARGUMENT_LIMIT);
  const record: ActivityRecord = {
    kind: "tool",
    id: input.id,
    applicationId: input.applicationId,
    runId: input.runId,
    sequence: input.sequence,
    tool: input.tool,
    args: args.text,
    preview: "",
    result: "",
    status: "running",
    truncated: args.truncated,
    startedAt: new Date().toISOString(),
  };
  write(recordPath(input.applicationId, input.id), record);
  return record;
}

/**
 * How to read what a caller handed us. Guessing between the two by comparing
 * prefixes loses data — two legitimate deltas of "tick\n" look like one
 * snapshot — so every caller states which it is sending.
 *
 * `snapshot` is everything produced so far and replaces what we hold; the
 * runtime's `partialResult` is a result-so-far, so it is always a snapshot.
 * `delta` is only the new bytes and is appended; a source that streams
 * increments says so.
 */
export type PartialMode = "snapshot" | "delta";

export function updateActivity(
  applicationId: string,
  id: string,
  partial: unknown,
  mode: PartialMode,
) {
  const path = recordPath(applicationId, id);
  const record = read(path);
  if (!record || record.status !== "running") return;
  const incoming = keep(partial, PREVIEW_LIMIT);
  const preview =
    mode === "snapshot" ? incoming.text : record.preview + incoming.text;
  if (preview === record.preview) return;
  const cut = preview.length > PREVIEW_LIMIT;
  write(path, {
    ...record,
    preview: cut ? preview.slice(-PREVIEW_LIMIT) : preview,
    truncated: record.truncated || incoming.truncated || cut,
  });
}

/** Ties a call to the record it produced, by id rather than by tool name. */
export function linkActivityExecution(
  applicationId: string,
  id: string,
  executionId: string,
) {
  const path = recordPath(applicationId, id);
  const record = read(path);
  if (!record) return;
  write(path, { ...record, executionId });
}

export function endActivity(input: {
  applicationId: string;
  id: string;
  result: unknown;
  isError: boolean;
}) {
  const path = recordPath(input.applicationId, input.id);
  const record = read(path);
  if (!record) return;
  const result = keep(input.result, RESULT_LIMIT);
  write(path, {
    ...record,
    result: result.text,
    // Executor decisions happen before the SDK completion event.
    // Keep that outcome when the SDK returns an ordinary declined result.
    status:
      record.status === "running"
        ? input.isError
          ? "failed"
          : "succeeded"
        : record.status,
    truncated: record.truncated || result.truncated,
    finishedAt: record.finishedAt ?? new Date().toISOString(),
  });
}

/**
 * A run that stopped between a call's start and its end leaves a record
 * claiming to run forever. Pass a run to settle that run's calls; pass null to
 * settle every one of them, which is what a controller does at startup — a
 * crash never reaches the worker's own cleanup, so a restart is the only place
 * some of these can be put right.
 */
export function settleRunningActivity(
  applicationId: string,
  runId: string | null,
  status: Exclude<ActivityStatus, "running"> = "interrupted",
) {
  for (const record of listActivity(applicationId))
    if (
      (runId === null || record.runId === runId) &&
      record.status === "running"
    )
      write(recordPath(applicationId, record.id), {
        ...record,
        status,
        finishedAt: new Date().toISOString(),
      });
}

/**
 * Settles one call to an outcome the runtime cannot report. A declined
 * command returns an ordinary result, so without this the record would keep
 * saying it succeeded even though nothing ran.
 */
export function settleActivity(
  applicationId: string,
  id: string,
  status: Exclude<ActivityStatus, "running">,
) {
  const path = recordPath(applicationId, id);
  const record = read(path);
  if (!record) return;
  write(path, { ...record, status, finishedAt: new Date().toISOString() });
}

/** Every application that has any activity on record. */
export function applicationsWithActivity(): string[] {
  try {
    return readdirSync(join(piConfigDir(), "operator"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * What Pi said between its tool calls. Each assistant message is kept where it
 * happened, so a reader sees the reasoning that led to the next command rather
 * than only the last paragraph.
 */
export function recordMessage(input: {
  applicationId: string;
  runId: string;
  sequence: number;
  text: string;
}) {
  const text = input.text.trim();
  if (!text) return;
  mkdirSync(directory(input.applicationId), { recursive: true, mode: 0o700 });
  const id = `${input.runId}:said:${input.sequence}`;
  const kept = keep(text, RESULT_LIMIT);
  const now = new Date().toISOString();
  write(recordPath(input.applicationId, id), {
    kind: "message",
    id,
    applicationId: input.applicationId,
    runId: input.runId,
    sequence: input.sequence,
    tool: "",
    text: kept.text,
    args: "",
    preview: "",
    result: "",
    status: "succeeded",
    truncated: kept.truncated,
    startedAt: now,
    finishedAt: now,
  });
}

export function listActivity(applicationId: string): ActivityRecord[] {
  let names: string[];
  try {
    names = readdirSync(directory(applicationId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const records = names
    .filter((name) => name.endsWith(".json"))
    .map((name) => read(join(directory(applicationId), name)))
    .filter((record): record is ActivityRecord => Boolean(record));
  // Sequence is the runtime's own counter and is the only authority on order
  // within a run; wall-clock times tie at millisecond resolution and say
  // nothing across runs. So: runs in the order they began, calls in sequence.
  const began = new Map<string, string>();
  for (const record of records) {
    const first = began.get(record.runId);
    if (!first || record.startedAt < first)
      began.set(record.runId, record.startedAt);
  }
  return records.sort(
    (a, b) =>
      (began.get(a.runId) ?? "").localeCompare(began.get(b.runId) ?? "") ||
      a.runId.localeCompare(b.runId) ||
      a.sequence - b.sequence,
  );
}
