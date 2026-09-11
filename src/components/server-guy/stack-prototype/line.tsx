"use client";

// PROTOTYPE · opus-ui-improvements · throwaway.
// Direction A, Line: the Transit language chosen for Deployment and History.
// Processes: now on the left, and on the right how a visit reaches them, a
// line from your network to the web app, with the private processes behind
// a wall and ghosts where missing pieces would go. Database: where your data
// goes, from the process that writes it to a tested restore. Pointing at a
// stop lights the line up to it; a stop opens its evidence.

import { ChatCircleText, Lock } from "@phosphor-icons/react";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Tag } from "../deployment-prototype/tag";
import { useDismiss } from "../overview-prototype/shared";
import { FRESH_MS } from "../architecture-prototype/model";
import type { StackDirectionProps } from "./index";
import {
  ago,
  clock,
  countWord,
  when,
  type Change,
  type Probe,
} from "./stack-model";
import "../deployment-prototype/transit.css";
import "./line.css";

interface Fact {
  label: string;
  value: string;
  sub: string;
  exact: { label: string; value: string; mono?: boolean }[];
}

export function LineDirection({
  page,
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: StackDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [lit, setLit] = useState<{ line: string; at: number } | null>(null);
  const [fact, setFact] = useState<string | null>(null);
  const close = useCallback(() => setFact(null), []);
  useDismiss(Boolean(fact), ".axm-fact", close);

  const litOn = (line: string, at: number) =>
    (lit !== null && lit.line === line && at < lit.at) || undefined;
  const stop = ({
    id,
    line,
    at,
    title,
    detail,
    tone,
    dot,
    time,
    meta,
    lines,
    className,
    then,
  }: {
    id: string;
    line: string;
    at: number;
    title: ReactNode;
    detail: ReactNode;
    tone?: string;
    dot?: ReactNode;
    time?: string;
    meta?: string;
    lines?: ReactNode;
    className?: string;
    then?: string;
  }) => (
    <li
      key={id}
      className={`axm-stop${open === id ? " is-open" : ""}${className ? ` ${className}` : ""}`}
      data-tone={tone}
      data-then={then}
      data-lit={litOn(line, at)}
      style={{ "--i": at } as CSSProperties}
      onPointerEnter={() => setLit({ line, at })}
      onPointerLeave={() => setLit(null)}
    >
      <span className="axm-dot" aria-hidden="true">
        {dot}
      </span>
      {lines ? (
        <button
          type="button"
          className="axm-stop-main"
          aria-expanded={open === id}
          onClick={() => setOpen((value) => (value === id ? null : id))}
        >
          <b>{title}</b>
          <small>{detail}</small>
        </button>
      ) : (
        <div className="axm-stop-main">
          <b>{title}</b>
          <small>{detail}</small>
        </div>
      )}
      {time !== undefined && (
        <span className="axm-when">
          <time>{time}</time>
          {meta && <small>{meta}</small>}
        </span>
      )}
      {open === id && lines}
    </li>
  );
  const ghost = (id: string, title: string, detail: string) => (
    <li key={id} className="axm-stop is-ghost">
      <span className="axm-dot" aria-hidden="true" />
      <div className="axm-stop-main">
        <b>{title}</b>
        <small>{detail}</small>
      </div>
    </li>
  );
  const probeLines = (probes: Probe[]) => (
    <div className="axm-lines" role="log">
      {probes.map((probe) => (
        <div
          key={probe.name}
          className="axm-rec"
          data-tone={probe.at ? "pass" : "info"}
        >
          <time>{probe.at ? clock(probe.at) : "—"}</time>
          <b aria-hidden="true">{probe.at ? "✓" : "·"}</b>
          <span>
            {probe.name} · {probe.probe} ·{" "}
            {probe.inside ? "inside the server" : "from your network"}
          </span>
        </div>
      ))}
    </div>
  );
  const facts = (items: Fact[]) => (
    <dl className="axm-facts">
      {items.map((item) => (
        <div key={item.label} className="axm-fact">
          <dt>{item.label}</dt>
          <dd>
            <button
              type="button"
              className="axm-fact-open"
              aria-expanded={fact === item.label}
              disabled={!item.exact.length}
              onClick={() =>
                setFact((value) => (value === item.label ? null : item.label))
              }
            >
              <b>{item.value}</b>
              <small>{item.sub}</small>
            </button>
            {fact === item.label && (
              <div className="axm-pop" role="dialog" aria-label={item.label}>
                <dl>
                  {item.exact.map((row) => (
                    <div key={row.label}>
                      <dt>{row.label}</dt>
                      <dd className={row.mono ? "ax-mono" : undefined}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
  const changes = (list: Change[]) =>
    list.length > 0 && (
      <section className="axsl-changes" aria-label="Recent changes">
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

  // ---------- Processes ----------
  if (page === "processes") {
    const web = story.processes.filter((item) => item.role === "web");
    const inside = story.processes.filter((item) => item.role !== "web");
    const n = story.processes.length;
    const names = story.processes.map((item) => item.product);
    const listed =
      names.length > 1
        ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
        : (names[0] ?? "the processes");
    const say =
      story.state === "running"
        ? `${countWord(n)} ${n === 1 ? "process is" : "processes are"} running.`
        : story.state === "unknown"
          ? `${countWord(n)} ${n === 1 ? "process" : "processes"} may have changed.`
          : `${countWord(n)} ${n === 1 ? "process is" : "processes are"} planned.`;
    const processStop = (
      item: (typeof story.processes)[number],
      line: string,
      at: number,
      then?: string,
    ) => {
      const passed = item.probes.filter((probe) => probe.at).length;
      return stop({
        id: `process:${item.name}`,
        line,
        at,
        then,
        className: item.role === "private" ? "axsl-private" : undefined,
        dot: item.role === "private" ? <Lock weight="bold" /> : undefined,
        tone:
          item.probes.length && passed === item.probes.length
            ? "pass"
            : undefined,
        title: (
          <>
            {item.product} <code className="axsl-code">{item.name}</code>
          </>
        ),
        detail: `${item.roleWords} · ${item.reach}`,
        time: item.lastPassed ? clock(item.lastPassed) : "—",
        meta: item.probes.length
          ? `${passed} of ${item.probes.length} checks`
          : "No checks",
        lines: item.probes.length ? probeLines(item.probes) : undefined,
      });
    };
    return (
      <section className="axm" aria-label="Processes">
        {head}
        {activity}
        <div className="axm-body">
          <aside className="axm-now" aria-label="Now">
            <h2 className="axm-say">{say}</h2>
            <p className="axm-sure">
              <Tag tone={story.tone}>{story.word}</Tag>
              <span>Checked by the deployment, not continuously.</span>
            </p>
            <button
              type="button"
              className="ax-button axm-next"
              onClick={() =>
                onAsk(`Check that ${listed} are running and healthy now.`)
              }
            >
              <ChatCircleText weight="bold" />
              Ask Server Guy to check now
            </button>
            {facts(
              story.processes.map((item) => ({
                label: item.product,
                value:
                  item.role === "web"
                    ? "Web app"
                    : item.role === "private"
                      ? "Private service"
                      : item.role === "worker"
                        ? "Worker"
                        : "Service",
                sub: item.reach,
                exact: [
                  { label: "Process", value: item.name, mono: true },
                  { label: "Image", value: item.image, mono: true },
                  {
                    label: "Command",
                    value: item.command ?? "Image default",
                    mono: Boolean(item.command),
                  },
                  { label: "Health", value: item.health ?? "None recorded" },
                ],
              })),
            )}
            {changes(story.processChanges)}
          </aside>

          <section className="axm-map" aria-label="How a visit reaches them">
            <header className="axm-map-head">
              <h2>How a visit reaches them</h2>
              {story.verifiedAt && (
                <small>As deployed · checked {when(story.verifiedAt)}</small>
              )}
            </header>
            <ol className="axm-line">
              {stop({
                id: "network",
                line: "visit",
                at: 0,
                title: story.restricted ? "Your network" : "Anyone online",
                detail:
                  story.restricted && story.from
                    ? `${story.from} is the only address let in`
                    : "No address filter",
              })}
              {stop({
                id: "port",
                line: "visit",
                at: 1,
                title: "Port 80 on the server",
                detail: `HTTP, opened by the firewall for ${story.restricted ? "your network" : "everyone"}`,
              })}
              {web.map((item, index) => processStop(item, "visit", 2 + index))}
            </ol>
            {inside.length > 0 && (
              <div className="axsl-wall" role="separator">
                <span>
                  Inside the server: nothing outside reaches past here
                </span>
                <i aria-hidden="true" />
              </div>
            )}
            <ol className="axm-line">
              {inside.map((item, index) =>
                processStop(
                  item,
                  "inside",
                  index,
                  index === inside.length - 1 ? "ghost" : undefined,
                ),
              )}
              {story.processGaps.map((gap) =>
                ghost(gap.id, gap.title, gap.detail),
              )}
            </ol>
          </section>
        </div>
      </section>
    );
  }

  // ---------- Database ----------
  const store = story.database;
  const guard = story.protection;
  if (!store)
    return (
      <section className="axm" aria-label="Database">
        {head}
        {activity}
        <p className="axsl-empty">No database recorded.</p>
      </section>
    );
  const checked = store.probe?.at ?? null;
  const fresh = Boolean(checked) && now - Date.parse(checked!) < FRESH_MS;
  const file = store.file?.split("/").at(-1) ?? store.label;
  return (
    <section className="axm" aria-label="Database">
      {head}
      {activity}
      <div className="axm-body">
        <aside className="axm-now" aria-label="Now">
          <h2 className="axm-say">
            {store.owner} keeps its data in{" "}
            {store.kind === "sqlite" ? "one SQLite file" : store.label}.
          </h2>
          <p className="axm-sure">
            <Tag tone={checked ? (fresh ? "verified" : "stale") : "planned"}>
              {checked ? `Healthy ${ago(checked, now)}` : "Not checked"}
            </Tag>
            <span>
              {checked
                ? `${store.owner} reported it ok through “${store.probe!.name}”. A recorded check, not continuous monitoring.`
                : "No check reads the database yet."}
            </span>
          </p>
          <button
            type="button"
            className="ax-button axm-next"
            onClick={() =>
              onAsk(
                `Back up ${store.owner}'s database now and verify the copy.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask Server Guy to back it up now
          </button>
          {facts([
            ...(store.file
              ? [
                  {
                    label: "File",
                    value: file,
                    sub: store.label,
                    exact: [{ label: "Path", value: store.file, mono: true }],
                  },
                ]
              : []),
            ...(store.volume
              ? [
                  {
                    label: "Volume",
                    value: store.volume.name,
                    sub: `Mounted at ${store.volume.mount}`,
                    exact: [
                      { label: "Volume", value: store.volume.name, mono: true },
                      ...(store.volume.docker
                        ? [
                            {
                              label: "Docker name",
                              value: store.volume.docker,
                              mono: true,
                            },
                          ]
                        : []),
                      { label: "Mount", value: store.volume.mount, mono: true },
                    ],
                  },
                ]
              : []),
            {
              label: "Size",
              value: "Not measured",
              sub: "Size and growth aren't recorded yet",
              exact: [],
            },
            {
              label: "Used by",
              value: store.owner,
              sub: `The ${store.ownerName} process, and nothing else`,
              exact: [],
            },
          ])}
          {story.files.length > 0 && (
            <section className="axsl-other" aria-label="Other data">
              <h3>Other data on the server</h3>
              {story.files.map((item) => (
                <p key={item.name}>
                  <b>{item.name}</b>: {item.owner}&apos;s files at{" "}
                  <code>{item.mount}</code>
                  {item.note ? `, ${item.note}` : ""}.{" "}
                  <button
                    type="button"
                    className="ax-textlink"
                    onClick={() => onOpenDestination("storage")}
                  >
                    Storage
                  </button>
                </p>
              ))}
            </section>
          )}
          {changes(story.dataChanges)}
        </aside>

        <section className="axm-map" aria-label="Where your data goes">
          <header className="axm-map-head">
            <h2>Where your data goes</h2>
            <small>As recorded</small>
          </header>
          <ol className="axm-line">
            {stop({
              id: "writer",
              line: "data",
              at: 0,
              title: `${store.owner} writes`,
              detail: `${store.owner} is the only process that opens it`,
            })}
            {stop({
              id: "file",
              line: "data",
              at: 1,
              tone: checked ? "pass" : undefined,
              title: (
                <>
                  <code className="axsl-code">{file}</code> · {store.label}
                </>
              ),
              detail: checked
                ? `Reported ok by “${store.probe!.name}”${store.firstFailure ? ". It failed once, on the first deploy, and passed on the retry" : ""}`
                : "No check reads it",
              time: checked ? clock(checked) : "—",
              meta: checked ? ago(checked, now) : undefined,
              lines: store.probe ? (
                <div className="axm-lines" role="log">
                  {store.firstFailure && (
                    <div className="axm-rec" data-tone="fail">
                      <time>{clock(store.firstFailure.at)}</time>
                      <b aria-hidden="true">✗</b>
                      <span>{store.firstFailure.detail}</span>
                    </div>
                  )}
                  <div className="axm-rec" data-tone="pass">
                    <time>{checked ? clock(checked) : "—"}</time>
                    <b aria-hidden="true">✓</b>
                    <span>
                      {store.probe.name} · {store.probe.probe}
                    </span>
                  </div>
                </div>
              ) : undefined,
            })}
            {guard.schedule
              ? stop({
                  id: "schedule",
                  line: "data",
                  at: 2,
                  title: guard.schedule.words,
                  detail: "On the application host",
                  time: when(guard.schedule.at),
                  meta: "set up",
                })
              : ghost("schedule", "Scheduled backups", "Not set up")}
            {guard.backup
              ? stop({
                  id: "backup",
                  line: "data",
                  at: 3,
                  tone: "pass",
                  title: "Off-host copy",
                  detail: guard.backup.detail,
                  time: when(guard.backup.at),
                  meta: "newest on record",
                })
              : ghost("backup", "Off-host copy", "None on record")}
            {guard.restore
              ? stop({
                  id: "restore",
                  line: "data",
                  at: 4,
                  tone: "pass",
                  then: "ghost",
                  title: "Restore tested",
                  detail: guard.restore.detail,
                  time: when(guard.restore.at),
                })
              : ghost("restore", "Restore test", "Not run yet")}
            {story.dataGaps.map((gap) => ghost(gap.id, gap.title, gap.detail))}
          </ol>
          {guard.backup && (
            <p className="axsl-note">
              The newest backup on record is from {when(guard.backup.at)}.
              {guard.schedule
                ? " Scheduled backups may have run since; nothing newer is on record here."
                : ""}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
