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

export type ActivityStatus = "running" | "succeeded" | "failed";

export interface ActivityRecord {
  /** Pi's own tool-call id: stable across start, update and end. */
  id: string;
  applicationId: string;
  /** The assistant message this call belongs to. */
  runId: string;
  /** Position within the run, so order survives any read. */
  sequence: number;
  tool: string;
  /** Redacted arguments, as Pi passed them. */
  args: string;
  /** Whatever streamed back before the call finished. */
  preview: string;
  /** Redacted final result, once there is one. */
  result: string;
  status: ActivityStatus;
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
    return JSON.parse(readFileSync(path, "utf8")) as ActivityRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** Redacts, then cuts, and says whether anything was cut. */
function keep(value: unknown, limit: number) {
  const text = typeof value === "string" ? value : safeStringify(value);
  const redacted = redactSecrets(text).text;
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
 * Stores whatever a tool has produced so far. The runtime does not promise
 * whether a partial result is cumulative or a delta, so this keeps the longer
 * of the two readings rather than guessing and doubling the output.
 */
export function updateActivity(
  applicationId: string,
  id: string,
  partial: unknown,
) {
  const path = recordPath(applicationId, id);
  const record = read(path);
  if (!record || record.status !== "running") return;
  const incoming = keep(partial, PREVIEW_LIMIT);
  const grew = incoming.text.startsWith(record.preview);
  const preview = grew ? incoming.text : record.preview + incoming.text;
  const cut = preview.length > PREVIEW_LIMIT;
  write(path, {
    ...record,
    preview: cut ? preview.slice(-PREVIEW_LIMIT) : preview,
    truncated: record.truncated || incoming.truncated || cut,
  });
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
    status: input.isError ? "failed" : "succeeded",
    truncated: record.truncated || result.truncated,
    finishedAt: new Date().toISOString(),
  });
}

/**
 * A run interrupted between start and end leaves a record claiming to run
 * forever. Settling the run says so rather than leaving a spinner behind.
 */
export function settleRunningActivity(
  applicationId: string,
  runId: string,
  status: Exclude<ActivityStatus, "running"> = "failed",
) {
  for (const record of listActivity(applicationId))
    if (record.runId === runId && record.status === "running")
      write(recordPath(applicationId, record.id), {
        ...record,
        status,
        finishedAt: new Date().toISOString(),
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
  return names
    .filter((name) => name.endsWith(".json"))
    .map((name) => read(join(directory(applicationId), name)))
    .filter((record): record is ActivityRecord => Boolean(record))
    .sort(
      (a, b) =>
        a.startedAt.localeCompare(b.startedAt) || a.sequence - b.sequence,
    );
}
