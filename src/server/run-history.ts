import { eq } from "drizzle-orm";
import { db, withTransaction } from "./db";
import { activityEvents, piRuns } from "./db-schema";
import type { ExecutionHistory, ExecutionStep, PiRun } from "./types";

// One Activity row per reply, not per token. The Run remains the authority for
// status; this bounded payload records meaningful execution steps only.
export const MAX_EXECUTION_STEPS = 128;
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
export type ActivitySignal =
  | { type: "start"; key: string; kind: StepKind }
  | {
      type: "end";
      key: string;
      failed?: boolean;
      metadata?: Record<string, unknown>;
    };

// A selection policy, not a best-effort secret regex. Raw errors, arguments,
// outputs, messages, headers and arbitrary attributes cannot cross this
// boundary.
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

export function createRunHistory(run: PiRun) {
  db()
    .insert(activityEvents)
    .values({
      id: run.id,
      workspaceId: run.workspaceId,
      kind: "chat-execution",
      summary: "Assistant reply",
      detail: JSON.stringify({ steps: [], omitted: 0 }),
      createdAt: run.createdAt,
    })
    .run();
}

export function updateRunHistory(
  id: string,
  update: (history: ExecutionHistory) => void,
) {
  return withTransaction(() => {
    const event = db()
      .select()
      .from(activityEvents)
      .where(eq(activityEvents.id, id))
      .get();
    if (!event || event.kind !== "chat-execution") return;
    const history = JSON.parse(event.detail) as ExecutionHistory;
    update(history);
    db()
      .update(activityEvents)
      .set({ detail: JSON.stringify(history) })
      .where(eq(activityEvents.id, id))
      .run();
  });
}

export function startHistoryStep(
  id: string,
  key: string,
  kind: StepKind,
  spanId?: string,
) {
  let added = false;
  updateRunHistory(id, (history) => {
    const run = db().select().from(piRuns).where(eq(piRuns.id, id)).get();
    if (
      run?.status !== "running" ||
      history.steps.some((step) => step.id === key)
    )
      return;
    if (history.steps.length >= MAX_EXECUTION_STEPS) {
      history.omitted++;
      return;
    }
    history.steps.push({
      id: key,
      label: stepLabels[kind],
      startedAt: new Date().toISOString(),
      outcome: "running",
      metadata: {},
      spanId,
    });
    added = true;
  });
  return added;
}

export function endHistoryStep(
  id: string,
  key: string,
  outcome: ExecutionStep["outcome"],
  metadata?: Record<string, unknown>,
) {
  updateRunHistory(id, (history) => {
    const step = history.steps.find((step) => step.id === key);
    if (!step || step.outcome !== "running") return;
    step.outcome = outcome;
    step.finishedAt = new Date().toISOString();
    step.metadata = diagnosticMetadata(metadata);
  });
}

export function closeRunHistory(id: string) {
  updateRunHistory(id, (history) => {
    for (const step of history.steps)
      if (step.outcome === "running") {
        step.outcome = "incomplete";
        step.finishedAt = new Date().toISOString();
      }
  });
}
