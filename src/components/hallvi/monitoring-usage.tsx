"use client";

// Traffic and server load, from what the server already keeps.
//
// No analytics service: the proxy's access log says who asked for what and
// how it went, and the host's own samples say how hard the machine worked.
// Where the owner keeps traffic history, the traffic card reads those stored
// totals, which are kept current. Otherwise Hallvi reads a window of both
// when it looks, so the section says when that was — a chart that looks
// live but stopped at the last read would be the Monitoring page implying a
// watch that does not exist.

import { useState, type PointerEvent, type ReactNode } from "react";

import { OTHER, type TrafficHistory } from "@/server/traffic/contract";

import { Tag } from "./deployment-prototype/tag";
import { EmptySketch } from "./empty-sketch";
import type { Usage } from "./monitoring-records";
import { AskButton, toneOf } from "./monitoring-watching";
import { ago, clock } from "./stack-prototype/stack-model";
import { hasTotals } from "./traffic/model";
import "./monitoring-usage.css";

/** The traffic card's numbers, whichever way they were read. */
interface Counted {
  /** Bucket `i` starts at `start + i * stepMinutes`. */
  start: string;
  stepMinutes: number;
  source: string;
  requests: number[];
  serverErrors: number[];
  p95Ms?: number[];
  /** How much of each bucket the log covered; absent when all was read. */
  covered?: number[];
  /** Distinct addresses across the window, when Pi read one. */
  visitors?: number;
  paths: { path: string; requests: number; serverErrors: number }[];
  /** What the list of paths counts. */
  pathsAre: "Most requested" | "Most viewed";
}

function fromUsage(usage: Usage): Counted | null {
  if (!usage.traffic) return null;
  return {
    start: usage.start,
    stepMinutes: usage.stepMinutes,
    ...usage.traffic,
    pathsAre: "Most requested",
  };
}

/** The last 24 hours of stored totals, hour by hour; gaps stay gaps. */
function fromHistory(history: TrafficHistory): Counted {
  const points = [...history.series].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at),
  );
  const source = history.collection.source;
  return {
    start: points[0].at,
    stepMinutes: 60,
    source: source
      ? `${source.proxy} access log, counted as it is written`
      : "Counted from the access log as it is written",
    requests: points.map((point) => (point.covered ? point.requests : 0)),
    serverErrors: points.map((point) => (point.covered ? point.errors : 0)),
    p95Ms: points.map((point) => point.p95Ms ?? 0),
    covered: points.map((point) => point.covered),
    paths: history.pages
      .filter((page) => page.key !== OTHER)
      .slice(0, 5)
      .map((page) => ({
        path: page.key,
        requests: page.count,
        serverErrors:
          history.errors.find((error) => error.key === page.key)?.count ?? 0,
      })),
    pathsAre: "Most viewed",
  };
}

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

/** Bucket `index` as a clock time, and the six-hour ticks under a chart. */
function clockOf(usage: Pick<Usage, "start" | "stepMinutes">) {
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

function Tip({ left, children }: { left: number; children: ReactNode }) {
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
  place,
  label,
}: {
  ticks: number[];
  place: (index: number) => number;
  label: (index: number) => string;
}) {
  return (
    <div className="axmu-axis" aria-hidden="true">
      {ticks.map((index) => (
        <span key={index} style={{ left: `${place(index)}%` }}>
          {label(index)}
        </span>
      ))}
    </div>
  );
}

function Card({
  title,
  source,
  say,
  children,
  ask,
  onAsk,
}: {
  title: string;
  source: string;
  say: string;
  children: ReactNode;
  /** Offered only when the readings raise a question worth asking. */
  ask: { label: string; draft: string } | null;
  onAsk: (draft: string) => void;
}) {
  return (
    <article className="axmu-card" aria-label={title}>
      <header className="axmu-head">
        <h3>{title}</h3>
        <span>{source}</span>
      </header>
      <p className="axmu-say">{say}</p>
      {children}
      {ask && (
        <AskButton onClick={() => onAsk(ask.draft)}>{ask.label}</AskButton>
      )}
    </article>
  );
}

