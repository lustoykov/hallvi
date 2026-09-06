// Durable execution attempts. A conformance run is a row that exists before
// any container does and outlives every one of them: cancellation, timeout,
// failure and worker restart leave an inspectable outcome, never a green
// gate. Rows are appended per attempt; a rerun is a new row.
import { sql } from "drizzle-orm";

import {
  db,
  getConformanceRun,
  insertConformanceRun,
  listPendingConformanceRuns,
  updateConformanceRun,
  withTransaction,
} from "./db";
import { conformanceRuns } from "./db-schema";
import type {
  ConformanceExecutor,
  ExecutionOutcome,
  ExecutionPlan,
} from "./conformance-executor";
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import type {
  ConformanceCheckResult,
  ConformanceRunRecord,
  ConformanceRunStatus,
} from "./types";

export type PendingRun = Omit<
  ConformanceRunRecord,
  | "id"
  | "createdAt"
  | "status"
  | "results"
  | "summary"
  | "error"
  | "startedAt"
  | "finishedAt"
>;

/** Records a queued attempt; the worker claims it. */
export function queueConformanceRun(input: PendingRun) {
  return insertConformanceRun({
    ...input,
    status: "queued",
    results: [],
    summary: "Queued.",
    error: null,
    startedAt: null,
    finishedAt: null,
  });
}

/** Records an attempt that starts immediately in the calling process. */
export function startConformanceRun(input: PendingRun) {
  return insertConformanceRun({
    ...input,
    status: "running",
    results: [],
    summary: "Running.",
    error: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  });
}

export function claimNextConformanceRun() {
  return withTransaction(() => {
    const running = db()
      .select({ id: conformanceRuns.id })
      .from(conformanceRuns)
      .where(sql`${conformanceRuns.status} = 'running'`)
      .get();
    if (running) return null;
    const next = db()
      .select()
      .from(conformanceRuns)
      .where(sql`${conformanceRuns.status} = 'queued'`)
      .orderBy(sql`rowid`)
      .limit(1)
      .get();
    if (!next) return null;
    return updateConformanceRun(next.id, ["queued"], {
      status: "running",
      summary: "Running.",
      startedAt: new Date().toISOString(),
    });
  });
}

export function cancelConformanceRun(id: string) {
  return updateConformanceRun(id, ["queued", "running"], {
    status: "cancelled",
    summary: "Cancelled before it finished; unrun checks cannot pass.",
    finishedAt: new Date().toISOString(),
  });
}

/** On worker start: every attempt still marked running was interrupted. */
export function interruptConformanceRuns() {
  const interrupted: ConformanceRunRecord[] = [];
  for (const run of listPendingConformanceRuns())
    if (run.status === "running") {
      const updated = updateConformanceRun(run.id, ["running"], {
        status: "interrupted",
        summary:
          "The worker stopped before this attempt finished; its containers were removed.",
        error: "Interrupted by a worker restart.",
        finishedAt: new Date().toISOString(),
      });
      if (updated) interrupted.push(updated);
    }
  return interrupted;
}

function summarize(
  status: ConformanceRunStatus,
  results: ConformanceCheckResult[],
  error: string | null,
) {
  const passed = results.filter((item) => item.outcome === "passed").length;
  const failed = results.filter((item) => item.outcome === "failed");
  const skipped = results.filter((item) => item.outcome === "not-run").length;
  const notApplicable = results.filter(
    (item) => item.outcome === "not-applicable",
  ).length;
  const counts = `${passed} passed, ${failed.length} failed, ${skipped} not run, ${notApplicable} not applicable`;
  switch (status) {
    case "passed":
      return `Every required check passed (${counts}).`;
    case "failed":
      return `Failed: ${failed.map((item) => item.label).join(", ") || "see results"} (${counts}).`;
    case "cancelled":
      return `Cancelled (${counts}).`;
    case "timed-out":
      return `Timed out (${counts}).`;
    case "unavailable":
      return `${error ?? "The runner was unavailable."} (${counts}).`;
    default:
      return counts;
  }
}

/**
 * Executes one recorded attempt: the row is running, the executor runs the
 * plan, and the outcome is saved with a guard so a cancellation that won the
 * race keeps its status. The signal is aborted when the row leaves running.
 */
export async function executeConformanceRun(
  run: ConformanceRunRecord,
  executor: ConformanceExecutor,
  plan: ExecutionPlan,
  options: {
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  } = {},
) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  const poll = setInterval(() => {
    if (getConformanceRun(run.id)?.status !== "running") controller.abort();
  }, 500);
  let outcome: ExecutionOutcome;
  try {
    outcome = await executor.execute(plan, {
      signal: controller.signal,
      onProgress: (event) => {
        options.onProgress?.(`${event.step}: ${event.message}`);
        updateConformanceRun(run.id, ["running"], {
          summary: `${event.step}: ${event.message}`.slice(0, 300),
        });
      },
    });
  } finally {
    clearInterval(poll);
    options.signal?.removeEventListener("abort", stop);
  }
  const saved = updateConformanceRun(run.id, ["running"], {
    status: outcome.status,
    results: outcome.results,
    summary: summarize(outcome.status, outcome.results, outcome.error),
    error: outcome.error,
    imageDigest: outcome.imageDigest,
    configuration: plan.configuration,
    finishedAt: new Date().toISOString(),
  });
  // A cancelled row keeps its status but still receives the partial results.
  if (!saved) {
    const current = getConformanceRun(run.id);
    if (current && current.results.length === 0)
      updateConformanceRun(run.id, ["cancelled", "interrupted", "timed-out"], {
        results: outcome.results,
        imageDigest: outcome.imageDigest,
        configuration: plan.configuration,
      });
    return getConformanceRun(run.id)!;
  }
  return saved;
}

/** Whether a finished run satisfies its bindings for the given identity. */
export function runBindingsCurrent(
  run: ConformanceRunRecord,
  bindings: {
    contractId: string;
    contractVersion: number;
    acceptanceChecksId: string | null;
  },
) {
  return (
    run.contractId === bindings.contractId &&
    run.contractVersion === bindings.contractVersion &&
    run.definitionVersion === CONFORMANCE_DEFINITION.version &&
    run.acceptanceChecksId === bindings.acceptanceChecksId
  );
}
