"use client";

// PROTOTYPE · opus-ui-improvements · Jobs.
// Rota: what recurs on this server, kept in two columns — the application's
// own scheduled commands, and Hallvi's. For most records the first is
// empty, and the honest thing is to draw the shape a job would take rather
// than an empty state: the fields it would carry, dashed, beside the one
// thing that really does recur here.

import { ChatCircleText, Repeat } from "@phosphor-icons/react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { listed } from "../backup-prototype/model";
import type { SupplyProps } from "./supply-story";
import { ago, when } from "./supply-model";
import "./rota.css";

const outcomeWord: Record<string, string> = {
  succeeded: "Succeeded",
  failed: "Failed",
  "timed-out": "Timed out",
  missed: "Missed",
  running: "Running",
  unknown: "Unknown",
};

export function RotaDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: SupplyProps) {
  const mine = story.jobs;
  const troubled = mine.filter(
    (job) => job.last && job.last.outcome !== "succeeded",
  );

  return (
    <section className="axro" aria-label="Jobs">
      {head}
      {activity}
      <div className="axro-lede">
        <div>
          <h2>
            {mine.length
              ? troubled.length
                ? `${listed(troubled.map((job) => job.name))} did not succeed.`
                : `${mine.length === 1 ? "One command of yours runs" : `${mine.length} commands of yours run`} on a schedule.`
              : `Nothing of ${story.name}’s runs on a schedule.`}
          </h2>
          <p>
            <Tag
              tone={
                troubled.length
                  ? "failed"
                  : mine.length
                    ? "verified"
                    : "planned"
              }
            >
              {mine.length
                ? `${mine.length} scheduled command${mine.length === 1 ? "" : "s"}`
                : "None of yours"}
            </Tag>
            <span>
              {story.recurring.length
                ? `One thing does recur on this server, and it is Hallvi’s own: ${story.recurring[0].words.toLowerCase()}.`
                : "Nothing recurs on this server at all, not even a backup."}{" "}
              Scheduled execution of your own commands is not implemented yet.
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axro-ask"
          onClick={() =>
            onAsk(
              mine.length
                ? `Show me the last runs of ${mine[0].name} and whether any were missed.`
                : `Which of ${story.name}’s existing commands would be worth running on a schedule, and what would it take?`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {mine.length ? "Ask about the runs" : "Ask what could be scheduled"}
        </button>
      </div>

      <div className="axro-cols">
        <section className="axro-col" aria-label="Yours">
          <h3>Yours</h3>
          {mine.length ? (
            mine.map((job) => (
              <article className="axro-job" key={job.name}>
                <header>
                  <b>{job.name}</b>
                  <Tag
                    tone={
                      job.paused
                        ? "planned"
                        : job.last?.outcome === "succeeded"
                          ? "verified"
                          : job.last
                            ? "failed"
                            : "planned"
                    }
                  >
                    {job.paused
                      ? "Paused"
                      : job.last
                        ? outcomeWord[job.last.outcome]
                        : "No run yet"}
                  </Tag>
                </header>
                <code>{job.command}</code>
                <dl className="ax-facts axro-facts">
                  <div>
                    <dt>Runs</dt>
                    <dd>
                      {job.schedule} · {job.timezone}
                    </dd>
                  </div>
                  <div>
                    <dt>Next</dt>
                    <dd>
                      {job.paused
                        ? "Not while paused"
                        : job.nextAt
                          ? when(job.nextAt)
                          : "Not scheduled"}
                    </dd>
                  </div>
                  <div>
                    <dt>Last</dt>
                    <dd>
                      {job.last
                        ? `${outcomeWord[job.last.outcome]} ${ago(job.last.at, now)}${
                            job.last.seconds ? ` · ${job.last.seconds}s` : ""
                          }`
                        : "Never run"}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          ) : (
            // The shape a job would take, drawn where it would go.
            <article
              className="axro-job axro-ghost"
              aria-label="What a job would carry"
            >
              <header>
                <b>A command of yours</b>
                <span>not set up</span>
              </header>
              <code>the command the application already owns</code>
              <dl className="ax-facts axro-facts">
                <div>
                  <dt>Runs</dt>
                  <dd>a schedule you name, in your timezone</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>the next time it would run</dd>
                </div>
                <div>
                  <dt>Last</dt>
                  <dd>how it went, and for how long</dd>
                </div>
              </dl>
              <p>
                Hallvi would reuse a command the application already has rather
                than adding a second way to trigger it, and runs would never
                overlap: a run that is still going holds the next one back, and
                the skipped occurrence is recorded.
              </p>
            </article>
          )}
        </section>

        <section className="axro-col" aria-label="Hallvi’s">
          <h3>Hallvi’s</h3>
          {story.recurring.length ? (
            story.recurring.map((item) => (
              <article className="axro-job axro-theirs" key={item.id}>
                <header>
                  <b>{item.title}</b>
                  <Tag tone="verified">{item.words}</Tag>
                </header>
                <p>{item.detail}</p>
                <dl className="ax-facts axro-facts">
                  <div>
                    <dt>Set up</dt>
                    <dd>{item.at ? when(item.at) : "Not recorded"}</dd>
                  </div>
                  <div>
                    <dt>At what hour</dt>
                    <dd>Not on record</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="ax-textlink"
                  onClick={() => onOpenDestination(item.where)}
                >
                  The copies it has made
                </button>
              </article>
            ))
          ) : (
            <article className="axro-job axro-ghost">
              <header>
                <b>Nothing recurs</b>
                <span>not set up</span>
              </header>
              <p>
                No backup, no renewal, no clean-up. Everything that has happened
                on this server so far was asked for.
              </p>
            </article>
          )}
        </section>
      </div>

      <footer className="axro-foot">
        <LittleServer
          mood={troubled.length ? "attention" : "resting"}
          className="axro-guy"
        />
        <div>
          <p>
            <Repeat weight="bold" aria-hidden="true" /> Queued work is a
            different thing from a schedule: a job runs because the clock said
            so, a queued task runs because something asked for it.
          </p>
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("cache")}
          >
            The queue and what is waiting in it
          </button>
        </div>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