function Stat({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <div data-bad={bad || undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Traffic({
  traffic,
  name,
  onAsk,
}: {
  traffic: Counted;
  name: string;
  onAsk: (draft: string) => void;
}) {
  const { requests, serverErrors, p95Ms, covered } = traffic;
  const length = requests.length;
  const { at, ticks } = clockOf(traffic);
  const { hover, handlers } = useHover(length);
  const total = sum(requests);
  const failed = sum(serverErrors);
  const busiest = peakOf(requests);
  const worst = peakOf(serverErrors);
  const top = ceiling(Math.max(...requests));
  const rate = total ? (failed / total) * 100 : 0;
  // An hour with no requests has no response time, not a fast one.
  const timed = (p95Ms ?? []).filter((value) => value > 0);
  const typical = timed.length ? median(timed) : null;
  const paths = traffic.paths.slice(0, 5);
  const pathTop = Math.max(1, ...paths.map((path) => path.requests));
  const gap = (index: number) => covered !== undefined && !covered[index];

  const say = [
    `${count(total)} requests`,
    traffic.visitors !== undefined
      ? ` from about ${count(traffic.visitors)} visitors`
      : "",
    `, busiest around ${clock(at(busiest))}.`,
    failed
      ? ` ${count(failed)} failed on the server, most of them around ${clock(at(worst))}.`
      : " None failed on the server.",
  ].join("");

  return (
    <Card
      title="Traffic"
      source={traffic.source}
      say={say}
      onAsk={onAsk}
      ask={
        failed
          ? {
              label: `Ask why ${count(failed)} failed`,
              draft: `${count(failed)} requests to ${name} failed with a server error in the last 24 hours, most around ${clock(at(worst))}. Read the application's output from then and tell me what went wrong.`,
            }
          : null
      }
    >
      <dl className="axmu-stats">
        <Stat label="Requests" value={count(total)} />
        {traffic.visitors !== undefined && (
          <Stat label="Visitors" value={count(traffic.visitors)} />
        )}
        <Stat
          label="Server errors"
          value={`${rate < 0.1 && failed ? "<0.1" : rate.toFixed(1)}%`}
          bad={rate >= 1}
        />
        {typical !== null && (
          <Stat label="Response, p95" value={duration(typical)} />
        )}
      </dl>

      <figure className="axmu-chart">
        <span className="axmu-grid" aria-hidden="true">
          {count(top)}
        </span>
        <div
          className="axmu-plot axmu-bars"
          role="img"
          aria-label={`Requests every ${traffic.stepMinutes} minutes over the last 24 hours. ${say}`}
          {...handlers}
        >
          {requests.map((value, index) => {
            const errors = serverErrors[index] ?? 0;
            // A stretch the log did not cover is hatched, never a zero.
            if (gap(index))
              return (
                <span
                  key={index}
                  className="axmu-bar"
                  data-gap
                  data-hover={hover === index || undefined}
                />
              );
            return (
              <span
                key={index}
                className="axmu-bar"
                data-hover={hover === index || undefined}
              >
                <i style={{ height: `${((value - errors) / top) * 100}%` }} />
                {errors > 0 && (
                  <b style={{ height: `max(2px, ${(errors / top) * 100}%)` }} />
                )}
              </span>
            );
          })}
          {hover !== null && (
            <Tip left={((hover + 0.5) / length) * 100}>
              <time>
                {clock(at(hover))}–{clock(at(hover + 1))}
              </time>
              {gap(hover) ? (
                <span className="axmu-tip-quiet">
                  Not counted: the log did not cover it
                </span>
              ) : (
                <>
                  <span>
                    <i data-series="requests" />
                    {count(requests[hover])} requests
                  </span>
                  <span>
                    <i data-series="errors" />
                    {count(serverErrors[hover] ?? 0)} server errors
                  </span>
                  {p95Ms?.[hover] ? (
                    <span className="axmu-tip-quiet">
                      p95 {duration(p95Ms[hover])}
                    </span>
                  ) : null}
                </>
              )}
            </Tip>
          )}
        </div>
        <Axis
          ticks={ticks(length)}
          place={(index) => (index / length) * 100}
          label={(index) => clock(at(index))}
        />
        <figcaption className="axmu-legend">
          <span>
            <i data-series="requests" />
            Requests per{" "}
            {traffic.stepMinutes === 60 ? "hour" : `${traffic.stepMinutes} min`}
          </span>
          <span>
            <i data-series="errors" />
            Server errors
          </span>
          {covered?.some((share) => !share) && (
            <span>
              <i data-series="gap" />
              Not counted
            </span>
          )}
        </figcaption>
      </figure>

      {paths.length > 0 && (
        <div className="axmu-paths">
          <h4>{traffic.pathsAre}</h4>
          <ol>
            {paths.map((path) => (
              <li key={path.path}>
                <code title={path.path}>{path.path}</code>
                <span className="axmu-share" aria-hidden="true">
                  <i style={{ width: `${(path.requests / pathTop) * 100}%` }} />
                </span>
                <span>{count(path.requests)}</span>
                <em>
                  {path.serverErrors > 0
                    ? `${count(path.serverErrors)} failed`
                    : ""}
                </em>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}

/** "12.4 of 40 GB used" as a share, when it reads as one. */
function diskOf(words: string) {
  const match = /([\d.]+)\s*(?:\w+\s*)?of\s*([\d.]+)\s*(\w+)/.exec(words);
  if (!match) return null;
  const used = Number(match[1]);
  const total = Number(match[2]);
  if (!total || used > total) return null;
  return { used, total, unit: match[3], share: (used / total) * 100 };
}

function Host({
  usage,
  host,
  name,
  onAsk,
}: {
  usage: Usage;
  host: NonNullable<Usage["host"]>;
  name: string;
  onAsk: (draft: string) => void;
}) {
  const { cpu, memory } = host;
  const length = cpu.length;
  const { at, ticks } = clockOf(usage);
  const { hover, handlers } = useHover(length);
  const cpuPeak = peakOf(cpu);
  const cpuAverage = sum(cpu) / Math.max(1, length);
  const cpuNow = cpu.at(-1) ?? 0;
  const memoryNow = memory.at(-1) ?? 0;
  const memoryPeak = Math.max(...memory);
  const disk = usage.disk ? diskOf(usage.disk) : null;
  const span = Math.max(1, length - 1);
  const x = (index: number) => (index / span) * 100;
  const points = (values: number[]) =>
    values.map((value, index) => `${index},${100 - value}`).join(" ");

  const say = `CPU averaged ${Math.round(cpuAverage)}% and peaked at ${Math.round(cpu[cpuPeak])}% around ${clock(at(cpuPeak))}. Memory ${
    memoryPeak - Math.min(...memory) < 10 ? "held steady near" : "is now at"
  } ${Math.round(memoryNow)}%${host.memoryTotal ? ` of ${host.memoryTotal}` : ""}.`;
  const busy = cpu[cpuPeak] >= 80 || memoryPeak >= 90;

  return (
    <Card
      title="Server"
      source={host.source}
      say={say}
      onAsk={onAsk}
      ask={
        busy
          ? {
              label: "Ask whether it needs more room",
              draft: `${name}'s server peaked at ${Math.round(cpu[cpuPeak])}% CPU and ${Math.round(memoryPeak)}% memory in the last 24 hours. Is it undersized, and what would you change?`,
            }
          : null
      }
    >
      <dl className="axmu-stats">
        <Stat
          label="CPU now"
          value={`${Math.round(cpuNow)}%`}
          bad={cpuNow >= 80}
        />
        <Stat
          label="Memory now"
          value={`${Math.round(memoryNow)}%`}
          bad={memoryNow >= 90}
        />
      </dl>

      <figure className="axmu-chart">
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
            viewBox={`0 0 ${span} 100`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polygon
              data-series="cpu"
              points={`0,100 ${points(cpu)} ${span},100`}
            />
            <polyline data-series="memory" points={points(memory)} />
            <polyline data-series="cpu" points={points(cpu)} />
          </svg>
          {hover !== null && (
            <>
              <span className="axmu-cross" style={{ left: `${x(hover)}%` }} />
              <span
                className="axmu-dot"
                data-series="memory"
                style={{ left: `${x(hover)}%`, top: `${100 - memory[hover]}%` }}
              />
              <span
                className="axmu-dot"
                data-series="cpu"
                style={{ left: `${x(hover)}%`, top: `${100 - cpu[hover]}%` }}
              />
              <Tip left={x(hover)}>
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
          place={x}
          label={(index) => clock(at(index))}
        />
        <figcaption className="axmu-legend">
          <span>
            <i data-series="cpu" />
            CPU
          </span>
          <span>
            <i data-series="memory" />
            Memory{host.memoryTotal ? ` of ${host.memoryTotal}` : ""}
          </span>
        </figcaption>
      </figure>

      {usage.disk && (
        <div className="axmu-disk">
          <h4>Disk</h4>
          {disk ? (
            <>
              <span
                className="axmu-meter"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={disk.total}
                aria-valuenow={disk.used}
                aria-label={`Disk: ${usage.disk}`}
                data-bad={disk.share >= 90 || undefined}
              >
                <i style={{ width: `${disk.share}%` }} />
              </span>
              <span>
                {disk.used} of {disk.total} {disk.unit}
              </span>
            </>
          ) : (
            <span>{usage.disk}</span>
          )}
        </div>
      )}
    </Card>
  );
}

export function MonitoringUsage({
  usage,
  history = null,
  followed = false,
  name,
  now,
  onAsk,
}: {
  usage: Usage | null;
  /**
   * The last 24 hours of the traffic history the owner keeps. Where it has
   * anything counted, the traffic card reads it instead of Pi's last read.
   */
  history?: TrafficHistory | null;
  /** Whether a record says where the access log is, so Overview follows it. */
  followed?: boolean;
  name: string;
  now: number;
  onAsk: (draft: string) => void;
}) {
  const read = `Read the last 24 hours of ${name}'s access log and its server's CPU and memory, and tell me anything unusual.`;
  const kept = history && hasTotals(history) ? fromHistory(history) : null;

  if (kept) {
    const load = `Read the last 24 hours of ${name}'s server CPU and memory, and tell me anything unusual.`;
    const fresh = usage?.host && toneOf(usage.at, now) === "verified";
    return (
      <section className="axmu" aria-labelledby="axmu-title">
        <header className="axmw-section-head">
          <div>
            <h2 id="axmu-title">Traffic and load</h2>
            <p>
              The last 24 hours of traffic, from the history Hallvi keeps.
              {usage?.host
                ? ` CPU and memory as read from the server${usage.at && fresh ? ` ${ago(usage.at, now)}` : ""}.`
                : ""}
            </p>
          </div>
          {usage?.host && usage.at && !fresh && (
            <Tag tone="stale">CPU read {ago(usage.at, now)}</Tag>
          )}
          <AskButton onClick={() => onAsk(load)}>
            {usage?.host ? "Read CPU and memory again" : "Read CPU and memory"}
          </AskButton>
        </header>
        <div className="axmu-cards">
          <Traffic traffic={kept} name={name} onAsk={onAsk} />
          {usage?.host ? (
            <Host usage={usage} host={usage.host} name={name} onAsk={onAsk} />
          ) : (
            <div className="axmu-sketches axmu-sketch-one">
              <EmptySketch kind="lines" caption="CPU and memory, once read" />
            </div>
          )}
        </div>
      </section>
    );
  }

  if (!usage?.traffic && !usage?.host)
    return (
      <section className="axmu" aria-label="Traffic and load">
        <div className="axmu-ghost">
          <div>
            <h2>Traffic and load</h2>
            {followed ? (
              <p>
                Overview follows requests as they arrive. No full day has been
                read yet, and no CPU or memory samples.
              </p>
            ) : (
              <p>
                Nothing has been read yet. The server already keeps what this
                needs — the proxy&apos;s access log and the machine&apos;s own
                samples — so there is nothing to install.
              </p>
            )}
          </div>
          <AskButton onClick={() => onAsk(read)}>
            Ask Hallvi to read it
          </AskButton>
          <div className="axmu-sketches">
            <EmptySketch kind="bars" caption="Traffic, once it is read" />
            <EmptySketch kind="lines" caption="CPU and memory, once read" />
          </div>
        </div>
      </section>
    );

  const fresh = toneOf(usage.at, now) === "verified";
  return (
    <section className="axmu" aria-labelledby="axmu-title">
      <header className="axmw-section-head">
        <div>
          <h2 id="axmu-title">Traffic and load</h2>
          <p>
            The last 24 hours, read from the server
            {usage.at && fresh ? ` ${ago(usage.at, now)}` : ""}. Nothing is
            collected between reads.
          </p>
        </div>
        {usage.at && !fresh && (
          <Tag tone="stale">Read {ago(usage.at, now)}</Tag>
        )}
        <AskButton onClick={() => onAsk(read)}>Read it again</AskButton>
      </header>
      <div className="axmu-cards">
        {usage.traffic && (
          <Traffic traffic={fromUsage(usage)!} name={name} onAsk={onAsk} />
        )}
        {usage.host && (
          <Host usage={usage} host={usage.host} name={name} onAsk={onAsk} />
        )}
      </div>
    </section>
  );
}
