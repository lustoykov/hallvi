"use client";

// PROTOTYPE · opus-ui-improvements · Cache & queue.
// Queue: the page draws the line of work waiting to be done, which for most
// applications is empty — and empty for a reason worth saying: nothing on
// record queues anything. The broker that would hold the line and the
// workers that would take from it are drawn where they would stand. A
// backlog is only ever shown when an integration reported one; Hallvi
// never invents an empty queue.

import { ChatCircleText, Lightning } from "@phosphor-icons/react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import { listed } from "../backup-prototype/model";
import { countWord } from "../stack-prototype/stack-model";
import type { SupplyProps } from "./supply-story";
import { ago, waitWords } from "./supply-model";
import "./queue.css";

const SLOTS = 14;

export function QueueDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: SupplyProps) {
  const queue = story.queues[0] ?? null;
  const broker = story.brokers[0] ?? null;
  const measured = queue?.at ? queue : null;
  const waiting = measured?.backlog ?? 0;
  const failed = measured?.failedLastHour ?? 0;
  const slots = Array.from({ length: SLOTS }, (_, index) => index);

  return (
    <section className="axqu" aria-label="Cache and queue">
      {head}
      {activity}
      <div className="axqu-lede">
        <div>
          <h2>
            {/* A broker on record with no queue on record is not an
                application that queues nothing — it is one whose queue
                nobody has looked into, which is a different sentence. */}
            {measured
              ? waiting === 0
                ? "Nothing is waiting in the queue."
                : `${waiting} task${waiting === 1 ? "" : "s"} waiting for a worker.`
              : queue
                ? `${story.name} has a queue, and nothing has measured it.`
                : broker
                  ? `${story.name} has a broker, and nothing has looked at what is in it.`
                  : `Nothing has looked at whether ${story.name} caches or queues anything.`}
          </h2>
          <p>
            <Tag tone={measured ? "verified" : queue ? "stale" : "planned"}>
              {measured
                ? `Measured ${ago(measured.at, now)}`
                : queue || broker
                  ? "Never measured"
                  : "Not assessed"}
            </Tag>
            <span>
              {measured
                ? `Through the application’s own queue library, not guessed from the broker.${
                    measured.oldestSeconds
                      ? ` The oldest has waited ${waitWords(measured.oldestSeconds)}.`
                      : ""
                  }${failed ? ` ${failed} failed in the last hour.` : ""}`
                : "A backlog appears here only when a supported integration reports one. An empty line is never invented to fill the page."}
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axqu-ask"
          onClick={() =>
            onAsk(
              queue
                ? `What is waiting in ${story.name}’s queue right now, and is anything failing repeatedly?`
                : `Would ${story.name} benefit from a cache or a queue? Say what would use it and what it would cost to run.`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {queue ? "Ask what is waiting" : "Ask whether one is needed"}
        </button>
      </div>

      {/* The line itself. Empty is the honest picture for most records. */}
      <div className="axqu-line" data-empty={!measured || undefined}>
        <span className="axqu-head">
          {measured ? "Front of the queue" : "The line"}
        </span>
        <div className="axqu-slots" aria-label="Work waiting">
          {slots.map((index) => (
            <i
              key={index}
              data-filled={index < waiting || undefined}
              data-failed={
                failed > 0 && index === Math.min(waiting, SLOTS) - 1
                  ? true
                  : undefined
              }
            />
          ))}
          {waiting > SLOTS && <b>+{waiting - SLOTS}</b>}
        </div>
        <span className="axqu-tail">
          {measured
            ? `${story.workers.length ? listed(story.workers) : "No worker"} ${story.workers.length > 1 ? "take" : "takes"} from it`
            : "Nothing puts work here"}
        </span>
      </div>

      <div className="axqu-parts">
        <article className="axqu-part" data-there={broker ? true : undefined}>
          <header>
            <Lightning weight="fill" aria-hidden="true" />
            <b>{broker ? broker.product : "No cache or broker"}</b>
          </header>
          {broker ? (
            <dl className="ax-facts axqu-facts">
              <div>
                <dt>Role</dt>
                <dd>{broker.role}</dd>
              </div>
              <div>
                <dt>Reach</dt>
                <dd>{broker.reach}</dd>
              </div>
              <div>
                <dt>Keeping work</dt>
                <dd>
                  {broker.persistence ??
                    "Not recorded · queued work may not survive a restart"}
                </dd>
              </div>
            </dl>
          ) : (
            <p>
              Hallvi would run a private Valkey here, beside the application and
              reachable only from the server, and would say plainly whether it
              keeps queued work across a restart.
            </p>
          )}
        </article>
        <article
          className="axqu-part"
          data-there={story.workers.length ? true : undefined}
        >
          <header>
            <b>
              {story.workers.length
                ? `${countWord(story.workers.length)} worker${story.workers.length === 1 ? "" : "s"}`
                : "No worker"}
            </b>
          </header>
          {story.workers.length ? (
            <p>
              {listed(story.workers)}
              {queue
                ? `${story.workers.length > 1 ? " take" : " takes"} from ${queue.library}, backed by ${queue.backedBy}.`
                : `${story.workers.length > 1 ? " are" : " is"} declared by the release, with nothing recorded about what ${story.workers.length > 1 ? "they consume" : "it consumes"}.`}
            </p>
          ) : (
            <p>
              Nothing in the release runs in the background. {story.name}{" "}
              answers inside the request it was asked, which is why there is no
              line to stand in.
            </p>
          )}
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("processes")}
          >
            The processes that run
          </button>
        </article>
      </div>

      <footer className="axqu-foot">
        <LittleServer
          mood={failed ? "attention" : measured ? "checking" : "resting"}
          className="axqu-guy"
        />
        <div>
          <p>
            A cache is disposable and a queue is not: work waiting in a broker
            is the one kind of state the database backups do not cover. If this
            application ever gets one, that difference is what this page will
            keep saying.
          </p>
          <button
            type="button"
            className="ax-textlink"
            onClick={() => onOpenDestination("jobs")}
          >
            Work that runs on a schedule
          </button>
        </div>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
