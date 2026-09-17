"use client";

// Traffic and server load, from what the server already keeps.
//
// No analytics service: the proxy's access log says who asked for what and
// how it went, and the host's own samples say how hard the machine worked.
// Server Guy reads a window of both when it looks, so the cards say when that
// was — a chart that looks live but stopped at the last read would be the
// Monitoring page implying a watch that does not exist.

import { ChatCircleText } from "@phosphor-icons/react";
import { useState, type PointerEvent, type ReactNode } from "react";

import { Tag } from "./deployment-prototype/tag";
import type { Usage } from "./monitoring-records";
import { toneOf } from "./signal-prototype/signal-model";
import { ago, clock } from "./stack-prototype/stack-model";
import "./monitoring-usage.css";

const count = (n: number) => n.toLocaleString("en-US");
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
const duration = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
const peakOf = (values: number[]) =>
  values.reduce(
    (best, value, index) => (value > values[best] ? index : best),
    0,
  );
/** A round number at or above the largest value, for the one grid line. */
const ceiling = (max: number) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
};

/** Bucket `index` as a clock time, and the hour ticks under a chart. */
function useClock(usage: Usage) {
  const startMs = Date.parse(usage.start);
  const stepMs = usage.stepMinutes * 60_000;
  const at = (index: number) =>
    new Date(startMs + index * stepMs).toISOString();
  const ticks = (length: number) =>
    Array.from({ length }, (_, index) => index).filter((index) => {
      const date = new Date(startMs + index * stepMs);
      return date.getMinutes() < usage.stepMinutes && date.getHours() % 6 === 0;
    });
  return { at, ticks };
}

/** Which bucket the pointer is over. */
function useHover(length: number) {
  const [hover, setHover] = useState<number | null>(null);
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const index = Math.floor(((event.clientX - box.left) / box.width) * length);
    setHover(Math.min(length - 1, Math.max(0, index)));
  };
  return {
    hover,
    handlers: { onPointerMove, onPointerLeave: () => setHover(null) },
  };
}

function Tip({
  index,
  length,
  children,
}: {
  index: number;
  length: number;
  children: ReactNode;
}) {
  const left = ((index + 0.5) / length) * 100;
  return (
    <div
      className="axmu-tip"
      data-side={left > 60 ? "left" : "right"}
      style={{ left: `${left}%` }}
    >
      {children}
    </div>
  );
}

function Axis({
  ticks,
  length,
  label,
}: {
  ticks: number[];
  length: number;
  label: (index: number) => string;
}) {
  return (
    <div className="axmu-axis" aria-hidden="true">
      {ticks.map((index) => (
        <span key={index} style={{ left: `${(index / length) * 100}%` }}>
          {label(index)}
        </span>
      ))}
    </div>
  );
}

function Card({
  title,
  source,
  at,
  now,
  say,
  children,
  ask,
  onAsk,
}: {
  title: string;
  source: string;
  at: string | null;
  now: number;
  say: string;
  children: ReactNode;
  ask: { label: string; draft: string };
  onAsk: (draft: string) => void;
}) {
  return (
    <article className="axmu-card" aria-label={title}>
      <header className="axmu-head">
        <div>
          <h3>{title}</h3>
          <p>From the {source} · last 24 hours</p>
        </div>
        <Tag tone={toneOf(at, now)}>
          {at ? `Read ${ago(at, now)}` : "Never read"}
        </Tag>
      </header>
      <p className="axmu-say">{say}</p>
      {children}
      <footer className="axmu-foot">
        <small>
          Read when Server Guy looks{at ? `, last at ${clock(at)}` : ""}.
          Nothing is collected in between.
        </small>
        <button
          type="button"
          className="axtu-ask-small"
          onClick={() => onAsk(ask.draft)}
        >
          <ChatCircleText weight="bold" />
          {ask.label}
        </button>
      </footer>
    </article>
  );
}

