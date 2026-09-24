"use client";

// Jobs: what runs on a schedule, and how its runs have gone.
//
// A register, like Deployment and Processes. One line says how the jobs are
// doing; one table carries each job's schedule in words, its recent runs as
// ticks, the last run and the recorded next one; a row opens in place onto
// the command, the cron line and the runs. Hallvi's own recurring work is not
// the application's, so it is one link underneath to the page that owns it.
//
// A next run is recorded, never computed. Putting a cron line into words is
// describing it; working out when it next fires against a timezone the
// controller is guessing at would be a confident time that is wrong twice a
// year, and the page could not show that it guessed.

import { ArrowRight } from "@phosphor-icons/react";

import type { ApplicationSection } from "./application-sections";
import { LocalTime } from "./local-time";
import {
  Ask,
  Facts,
  Name,
  Num,
  Opened,
  Register,
  ago,
  duration,
  type Column,
} from "./register";
import type { JobLine, SupplyView } from "./supply-prototype/supply-story";

import "./jobs-page.css";

interface Run {
  id: string;
  failed: boolean;
  at: string;
}

interface Job extends JobLine {
  id: string;
  words: string;
  /** Oldest first. */
  runs: Run[];
  failed: boolean;
}

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const pad = (value: string) => value.padStart(2, "0");

/** The common cron shapes in words; anything else stays as written. */
export function cronWords(schedule: string) {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [minute, hour, day, month, weekday] = parts;
  const daily = day === "*" && month === "*";
  const number = (value: string) => /^\d+$/.test(value);
  const every = (value: string) => /^\*\/\d+$/.test(value);
  if (every(minute) && hour === "*" && daily && weekday === "*")
    return `Every ${minute.slice(2)} minutes`;
  if (number(minute) && hour === "*" && daily && weekday === "*")
    return minute === "0" ? "Every hour" : `Every hour at :${pad(minute)}`;
  if (number(minute) && every(hour) && daily && weekday === "*")
    return `Every ${hour.slice(2)} hours`;
  if (number(minute) && number(hour) && daily && weekday === "*")
    return `Every day at ${pad(hour)}:${pad(minute)}`;
  if (number(minute) && number(hour) && daily && number(weekday))
    return `${DAYS[Number(weekday) % 7]}s at ${pad(hour)}:${pad(minute)}`;
  return schedule;
}

