"use client";

import { useState } from "react";

import {
  Facts,
  LinkButton,
  Pill,
  Planned,
  Possible,
  SubHeading,
  TextLink,
  When,
  type ViewProps,
} from "./bits";
import { LocalTime } from "../local-time";

const outcomeWord = {
  succeeded: "Succeeded",
  failed: "Failed",
  "timed-out": "Timed out",
  missed: "Missed",
  running: "Running",
  unknown: "Unknown",
} as const;
const outcomeTone = {
  succeeded: "ok",
  failed: "bad",
  "timed-out": "bad",
  missed: "warn",
  running: "working",
  unknown: "muted",
} as const;

function brokerName(stack: ViewProps["stack"], backend: "postgres" | "redis") {
  if (backend === "postgres") return "PostgreSQL";
  return stack.services[0]?.kind === "valkey" ? "Valkey" : "Redis";
}

/**
 * Schedules, the queue that retains work and the workers that execute it,
 * kept apart. A job shows its schedule, next run and last result; runs keep
 * the revision they ran on and their output on demand. Backlog appears only
 * when a supported integration observed it.
 */
export function JobsView(props: ViewProps) {
  const { stack, facts, now, onAction, busy } = props;
  const [openRun, setOpenRun] = useState<string | null>(null);
  const runs = facts.jobs?.runs ?? [];
  const queues = facts.jobs?.queues ?? [];
  const workers = stack.processes.filter((item) => item.role === "worker");
  const running = runs.filter((run) => run.outcome === "running");
  return (
    <>
      {stack.jobs.length ? (
        <div className="sg-job-list">
          <div className="sg-job-row sg-table-head">
            <span>Job</span>
            <span>Schedule</span>
            <span>Next run</span>
            <span>Last result</span>
          </div>
          {stack.jobs.map((job) => {
            const live = running.find((run) => run.jobName === job.name);
            return (
              <div className="sg-job-row" key={job.name}>
                <span>
                  <strong>{job.name}</strong>
                  <small>
                    <code>{job.command}</code> · runs in{" "}
                    <code>{job.runsIn}</code>
                  </small>
                  {onAction && (
                    <span className="sg-op-links sg-job-actions">
                      <LinkButton
                        disabled={
                          Boolean(live) || busy === `run-job:${job.name}`
                        }
                        onClick={() =>
                          onAction({ type: "run-job", job: job.name })
                        }
                      >
                        Run now
                      </LinkButton>
                      <LinkButton
                        disabled={busy === `pause-job:${job.name}`}
                        onClick={() =>
                          onAction({
                            type: job.paused ? "resume-job" : "pause-job",
                            job: job.name,
                          })
                        }
                      >
                        {job.paused ? "Resume" : "Pause"}
                      </LinkButton>
                    </span>
                  )}
                </span>
                <span data-label="Schedule">
                  {job.schedule}
                  <small>{job.timezone}</small>
                </span>
                <span data-label="Next run">
                  {job.paused ? (
                    <Pill tone="muted">Paused</Pill>
                  ) : live ? (
                    <Pill tone="working">Running now</Pill>
                  ) : job.nextRunAt ? (
                    <LocalTime value={job.nextRunAt} variant="compact" />
                  ) : (
                    "Not scheduled"
                  )}
                </span>
                <span data-label="Last result">
                  {job.lastRun ? (
                    <>
                      <Pill tone={outcomeTone[job.lastRun.outcome]}>
                        {outcomeWord[job.lastRun.outcome]}
                      </Pill>
                      <small>
                        <When at={job.lastRun.at} now={now} />
                        {job.lastRun.durationSeconds != null &&
                          ` · ${job.lastRun.durationSeconds}s`}
                      </small>
                    </>
                  ) : (
                    "No run yet"
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <Possible
          title="No scheduled commands"
          available={false}
          draft="Which of this application’s existing commands could run on a schedule, and what would it take to set one up?"
          onAsk={(draft) => props.onAsk(null, draft)}
        >
          Server Guy can run one of the application’s existing commands on a
          host-side schedule, reusing a schedule the application already owns
          rather than adding a second trigger. Each job would show its schedule,
          next run, last result and the conversation that set it up. Scheduled
          execution is not available yet.
        </Possible>
      )}
      {(queues.length > 0 || stack.queues.length > 0 || workers.length > 0) && (
        <>
          <SubHeading>Queued work</SubHeading>
          <Facts
            rows={[
              [
                "Queue",
                stack.queues.length ? (
                  <>
                    {stack.queues
                      .map(
                        (queue) =>
                          `${queue.library} on ${brokerName(stack, queue.backend)}`,
                      )
                      .join(" · ")}{" "}
                    ·{" "}
                    <TextLink onClick={() => props.onOpenDestination("cache")}>
                      Cache & queue
                    </TextLink>
                  </>
                ) : (
                  "Not recorded"
                ),
              ],
              [
                "Workers",
                workers.length ? (
                  <>
                    {workers.map((worker) => (
                      <code key={worker.name}>{worker.name}</code>
                    ))}{" "}
                    ·{" "}
                    <TextLink
                      onClick={() => props.onOpenDestination("processes")}
                    >
                      Processes
                    </TextLink>
                  </>
                ) : (
                  "None recorded"
                ),
              ],
              [
                "Pending work",
                queues.length && queues[0].observedAt ? (
                  <>
                    {queues[0].backlog ?? "?"} waiting
                    {queues[0].oldestWaitingSeconds != null &&
                      ` · oldest ${Math.round(queues[0].oldestWaitingSeconds / 60)} min`}
                    {queues[0].failedLastHour != null &&
                      ` · ${queues[0].failedLastHour} failed in the last hour`}
                    <small className="sg-fact-note">
                      Observed <When at={queues[0].observedAt} now={now} />{" "}
                      through the application’s queue library
                    </small>
                  </>
                ) : (
                  "Not measured · needs a supported queue integration"
                ),
              ],
            ]}
          />
        </>
      )}
      {runs.length > 0 && (
        <>
          <SubHeading>Recent runs</SubHeading>
          <ol className="sg-runs">
            {runs.slice(0, 8).map((run) => (
              <li key={run.id}>
                <div className="sg-run-head">
                  <Pill tone={outcomeTone[run.outcome]}>
                    {outcomeWord[run.outcome]}
                  </Pill>
                  <strong>{run.jobName}</strong>
                  <span className="sg-op-muted">
                    {run.trigger === "run-now" ? "run now" : "scheduled"} ·
                    revision <code>{run.revision.slice(0, 12)}</code>
                    {run.durationSeconds != null &&
                      ` · ${run.durationSeconds}s`}
                  </span>
                  <span className="sg-op-rel">
                    <When at={run.startedAt} now={now} />
                  </span>
                </div>
                {run.output && (
                  <>
                    <button
                      type="button"
                      className="sg-op-text-link"
                      onClick={() =>
                        setOpenRun((current) =>
                          current === run.id ? null : run.id,
                        )
                      }
                    >
                      {openRun === run.id ? "Hide output" : "Show output"}
                    </button>
                    {openRun === run.id && (
                      <pre className="sg-run-output">{run.output}</pre>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {stack.jobs.length > 0 && !onAction && (
        <Planned title="Run now, pause and run history">
          Scheduled commands run on the host without the controller. Run now,
          pause and resume, retained run logs and missed-run detection are not
          implemented yet; change a schedule in conversation.
        </Planned>
      )}
      {stack.jobs.length > 0 && onAction && (
        <p className="sg-section-note">
          Runs never overlap: Run now waits for a scheduled run to finish and a
          skipped occurrence is recorded. Output is bounded and redacted. Change
          a schedule in conversation; the old trigger is replaced, not
          duplicated.
        </p>
      )}
    </>
  );
}