function Traffic({
  usage,
  traffic,
  name,
  now,
  onAsk,
}: {
  usage: Usage;
  traffic: NonNullable<Usage["traffic"]>;
  name: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const { requests, serverErrors, p95Ms } = traffic;
  const length = requests.length;
  const { at, ticks } = useClock(usage);
  const { hover, handlers } = useHover(length);
  const total = sum(requests);
  const failed = sum(serverErrors);
  const busiest = peakOf(requests);
  const worst = peakOf(serverErrors);
  const top = ceiling(Math.max(...requests));
  const rate = total ? (failed / total) * 100 : 0;
  const typical = p95Ms?.length ? median(p95Ms) : null;
  const paths = traffic.paths.slice(0, 5);
  const pathTop = Math.max(1, ...paths.map((path) => path.requests));

  const say = [
    `${count(total)} requests`,
    traffic.visitors !== undefined
      ? ` from about ${count(traffic.visitors)} visitors`
      : "",
    `, busiest at ${clock(at(busiest))}.`,
    failed
      ? ` ${count(failed)} failed on the server, most of them around ${clock(at(worst))}.`
      : " None failed on the server.",
  ].join("");

  return (
    <Card
      title="Traffic"
      source={traffic.source}
      at={usage.at}
      now={now}
      say={say}
      onAsk={onAsk}
      ask={
        failed
          ? {
              label: `Ask why ${count(failed)} failed`,
              draft: `${count(failed)} requests to ${name} failed with a server error in the last 24 hours, most around ${clock(at(worst))}. Read the application's output from then and tell me what went wrong.`,
            }
          : {
              label: "Read the latest traffic",
              draft: `Read the last 24 hours of ${name}'s access log and tell me anything unusual.`,
            }
      }
    >
      <dl className="axmu-stats">
        <div>
          <dt>Requests</dt>
          <dd>{count(total)}</dd>
        </div>
        {traffic.visitors !== undefined && (
          <div>
            <dt>Visitors</dt>
            <dd>{count(traffic.visitors)}</dd>
          </div>
        )}
        <div data-bad={rate >= 1 || undefined}>
          <dt>Server errors</dt>
          <dd>{rate < 0.1 && failed ? "<0.1" : rate.toFixed(1)}%</dd>
        </div>
        {typical !== null && (
          <div>
            <dt>Response, p95</dt>
            <dd>{duration(typical)}</dd>
          </div>
        )}
      </dl>

      <div className="axmu-chart">
        <span className="axmu-grid" aria-hidden="true">
          {count(top)}
        </span>
        <div
          className="axmu-plot axmu-bars"
          role="img"
          aria-label={`Requests every ${usage.stepMinutes} minutes over the last 24 hours. ${say}`}
          {...handlers}
        >
          {requests.map((value, index) => {
            const errors = serverErrors[index] ?? 0;
            return (
              <span
                key={index}
                className="axmu-bar"
                data-hover={hover === index || undefined}
              >
                <i style={{ height: `${((value - errors) / top) * 100}%` }} />
                {errors > 0 && (
                  <b
                    style={{
                      height: `max(2px, ${(errors / top) * 100}%)`,
                    }}
                  />
                )}
              </span>
            );
          })}
          {hover !== null && (
            <Tip index={hover} length={length}>
              <time>
                {clock(at(hover))}–{clock(at(hover + 1))}
              </time>
              <span>
                <i data-series="requests" />
                {count(requests[hover])} requests
              </span>
              <span>
                <i data-series="errors" />
                {count(serverErrors[hover] ?? 0)} server errors
              </span>
              {p95Ms?.[hover] !== undefined && (
                <span>p95 {duration(p95Ms[hover])}</span>
              )}
            </Tip>
          )}
        </div>
        <Axis
          ticks={ticks(length)}
          length={length}
          label={(i) => clock(at(i))}
        />
      </div>
      <ul className="axmu-legend">
        <li>
          <i data-series="requests" />
          Requests per {usage.stepMinutes} min
        </li>
        <li>
          <i data-series="errors" />
          Server errors (5xx)
        </li>
      </ul>

      {paths.length > 0 && (
        <ol className="axmu-paths" aria-label="Most requested">
          {paths.map((path) => (
            <li key={path.path}>
              <code title={path.path}>{path.path}</code>
              <span className="axmu-share" aria-hidden="true">
                <i style={{ width: `${(path.requests / pathTop) * 100}%` }} />
              </span>
              <span>{count(path.requests)}</span>
              {path.serverErrors > 0 && (
                <em>{count(path.serverErrors)} failed</em>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function Host({
  usage,
  host,
  name,
  now,
  onAsk,
}: {
  usage: Usage;
  host: NonNullable<Usage["host"]>;
  name: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const { cpu, memory } = host;
  const length = cpu.length;
  const { at, ticks } = useClock(usage);
  const { hover, handlers } = useHover(length);
  const cpuPeak = peakOf(cpu);
  const cpuAverage = sum(cpu) / Math.max(1, length);
  const memoryNow = memory.at(-1) ?? 0;
  const memoryPeak = Math.max(...memory);
  const line = (values: number[]) =>
    values.map((value, index) => `${index},${100 - value}`).join(" ");
  const x = (index: number) => `${(index / Math.max(1, length - 1)) * 100}%`;

  const say = `CPU averaged ${Math.round(cpuAverage)}% and peaked at ${Math.round(cpu[cpuPeak])}% around ${clock(at(cpuPeak))}. Memory ${
    memoryPeak - Math.min(...memory) < 10 ? "held steady near" : "is now at"
  } ${Math.round(memoryNow)}%${host.memoryTotal ? ` of ${host.memoryTotal}` : ""}.`;
  const busy = cpu[cpuPeak] >= 80 || memoryPeak >= 90;

  return (
    <Card
      title="Server"
      source={host.source}
      at={usage.at}
      now={now}
      say={say}
      onAsk={onAsk}
      ask={
        busy
          ? {
              label: "Ask whether it needs more room",
              draft: `${name}'s server peaked at ${Math.round(cpu[cpuPeak])}% CPU and ${Math.round(memoryPeak)}% memory in the last 24 hours. Is it undersized, and what would you change?`,
            }
          : {
              label: "Measure it now",
              draft: `Measure ${name}'s server now: its CPU, memory and disk.`,
            }
      }
    >
      <dl className="axmu-stats">
        <div data-bad={(cpu.at(-1) ?? 0) >= 80 || undefined}>
          <dt>CPU now</dt>
          <dd>{Math.round(cpu.at(-1) ?? 0)}%</dd>
        </div>
        <div data-bad={memoryNow >= 90 || undefined}>
          <dt>Memory now</dt>
          <dd>{Math.round(memoryNow)}%</dd>
        </div>
        {usage.disk && (
          <div>
            <dt>Disk</dt>
            <dd className="axmu-small">{usage.disk}</dd>
          </div>
        )}
      </dl>

      <div className="axmu-chart">
        <span className="axmu-grid" aria-hidden="true">
          100%
        </span>
        <span className="axmu-grid" data-half aria-hidden="true">
          50%
        </span>
        <div
          className="axmu-plot axmu-lines"
          role="img"
          aria-label={`CPU and memory in percent over the last 24 hours. ${say}`}
          {...handlers}
        >
          <svg
            viewBox={`0 0 ${Math.max(1, length - 1)} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline data-series="memory" points={line(memory)} />
            <polyline data-series="cpu" points={line(cpu)} />
          </svg>
          {hover !== null && (
            <>
              <span className="axmu-cross" style={{ left: x(hover) }} />
              <span
                className="axmu-dot"
                data-series="memory"
                style={{ left: x(hover), top: `${100 - memory[hover]}%` }}
              />
              <span
                className="axmu-dot"
                data-series="cpu"
                style={{ left: x(hover), top: `${100 - cpu[hover]}%` }}
              />
              <Tip index={hover} length={length}>
                <time>{clock(at(hover))}</time>
                <span>
                  <i data-series="cpu" />
                  CPU {Math.round(cpu[hover])}%
                </span>
                <span>
                  <i data-series="memory" />
                  Memory {Math.round(memory[hover])}%
                </span>
              </Tip>
            </>
          )}
        </div>
        <Axis
          ticks={ticks(length)}
          length={length}
          label={(i) => clock(at(i))}
        />
      </div>
      <ul className="axmu-legend">
        <li>
          <i data-series="cpu" />
          CPU
        </li>
        <li>
          <i data-series="memory" />
          Memory
          {host.memoryTotal ? ` of ${host.memoryTotal}` : ""}
        </li>
      </ul>
    </Card>
  );
}

export function UsagePanel({
  usage,
  name,
  now,
  onAsk,
}: {
  usage: Usage | null;
  name: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  if (!usage?.traffic && !usage?.host)
    return (
      <section className="axmu" aria-label="Traffic and server load">
        <article className="axmu-card axmu-ghost">
          <h3>Traffic and server load</h3>
          <p>
            Nothing has been read yet. The server already keeps what this needs
            — the proxy&apos;s access log and the machine&apos;s own CPU and
            memory samples — so there is no analytics service to install.
          </p>
          <button
            type="button"
            className="axtu-ask-small"
            onClick={() =>
              onAsk(
                `Read the last 24 hours of ${name}'s access log and its server's CPU and memory, and show me the traffic and load.`,
              )
            }
          >
            <ChatCircleText weight="bold" />
            Ask Server Guy to read it
          </button>
        </article>
      </section>
    );

  return (
    <section className="axmu" aria-label="Traffic and server load">
      {usage.traffic && (
        <Traffic
          usage={usage}
          traffic={usage.traffic}
          name={name}
          now={now}
          onAsk={onAsk}
        />
      )}
      {usage.host && (
        <Host
          usage={usage}
          host={usage.host}
          name={name}
          now={now}
          onAsk={onAsk}
        />
      )}
    </section>
  );
}
