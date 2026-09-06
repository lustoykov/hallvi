import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PiRun } from "./types";

export const MAX_DIAGNOSTIC_STEPS = 128;
export const LOG_MAX_BYTES = 1024 * 1024;
export const LOG_ARCHIVES = 3;
export const stepLabels = {
  context: "Load current app context",
  session: "Prepare conversation",
  model: "Generate response",
  search_decisions: "Look up saved requirements",
  propose_decision: "Prepare requirement",
  tool: "Execute tool",
  compaction: "Summarize earlier conversation",
  retry: "Model retry scheduled",
  save: "Validate and save reply and requirements",
} as const;
export type StepKind = keyof typeof stepLabels;
export type ExecutionSignal =
  | { type: "start"; key: string; kind: StepKind }
  | {
      type: "end";
      key: string;
      failed?: boolean;
      metadata?: Record<string, unknown>;
    };

// Selection, not redaction: arbitrary strings, raw errors, prompts, answers,
// tool arguments/results and credentials never enter diagnostic records.
export function diagnosticMetadata(input: Record<string, unknown> = {}) {
  const safe: Record<string, string | number> = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "attempt",
    "requirements",
  ])
    if (
      typeof input[key] === "number" &&
      Number.isFinite(input[key]) &&
      input[key] >= 0
    )
      safe[key] = input[key];
  for (const key of ["model", "provider"])
    if (
      typeof input[key] === "string" &&
      /^[a-zA-Z0-9._:/-]{1,100}$/.test(input[key]) &&
      !/sk-|pk-|token|secret/i.test(input[key])
    )
      safe[key] = input[key];
  return safe;
}

export type FailureCategory =
  | "authentication"
  | "rate-limit"
  | "provider-unavailable"
  | "network"
  | "storage"
  | "validation"
  | "context"
  | "history-unavailable"
  | "busy"
  | "cancelled"
  | "timed-out"
  | "interrupted"
  | "unknown";
export interface DiagnosticFailure {
  category: FailureCategory;
  httpStatus?: number;
}
const categories: FailureCategory[] = [
  "authentication",
  "rate-limit",
  "provider-unavailable",
  "network",
  "storage",
  "validation",
  "context",
  "history-unavailable",
  "busy",
  "cancelled",
  "timed-out",
  "interrupted",
  "unknown",
];

export function diagnosticFailure(error: unknown): DiagnosticFailure {
  // Only numeric status and known codes cross this boundary. Drizzle wraps
  // SQLite errors in cause; inspect at most three levels, never their messages.
  try {
    for (
      let depth = 0;
      depth < 3 && error && typeof error === "object";
      depth++
    ) {
      const e = error as {
        status?: unknown;
        statusCode?: unknown;
        code?: unknown;
        cause?: unknown;
      };
      const status = e.status ?? e.statusCode;
      if (
        typeof status === "number" &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599
      )
        return {
          category:
            status === 401 || status === 403
              ? "authentication"
              : status === 429
                ? "rate-limit"
                : status >= 500
                  ? "provider-unavailable"
                  : "unknown",
          httpStatus: status,
        };
      if (typeof e.code === "string") {
        if (e.code.startsWith("SQLITE_")) return { category: "storage" };
        if (
          [
            "ECONNRESET",
            "ECONNREFUSED",
            "ENOTFOUND",
            "ETIMEDOUT",
            "EAI_AGAIN",
          ].includes(e.code)
        )
          return { category: "network" };
      }
      error = e.cause;
    }
  } catch {
    /* Hostile accessors are unavailable diagnostics. */
  }
  return { category: "unknown" };
}

export function diagnosticLogPath() {
  const dbPath =
    process.env.SERVER_GUY_DB_PATH ??
    join(process.cwd(), ".server-guy", "server-guy.db");
  return join(
    (process.env.SERVER_GUY_LOG_DIR?.trim() || undefined) ??
      join(dirname(dbPath), "diagnostics"),
    "replies.ndjson",
  );
}

type LogEvent =
  | "reply.accepted"
  | "reply.retry"
  | "reply.claimed"
  | "reply.succeeded"
  | "reply.failed"
  | "reply.cancelled"
  | "reply.timed-out"
  | "reply.interrupted"
  | "execution.started"
  | "execution.omitted"
  | "step.started"
  | "step.finished";
interface LogDetails {
  outcome?: PiRun["status"] | "completed" | "incomplete";
  durationMs?: number;
  step?: StepKind;
  stepId?: string;
  omitted?: number;
  traceId?: string;
  spanId?: string;
  metadata?: Record<string, unknown>;
  failure?: DiagnosticFailure;
}

export function logDiagnostic(
  event: LogEvent,
  run: PiRun,
  details: LogDetails = {},
) {
  try {
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      event,
      runId: run.id,
      chatId: run.chatId,
      applicationId: run.applicationId,
    };
    if (run.retryOfId) record.retryOfId = run.retryOfId;
    if (details.outcome) record.outcome = details.outcome;
    if (details.step && details.step in stepLabels) record.step = details.step;
    if (
      details.stepId &&
      /^(context|session|save|model:\d+|tool:\d+|compaction:\d+|retry:\d+)$/.test(
        details.stepId,
      )
    )
      record.stepId = details.stepId;
    if (details.traceId && /^[a-f0-9]{32}$/.test(details.traceId))
      record.traceId = details.traceId;
    if (details.spanId && /^[a-f0-9]{16}$/.test(details.spanId))
      record.spanId = details.spanId;
    for (const key of ["durationMs", "omitted"] as const)
      if (typeof details[key] === "number" && Number.isFinite(details[key]))
        record[key] = Math.max(0, details[key]);
    if (details.metadata)
      record.metadata = diagnosticMetadata(details.metadata);
    if (details.failure) {
      record.errorCategory = categories.includes(details.failure.category)
        ? details.failure.category
        : "unknown";
      const status = details.failure.httpStatus;
      if (
        typeof status === "number" &&
        Number.isInteger(status) &&
        status >= 400 &&
        status <= 599
      )
        record.httpStatus = status;
    }
    const line = JSON.stringify(record) + "\n";
    if (Buffer.byteLength(line) > 4096) return;
    const path = diagnosticLogPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    let size = 0;
    try {
      size = statSync(path).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
    }
    if (size + Buffer.byteLength(line) > LOG_MAX_BYTES) {
      for (let i = LOG_ARCHIVES - 1; i >= 0; i--) {
        try {
          renameSync(i ? `${path}.${i}` : path, `${path}.${i + 1}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
        }
      }
    }
    // Small append-only lines; concurrent rotation can drop a diagnostic line.
    // This is bounded, best-effort operator output, never an audit database.
    appendFileSync(path, line, { mode: 0o600 });
  } catch {
    /* Disk/permission/serialization failure cannot affect a reply. */
  }
}