/** "in 2 h", for a next run a record states. */
function until(at: string | null, now: number) {
  if (!at) return null;
  const minutes = Math.round((Date.parse(at) - now) / 60_000);
  if (!Number.isFinite(minutes)) return null;
  if (minutes < 1) return "any moment";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} d`;
}

function jobsOf(story: SupplyView): Job[] {
  return story.jobs.map((job) => ({
    ...job,
    id: job.name,
    words: cronWords(job.schedule),
    failed: job.last?.outcome === "failed",
    runs: story.runs
      .filter((run) => run.jobName === job.name)
      .map((run) => ({
        id: run.id,
        failed: run.outcome === "failed",
        at: run.at,
      }))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  }));
}

/** The page's one opening line. */
function headline(jobs: Job[]) {
  const failed = jobs.filter((job) => job.failed);
  if (failed.length === 1)
    return { bad: true, text: `${failed[0].name} failed its last run` };
  if (failed.length > 1)
    return { bad: true, text: `${failed.length} jobs failed their last run` };
  const ran = jobs.filter((job) => job.last).length;
  const count =
    jobs.length === 1 ? "1 scheduled job" : `${jobs.length} scheduled jobs`;
  return {
    bad: false,
    text: !ran
      ? `${count} · not run yet`
      : ran < jobs.length
        ? `${count} · ${ran} have run`
        : jobs.length === 1
          ? `${count} · its last run succeeded`
          : `${count} · every last run succeeded`,
  };
}

/** One tick per run, oldest to newest; the newest stands a little taller. */
function Ticks({ runs }: { runs: Run[] }) {
  const shown = runs.slice(-14);
  if (!shown.length) return <span className="jb-muted">none on record</span>;
  return (
    <span className="jb-ticks" aria-label={`${shown.length} recent runs`}>
      {shown.map((run, index) => (
        <i
          key={run.id}
          data-failed={run.failed || undefined}
          data-last={index === shown.length - 1 || undefined}
          title={`${run.failed ? "Failed" : "Succeeded"} · ${new Date(run.at).toLocaleString()}`}
        />
      ))}
    </span>
  );
}

function LastRun({ job, now }: { job: Job; now: number }) {
  if (job.paused) return <span className="jb-muted">paused</span>;
  if (!job.last) return <span className="jb-muted">not run yet</span>;
  return (
    <span className="jb-last" data-failed={job.failed || undefined}>
      {job.failed ? "Failed" : "Succeeded"}{" "}
      <span className="jb-muted">
        {ago(job.last.at, now)}
        {job.last.seconds ? ` · ${duration(job.last.seconds)}` : ""}
      </span>
    </span>
  );
}

function RunList({ runs }: { runs: Run[] }) {
  const newest = [...runs].reverse().slice(0, 8);
  if (!newest.length)
    return <p className="jb-muted">No run is on record yet.</p>;
  return (
    <ul className="jb-runs">
      {newest.map((run) => (
        <li key={run.id} data-failed={run.failed || undefined}>
          <span className="jb-dot" />
          <LocalTime value={run.at} variant="compact" />
          <span>{run.failed ? "Failed" : "Succeeded"}</span>
        </li>
      ))}
    </ul>
  );
}

export function JobsPage({
  story,
  now,
  head,
  onAsk,
  onOpenDestination,
}: {
  story: SupplyView;
  now: number;
  head: React.ReactNode;
  onAsk: (draft: string) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  const jobs = jobsOf(story);
  const said = headline(jobs);

  const columns: Column<Job>[] = [
    {
      key: "job",
      head: "Job",
      cell: (job) => <Name title={job.name} note={job.words} mono />,
    },
    {
      key: "runs",
      head: "Recent runs",
      width: 130,
      cell: (job) => <Ticks runs={job.runs} />,
    },
    {
      key: "last",
      head: "Last run",
      width: 180,
      cell: (job) => <LastRun job={job} now={now} />,
    },
    {
      key: "next",
      head: "Next",
      width: 100,
      align: "end",
      cell: (job) => (
        <Num>
          {job.paused ? "paused" : (until(job.nextAt, now) ?? "not recorded")}
        </Num>
      ),
    },
  ];

  return (
    <section className="jb" aria-label="Jobs">
      {head}
      {jobs.length ? (
        <>
          <p className="jb-headline">
            <span className="jb-dot" data-bad={said.bad || undefined} />
            {said.text}
          </p>
          <Register
            rows={jobs}
            columns={columns}
            label={(job) => job.name}
            tone={(job) => (job.failed ? "bad" : undefined)}
            // The job a reader came for: the one whose last run failed.
            defaultOpen={jobs.find((job) => job.failed)?.id ?? null}
            detail={(job) => (
              <Opened
                asks={
                  <Ask
                    onAsk={onAsk}
                    tone={job.failed ? "bad" : "plain"}
                    prompt={
                      job.failed
                        ? `The last run of ${job.name} failed. What did it print, and what would make it pass?`
                        : `Show me the last few runs of ${job.name} and what each printed.`
                    }
                  >
                    {job.failed ? "Why did it fail?" : "What did it print?"}
                  </Ask>
                }
              >
                <code className="jb-command">{job.command}</code>
                <div className="jb-split">
                  <Facts
                    items={[
                      {
                        label: "Schedule",
                        value: (
                          <span className="hv-rg-mono">{job.schedule}</span>
                        ),
                      },
                      { label: "Timezone", value: job.timezone },
                    ]}
                  />
                  <RunList runs={job.runs} />
                </div>
              </Opened>
            )}
          />
        </>
      ) : (
        <div className="jb-empty">
          <p>Nothing of {story.name}’s runs on a schedule yet.</p>
          <button
            type="button"
            className="jb-button"
            onClick={() =>
              onAsk(
                `What does ${story.name} run on a schedule — cron jobs, timers, anything recurring — and did each one last succeed?`,
              )
            }
          >
            Ask Hallvi to look
          </button>
        </div>
      )}
      {story.recurring.length > 0 && (
        <div className="jb-theirs">
          <span className="jb-muted">Hallvi also runs</span>
          {story.recurring.map((item) => (
            <button
              key={item.id}
              type="button"
              className="jb-theirs-item"
              onClick={() => onOpenDestination(item.where)}
              title={item.detail}
            >
              <b>{item.title}</b>
              <span className="jb-muted">{item.words.toLowerCase()}</span>
              <ArrowRight weight="bold" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
