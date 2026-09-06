"use client";

import { CaretRight } from "@phosphor-icons/react";

import type { ExecutionHistory, ExecutionStep, PiRun } from "@/server/types";

function duration(start: string, end: string) {
  const ms = Math.max(0, Date.parse(end) - Date.parse(start));
  return ms < 1000 ? "<1s" : `${(ms / 1000).toFixed(1)}s`;
}

const OUTCOMES: Record<PiRun["status"], string> = {
  queued: "Waiting to start",
  running: "Working",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  "timed-out": "Timed out",
  interrupted: "Interrupted",
};

const STEP_OUTCOMES: Record<ExecutionStep["outcome"], string> = {
  running: "In progress",
  completed: "Completed",
  failed: "Failed",
  incomplete: "Not completed",
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * How Server Guy produced one reply: queue and work time, recorded steps,
 * retry lineage, saved-requirement links and optional trace metadata. It sits
 * with its Chat reply, collapsed by default. This is diagnostic detail, not an
 * application Activity Event; the Run stays the authority for the outcome.
 */
export function ReplyExecution({
  run,
  execution,
}: {
  run: PiRun;
  execution?: ExecutionHistory;
}) {
  const steps = execution?.steps ?? [];
  const lastStep = steps.at(-1);
  // The Run's status is authoritative; timestamps only describe it.
  const inProgress = run.status === "queued" || run.status === "running";
  const succeeded = run.status === "succeeded";
  const unsuccessful = !inProgress && !succeeded;
  const savedCount = execution?.decisionIds?.length ?? 0;
  const worked =
    !inProgress && run.startedAt && run.finishedAt
      ? duration(run.startedAt, run.finishedAt)
      : null;
  const state =
    run.status === "queued"
      ? OUTCOMES.queued
      : run.status === "running"
        ? `${lastStep?.label ?? "Starting"}…`
        : [
            worked
              ? `${OUTCOMES[run.status]} ${succeeded ? "in" : "after"} ${worked}`
              : `${OUTCOMES[run.status]} before the reply started`,
            steps.length ? plural(steps.length, "step") : null,
          ]
            .filter(Boolean)
            .join(" · ");
  const timing =
    run.status === "queued"
      ? "Waiting to start"
      : run.status === "running"
        ? `Waited ${duration(run.createdAt, run.startedAt ?? run.createdAt)} to start · Working now`
        : run.startedAt && worked
          ? `Waited ${duration(run.createdAt, run.startedAt)} to start · Worked ${worked}`
          : `Waited ${duration(run.createdAt, run.finishedAt ?? run.createdAt)}; the reply never started`;
  const diagnostics = steps.filter((step) => Object.keys(step.metadata).length);

  return (
    <details className="sg-execution" id={`reply-${run.id}`}>
      <summary>
        <CaretRight className="sg-execution-caret" aria-hidden="true" />
        <span>Reply details</span>
        <span className="sg-execution-state">{state}</span>
      </summary>
      <div className="sg-execution-body">
        {run.retryOfId && (
          <p>
            Retry of an <a href={`#reply-${run.retryOfId}`}>earlier attempt</a>.
          </p>
        )}
        <p className="sg-execution-timing">{timing}</p>
        {succeeded && (
          <p className="sg-execution-result">
            Reply saved ·{" "}
            {savedCount
              ? `${plural(savedCount, "requirement")} saved`
              : "no requirements saved"}
          </p>
        )}
        {unsuccessful && (
          <p className="sg-execution-warning">
            Nothing was saved from this attempt. Any draft shown above is
            unfinished text, not a saved reply.
          </p>
        )}
        {steps.length ? (
          <ol className="sg-execution-steps">
            {steps.map((step) => (
              <li className={step.outcome} key={step.id}>
                <span>{step.label}</span>
                <small>{STEP_OUTCOMES[step.outcome]}</small>
                <span>
                  {step.finishedAt
                    ? duration(step.startedAt, step.finishedAt)
                    : ""}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p>
            {run.status === "queued"
              ? "Steps appear when the reply starts."
              : "No execution steps were recorded."}
          </p>
        )}
        {execution && execution.omitted > 0 && (
          <p>
            {plural(execution.omitted, "later step")} not stored, to bound
            diagnostic storage.
          </p>
        )}
        {!!execution?.decisionIds?.length && (
          <div className="sg-execution-links">
            {execution.decisionIds.map((id, index) => (
              <a
                href={`/api/decisions/${id}`}
                key={id}
                rel="noreferrer"
                target="_blank"
              >
                Saved requirement {index + 1}
              </a>
            ))}
          </div>
        )}
        <details className="sg-execution-diagnostics">
          <summary>Technical details</summary>
          <p>
            Content is omitted: no prompts, answers, tool arguments or
            credentials. Timings come from SDK events, not individual HTTP
            requests. Tokens are provider-reported usage, not subscription
            charges.
          </p>
          <dl>
            <div>
              <dt>Reply ID</dt>
              <dd>{run.id}</dd>
            </div>
            {execution?.exportEnabled && execution.traceId && (
              <div>
                <dt>Trace ID</dt>
                <dd>{execution.traceId}</dd>
              </div>
            )}
            {diagnostics.map((step) => (
              <div key={step.id}>
                <dt>{step.label}</dt>
                <dd>
                  {Object.entries(step.metadata)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ")}
                </dd>
              </div>
            ))}
          </dl>
          {execution?.traceUrl ? (
            <p>
              <a href={execution.traceUrl} rel="noreferrer" target="_blank">
                Open in Langfuse
              </a>{" "}
              · Requires project access. Export is best-effort; this local
              history is the source of truth. Langfuse’s estimated API costs are
              not ChatGPT subscription charges.
            </p>
          ) : (
            <p>
              {execution?.exportEnabled
                ? "Langfuse export is enabled. Set LANGFUSE_PROJECT_ID to enable trace links."
                : "Langfuse export is not configured for this reply. Local history is complete without it."}
            </p>
          )}
        </details>
      </div>
    </details>
  );
}
