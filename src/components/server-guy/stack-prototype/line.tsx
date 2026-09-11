"use client";

// PROTOTYPE · opus-ui-improvements · chosen for Processes.
// Line: the Transit language chosen for Deployment and History. Now on the
// left, and on the right how a visit reaches the processes, a line from
// your network to the web app, with the private processes behind a wall and
// ghosts where missing pieces would go. Pointing at a stop lights the line
// up to it; a stop opens its evidence.

import { ChatCircleText, Lock } from "@phosphor-icons/react";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { Tag } from "../deployment-prototype/tag";
import { useDismiss } from "../overview-prototype/shared";
import type { StackDirectionProps } from "./index";
import { clock, countWord, when, type Change, type Probe } from "./stack-model";
import "../deployment-prototype/transit.css";
import "./line.css";

interface Fact {
  label: string;
  value: string;
  sub: string;
  exact: { label: string; value: string; mono?: boolean }[];
}

export function LineDirection({
  story,
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
              <span>Inside the server: nothing outside reaches past here</span>
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
