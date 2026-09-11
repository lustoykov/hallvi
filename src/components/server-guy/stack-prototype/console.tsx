"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction C, Console: the record read like a terminal listing. Processes:
// one line per process, as the deployment recorded it, and an inspect pane
// for the selected one; what isn't set up is written in as comments.
// Database: where the file lives, how it answered, what protects it and
// what isn't measured, in sections. The header says when it was recorded:
// this is not a live listing, and nothing in it moves.

import { ChatCircleText } from "@phosphor-icons/react";
import { useState, type KeyboardEvent, type ReactNode } from "react";

import type { MascotMood } from "../home/mascot-scene";
import type { Tone } from "../deployment-prototype/deployment-model";
import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { StackDirectionProps } from "./index";
import {
  ago,
  clock,
  countWord,
  when,
  type Change,
  type Probe,
} from "./stack-model";
import "./console.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};

export function ConsoleDirection({
  page,
  story,
  now,
  head,
  activity,
  server,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: StackDirectionProps) {
  const [selected, setSelected] = useState(story.processes[0]?.name ?? null);
  const store = story.database;
  const guard = story.protection;

  const probeLine = (probe: Probe) => (
    <div
      key={probe.name}
      className="axcn-line"
      data-tone={probe.at ? "pass" : "info"}
    >
      <b aria-hidden="true">{probe.at ? "✓" : "·"}</b>
      <time>{probe.at ? clock(probe.at) : "--:--"}</time>
      <span>
        {probe.name}
        <em>
          {" "}
          {probe.probe} ·{" "}
          {probe.inside ? "inside the server" : "from your network"}
        </em>
      </span>
    </div>
  );
  const kv = (key: string, value: ReactNode, tone?: string) => (
    <div key={key} className="axcn-kv" data-tone={tone}>
      <span>{key}</span>
      <span>{value}</span>
    </div>
  );
  const changes = (list: Change[]) =>
    list.length > 0 && (
      <section className="axcn-changes" aria-label="Recent changes">
        <h3>Recent changes</h3>
        <ul>
          {list.map((change) => (
            <li key={change.id} data-state={change.state}>
              <button
                type="button"
                onClick={() =>
                  change.origin
                    ? onOpenConversation(
                        change.origin.chatId,
                        change.origin.messageId,
                      )
                    : onOpenDestination("history")
                }
              >
                {change.title}
              </button>
              <small>{when(change.at)}</small>
            </li>
          ))}
        </ul>
      </section>
    );
  const frame = (label: string, body: ReactNode) => (
    <div className="axcn-stage">
      <LittleServer mood={moodOf[story.tone]} className="axcn-guy" />
      <section className="axcn-console" aria-label={label}>
        <header>
          <span>
            {server
              ? `${server.label}${server.city ? ` · ${server.city}` : ""}`
              : story.name}
          </span>
          <span>
            {story.verifiedAt
              ? `Recorded ${when(story.verifiedAt)} · ${ago(story.verifiedAt, now)} · not a live listing`
              : "Nothing recorded yet"}
          </span>
        </header>
        <div className="axcn-body">{body}</div>
      </section>
    </div>
  );

  // ---------- Processes ----------
  if (page === "processes") {
    const n = story.processes.length;
    const names = story.processes.map((item) => item.product);
    const say =
      story.state === "running"
        ? `${countWord(n)} ${n === 1 ? "process is" : "processes are"} running.`
        : `${countWord(n)} ${n === 1 ? "process" : "processes"} ${story.state === "unknown" ? "may have changed" : "planned"}.`;
    const chosen =
      story.processes.find((item) => item.name === selected) ??
      story.processes[0];
    const move = (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = story.processes.findIndex(
        (item) => item.name === chosen?.name,
      );
      const next =
        story.processes[(index + (event.key === "ArrowDown" ? 1 : -1) + n) % n];
      if (!next) return;
      setSelected(next.name);
      document.getElementById(`axcn-${next.name}`)?.focus();
    };
    return (
      <section className="axcn" aria-label="Processes">
        {head}
        {activity}
        <div className="axcn-lede">
          <div>
            <p className="axcn-say">{say}</p>
            <p className="axcn-sure">
              <Tag tone={story.tone}>{story.word}</Tag>
              <span>Checked by the deployment, not continuously.</span>
            </p>
          </div>
          <button
            type="button"
            className="ax-button axcn-ask"
            onClick={() =>
              onAsk(
                `Check that ${names.join(" and ")} are running and healthy now.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask Server Guy to check now
          </button>
        </div>
        {frame(
          "Processes, as recorded",
          <>
            <div
              className="axcn-table"
              role="listbox"
              aria-label="Processes"
              onKeyDown={move}
            >
              <div className="axcn-row is-head" aria-hidden="true">
                <span>PROCESS</span>
                <span>WHAT IT IS</span>
                <span>REACHED</span>
                <span>IMAGE</span>
                <span>CHECKS</span>
              </div>
              {story.processes.map((item) => (
                <div
                  key={item.name}
                  id={`axcn-${item.name}`}
                  className="axcn-row"
                  role="option"
                  tabIndex={chosen?.name === item.name ? 0 : -1}
                  aria-selected={chosen?.name === item.name}
                  onClick={() => setSelected(item.name)}
                >
                  <span className="axcn-name">{item.name}</span>
                  <span>
                    {item.product} ·{" "}
                    {item.role === "web"
                      ? "web app"
                      : item.role === "private"
                        ? "private"
                        : item.role}
                  </span>
                  <span>
                    {item.role === "web"
                      ? `80 → ${item.port} · ${story.restricted ? "your network" : "anyone"}`
                      : `${item.port ?? "--"} · inside only`}
                  </span>
                  <span className="axcn-image">{item.imageShort}</span>
                  <span className="axcn-checks">
                    {item.probes.map((probe) => (
                      <b
                        key={probe.name}
                        data-tone={probe.at ? "pass" : "info"}
                        aria-hidden="true"
                      >
                        {probe.at ? "✓" : "·"}
                      </b>
                    ))}
                    <time>
                      {item.lastPassed ? clock(item.lastPassed) : "--:--"}
                    </time>
                  </span>
                </div>
              ))}
              {story.processGaps.map((gap) => (
                <div key={gap.id} className="axcn-comment">
                  # {gap.title.toLowerCase()}:{" "}
                  {gap.detail.charAt(0).toLowerCase()}
                  {gap.detail.slice(1)}
                </div>
              ))}
            </div>
            {chosen && (
              <div className="axcn-inspect" aria-live="polite">
                <p className="axcn-comment"># {chosen.name}, in detail</p>
                {kv("image", chosen.image)}
                {kv("command", chosen.command ?? "(image default)")}
                {kv("health", chosen.health ?? "(none recorded)")}
                {kv(
                  "reached",
                  chosen.role === "web" && story.from
                    ? `${chosen.reach} (${story.from})`
                    : chosen.reach,
                )}
                {kv(
                  "checks",
                  chosen.probes.length
                    ? `${chosen.probes.filter((probe) => probe.at).length} of ${chosen.probes.length} passed at deployment`
                    : "(none recorded)",
                )}
                <div className="axcn-lines">{chosen.probes.map(probeLine)}</div>
                <button
                  type="button"
                  className="axcn-link"
                  onClick={() =>
                    onAsk(
                      `Check ${chosen.product} (${chosen.name}) now: is it running and healthy?`,
                    )
                  }
                >
                  → ask Server Guy about {chosen.product}
                </button>
              </div>
            )}
          </>,
        )}
        {changes(story.processChanges)}
      </section>
    );
  }

  // ---------- Database ----------
  if (!store)
    return (
      <section className="axcn" aria-label="Database">
        {head}
        {activity}
        <p className="axcn-say">No database recorded.</p>
      </section>
    );
  const checked = store.probe?.at ?? null;
  return (
    <section className="axcn" aria-label="Database">
      {head}
      {activity}
      <div className="axcn-lede">
        <div>
          <p className="axcn-say">
            {store.owner} keeps its data in{" "}
            {store.kind === "sqlite" ? "one SQLite file" : store.label}.
          </p>
          <p className="axcn-sure">
            <Tag tone={checked ? story.tone : "planned"}>
              {checked ? `Healthy ${ago(checked, now)}` : "Not checked"}
            </Tag>
            <span>A recorded check, not continuous monitoring.</span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button axcn-ask"
          onClick={() =>
            onAsk(`Back up ${store.owner}'s database now and verify the copy.`)
          }
        >
          <ChatCircleText weight="bold" />
          Ask Server Guy to back it up now
        </button>
      </div>
      {frame(
        "Database, as recorded",
        <>
          <p className="axcn-comment"># where it lives</p>
          {kv(
            store.file?.split("/").at(-1) ?? store.label,
            store.label,
            "strong",
          )}
          {store.file && kv("path", store.file)}
          {store.volume &&
            kv(
              "volume",
              `${store.volume.name}${store.volume.docker ? ` (${store.volume.docker})` : ""} at ${store.volume.mount}`,
            )}
          {kv("used by", `${store.owner} (${store.ownerName}), nothing else`)}

          <p className="axcn-comment"># how it answered</p>
          {store.firstFailure && (
            <div className="axcn-line" data-tone="fail">
              <b aria-hidden="true">✗</b>
              <time>{clock(store.firstFailure.at)}</time>
              <span>
                first deploy
                <em> {store.firstFailure.detail}</em>
              </span>
            </div>
          )}
          {store.probe ? (
            probeLine(store.probe)
          ) : (
            <p className="axcn-comment"> (no check reads it yet)</p>
          )}

          <p className="axcn-comment"># what protects it</p>
          {guard.schedule
            ? kv(
                "schedule",
                `${guard.schedule.words.toLowerCase()} · set up ${when(guard.schedule.at)}`,
              )
            : kv("schedule", "(not set up)", "muted")}
          {guard.backup ? (
            <div className="axcn-line" data-tone="pass">
              <b aria-hidden="true">✓</b>
              <time>{when(guard.backup.at)}</time>
              <span>
                off-host copy<em> {guard.backup.detail}</em>
              </span>
            </div>
          ) : (
            kv("off-host copy", "(none on record)", "muted")
          )}
          {guard.restore ? (
            <div className="axcn-line" data-tone="pass">
              <b aria-hidden="true">✓</b>
              <time>{when(guard.restore.at)}</time>
              <span>
                restore test<em> {guard.restore.detail}</em>
              </span>
            </div>
          ) : (
            kv("restore test", "(not run yet)", "muted")
          )}
          {guard.schedule && guard.backup && (
            <p className="axcn-comment">
              {"  "}scheduled backups may have run since; nothing newer is on
              record here
            </p>
          )}

          <p className="axcn-comment"># not measured yet</p>
          {story.dataGaps
            .filter((gap) => gap.id !== "backups")
            .map((gap) => kv(gap.title.toLowerCase(), gap.detail, "muted"))}

          {story.files.length > 0 && (
            <>
              <p className="axcn-comment"># other data on the server</p>
              {story.files.map((item) =>
                kv(
                  item.name,
                  <>
                    {item.owner} files at {item.mount}
                    {item.note ? `, ${item.note}` : ""}{" "}
                    <button
                      type="button"
                      className="axcn-link"
                      onClick={() => onOpenDestination("storage")}
                    >
                      → storage
                    </button>
                  </>,
                ),
              )}
            </>
          )}
        </>,
      )}
      {changes(story.dataChanges)}
    </section>
  );
}
