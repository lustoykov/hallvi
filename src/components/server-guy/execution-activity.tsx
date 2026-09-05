import type { ActivityEvent } from "@/server/types";
import { LocalTime } from "./local-time";
import { CaretRight } from "@phosphor-icons/react";

function duration(start: string, end?: string | null) {
  if (!end) return "In progress";
  const ms = Math.max(0, Date.parse(end) - Date.parse(start));
  return ms < 1000 ? "<1s" : `${(ms / 1000).toFixed(1)}s`;
}

const outcomes = {
  queued: "Waiting for worker",
  running: "Working",
  succeeded: "Reply saved",
  failed: "Couldn’t finish",
  cancelled: "Cancelled",
  "timed-out": "Timed out",
  interrupted: "Interrupted",
};

export function ExecutionActivity({ event }: { event: ActivityEvent }) {
  const history = event.execution;
  const run = event.run;
  if (!history || !run) return null;
  const lastStep = history.steps.at(-1);
  const unsuccessful = !["queued", "running", "succeeded"].includes(run.status);
  return (
    <details className="sg-execution" id={`reply-${run.id}`}>
      <summary>
        <CaretRight className="sg-execution-caret" aria-hidden="true" />
        <span>
          <strong>{outcomes[run.status]}</strong>
          <LocalTime value={run.createdAt} />
        </span>
        <span className="sg-execution-state">
          {run.status === "running"
            ? (lastStep?.label ?? "Starting")
            : run.finishedAt
              ? duration(run.startedAt ?? run.createdAt, run.finishedAt)
              : "Queued"}
        </span>
      </summary>
      <div className="sg-execution-body">
        {run.retryOfId && (
          <p>
            Retry of an <a href={`#reply-${run.retryOfId}`}>earlier attempt</a>.
          </p>
        )}
        {unsuccessful && (
          <p className="sg-execution-warning">
            This attempt did not save a reply or requirements. Your message is
            still in the chat.
          </p>
        )}
        <p className="sg-execution-timing">
          Waiting: {duration(run.createdAt, run.startedAt ?? run.finishedAt)}
          {run.startedAt && (
            <> · Working: {duration(run.startedAt, run.finishedAt)}</>
          )}
        </p>
        <ol className="sg-execution-steps">
          {history.steps.map((step) => (
            <li key={step.id}>
              <span>
                <strong>{step.label}</strong>
                <small>
                  {step.outcome === "incomplete"
                    ? "Stopped before completion was recorded"
                    : step.outcome === "failed"
                      ? "Failed"
                      : step.outcome === "running"
                        ? "In progress"
                        : "Completed"}
                </small>
              </span>
              <span>{duration(step.startedAt, step.finishedAt)}</span>
            </li>
          ))}
        </ol>
        {!history.steps.length && (
          <p>
            {run.status === "queued"
              ? "Steps appear when the worker starts."
              : "No execution steps were recorded."}
          </p>
        )}
        {history.omitted > 0 && (
          <p>
            {history.omitted} additional steps omitted to limit diagnostic
            storage.
          </p>
        )}
        {!!history.decisionIds?.length && (
          <div className="sg-execution-links">
            {history.decisionIds.map((id, index) => (
              <a
                key={id}
                href={`/api/decisions/${id}`}
                target="_blank"
                rel="noreferrer"
              >
                Saved requirement {index + 1}
              </a>
            ))}
          </div>
        )}
        <a href={`?chat=${run.chatId}`}>View chat</a>
        <details className="sg-execution-diagnostics">
          <summary>Technical details</summary>
          <p>
            Content is omitted: no prompts, answers, tool arguments, or
            credentials. Response timings reflect SDK events, not individual
            HTTP requests. Tokens are provider-reported usage, not subscription
            charges.
          </p>
          <dl>
            <dt>Reply ID</dt>
            <dd>{run.id}</dd>
            {history.traceId && (
              <>
                <dt>Trace ID</dt>
                <dd>{history.traceId}</dd>
              </>
            )}
          </dl>
          {history.steps
            .filter((step) => Object.keys(step.metadata).length)
            .map((step) => (
              <div key={step.id}>
                <strong>{step.label}</strong>
                <dl>
                  {Object.entries(step.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          {history.traceUrl ? (
            <a href={history.traceUrl} target="_blank" rel="noreferrer">
              Open in Langfuse
            </a>
          ) : (
            <p>
              {history.exportEnabled
                ? "Langfuse export is enabled. Configure the project ID to enable trace links."
                : "Langfuse export is not configured for this reply."}
            </p>
          )}
          {history.traceUrl && (
            <p>
              Requires project access. Export is best-effort; local history is
              the source of truth. Langfuse’s estimated API costs are not
              ChatGPT subscription charges.
            </p>
          )}
        </details>
      </div>
    </details>
  );
}
