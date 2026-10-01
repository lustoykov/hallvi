"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// C · One day, one axis. Everything Hallvi can place in time shares one
// 24-hour axis that ends at now: visitors, server errors, speed, server
// load, which release was running, and what Hallvi recorded. Each lane ends
// in how it reads at this moment. Under it, who is arriving and what was
// recorded, in time order.

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import { UnresolvedMarks } from "../presentation";
import { WINDOW_MINUTES } from "../overview-live/use-traffic";
import { NowWords, Pulse } from "../traffic/live";
import { countryName, milliseconds } from "../traffic/model";
import { ago, clock, count, plural, span } from "./facts";
import {
  DirectionsHead,
  OpenAction,
  PageLink,
  openWord,
  type VariantProps,
} from "./head";

const HOUR = 3_600_000;
const W = 1000;

function Lane({
  label,
  now,
  height,
  children,
}: {
  label: string;
  now: ReactNode;
  height: number;
  children: ReactNode;
}) {
  return (
    <>
      <div className="ovc-label">{label}</div>
      <div className="ovc-track" style={{ height }}>
        {children}
      </div>
      <div className="ovc-now">{now}</div>
    </>
  );
}

const since = (at: number, now: number) => {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 10) return "now";
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
};

export function VariantC({ facts, bar }: VariantProps) {
  const { visitors, traffic, server, releases, speed, now } = facts;
  const [hover, setHover] = useState<number | null>(null);
  const tracks = useRef<HTMLDivElement>(null);

  // Twenty-four hours ending with the one we are in. Stored hours when
  // there are any; otherwise the same axis with nothing counted on it.
  const thisHour = Math.floor(now / HOUR) * HOUR;
  const hours =
    visitors.hours.length >= 2
      ? visitors.hours.slice(-24)
      : Array.from({ length: 24 }, (_, index) => ({
          at: thisHour - (23 - index) * HOUR,
          visitors: 0,
          views: 0,
          errors: 0,
          p95Ms: null as number | null,
          covered: false,
        }));
  const start = hours[0].at;
  const end = start + hours.length * HOUR;
  const x = (at: number) =>
    Math.min(100, Math.max(0, ((at - start) / (end - start)) * 100));
  const counted = hours.some((hour) => hour.covered);

  const most = Math.max(1, ...hours.map((hour) => hour.visitors));
  const mostErrors = Math.max(6, ...hours.map((hour) => hour.errors));
  const slowest = Math.max(1, ...hours.map((hour) => hour.p95Ms ?? 0));
  const speedLine = hours
    .map((hour, index) =>
      hour.p95Ms
        ? `${((index + 0.5) / hours.length) * W},${38 - (hour.p95Ms / slowest) * 32}`
        : null,
    )
    .filter(Boolean)
    .join(" ");

  const load = server
    ? server.cpu
        .map((value, index) => ({
          at: server.start + (index + 0.5) * server.stepMinutes * 60_000,
          value,
        }))
        .filter((point) => point.at >= start && point.at <= end)
    : [];
  const loadTop = Math.max(40, ...load.map((point) => point.value));
  const loadLine = load
    .map(
      (point) =>
        `${(x(point.at) / 100) * W},${38 - (point.value / loadTop) * 32}`,
    )
    .join(" ");

  // Which release was running when.
  const inOrder = [...releases.all]
    .filter((release) => release.outcome !== "failed")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const runs = inOrder
    .map((release, index) => ({
      release,
      from: Date.parse(release.at),
      to: inOrder[index + 1] ? Date.parse(inOrder[index + 1].at) : now,
    }))
    .filter((run) => run.to > start);

  const recorded = facts.happened.filter(
    (one) => one.kind !== "release" && one.at >= start,
  );
  const midnight = new Date(now).setHours(0, 0, 0, 0);
  const shown = hover === null ? null : hours[hover];
  const cpuAt = (at: number) => {
    const point = load.find(
      (one) => Math.abs(one.at - (at + HOUR / 2)) <= HOUR / 2,
    );
    return point ? Math.round(point.value) : null;
  };

  const move = (event: PointerEvent) => {
    const box = tracks.current?.getBoundingClientRect();
    if (!box || event.clientX < box.left || event.clientX > box.right)
      return setHover(null);
    setHover(
      Math.min(
        hours.length - 1,
        Math.floor(((event.clientX - box.left) / box.width) * hours.length),
      ),
    );
  };

  return (
    <div className="ovc">
      <DirectionsHead facts={facts} bar={bar} />

      <section className="ovc-day" aria-labelledby="ovc-day">
        <header>
          <h2 id="ovc-day">The last 24 hours</h2>
          <p>
            {visitors.today !== null ? (
              <>
                Today so far: about <b>{plural(visitors.today, "visitor")}</b>
                {visitors.viewsToday !== null &&
                  `, ${plural(visitors.viewsToday, "page view")}`}
                {visitors.errors &&
                  ` and ${visitors.errors.today ? plural(visitors.errors.today, "server error") : "no server errors"}`}
                .{" "}
                {visitors.usual !== null &&
                  `A usual day has about ${count(visitors.usual)} visitors.`}
              </>
            ) : visitors.kept ? (
              "Nothing is counted for today yet."
            ) : (
              "Hallvi is not keeping traffic history, so the day has no counts. The live line still follows the log."
            )}
          </p>
        </header>

        <div
          className="ovc-lanes"
          onPointerMove={move}
          onPointerLeave={() => setHover(null)}
        >
          <div className="ovc-over" ref={tracks} aria-hidden="true">
            {midnight > start && midnight < end && (
              <span
                className="ovc-midnight"
                style={{ left: `${x(midnight)}%` }}
              >
                <em>Today</em>
              </span>
            )}
            {hover !== null && (
              <span
                className="ovc-band"
                style={{
                  left: `${(hover / hours.length) * 100}%`,
                  width: `${100 / hours.length}%`,
                }}
              />
            )}
          </div>
          <div className="ovc-head" />
          <div className="ovc-head" />
          <div className="ovc-head ovc-now">Now</div>

          <Lane
            label="Visitors"
            height={86}
            now={
              <span className="ovc-live">
                <Pulse traffic={traffic} />
                <NowWords traffic={traffic} />
              </span>
            }
          >
            <div className="ovc-bars">
              {hours.map((hour, index) => (
                <i
                  key={hour.at}
                  data-now={index === hours.length - 1 || undefined}
                  data-gap={!hour.covered || undefined}
                  style={{
                    height: hour.covered
                      ? `${Math.max(2, (hour.visitors / most) * 100)}%`
                      : "100%",
                  }}
                />
              ))}
            </div>
          </Lane>

          <Lane
            label="Server errors"
            height={24}
            now={
              !visitors.errors
                ? "Not counted"
                : visitors.errors.today
                  ? `${count(visitors.errors.today)} today`
                  : "None today"
            }
          >
            <div
              className="ovc-bars ovc-errors"
              data-hit={(visitors.errors?.visitorsHit ?? 0) > 0 || undefined}
            >
              {hours.map((hour) => (
                <i
                  key={hour.at}
                  style={{
                    height: hour.errors
                      ? `${Math.max(18, (hour.errors / mostErrors) * 100)}%`
                      : 0,
                  }}
                />
              ))}
            </div>
          </Lane>

          <Lane
            label="Speed"
            height={44}
            now={
              speed.typicalMs !== null
                ? `${milliseconds(speed.typicalMs)}, slowest 1 in 20`
                : "Not read"
            }
          >
            {speedLine && (
              <svg viewBox={`0 0 ${W} 44`} preserveAspectRatio="none">
                <polyline points={speedLine} />
              </svg>
            )}
          </Lane>

          <Lane
            label="Server load"
            height={44}
            now={
              server
                ? `CPU ${Math.round(server.cpu.at(-1) ?? 0)}%, memory ${Math.round(server.memory.at(-1) ?? 0)}%`
                : "Not read"
            }
          >
            {loadLine && (
              <svg
                viewBox={`0 0 ${W} 44`}
                preserveAspectRatio="none"
                className="ovc-load"
              >
                <polygon
                  points={`${loadLine.split(" ")[0].split(",")[0]},44 ${loadLine} ${loadLine.split(" ").at(-1)!.split(",")[0]},44`}
                />
                <polyline points={loadLine} />
              </svg>
            )}
          </Lane>

          <Lane
            label="Release"
            height={30}
            now={
              releases.running
                ? `${releases.running.short}, for ${span(now - Date.parse(releases.running.at))}`
                : "Not established"
            }
          >
            {runs.map((run) => (
              <span
                key={run.release.id}
                className="ovc-run"
                data-began={run.from > start || undefined}
                style={{
                  left: `${x(run.from)}%`,
                  width: `${x(run.to) - x(run.from)}%`,
                }}
                title={run.release.changes[0]}
              >
                <code>{run.release.short}</code>
              </span>
            ))}
            {runs
              .filter((run) => run.from > start)
              .map((run) => (
                <i
                  key={run.release.id}
                  className="ovc-began"
                  style={{ left: `${x(run.from)}%` }}
                  title={`Released ${clock(run.from)}`}
                />
              ))}
          </Lane>

          <Lane
            label="Hallvi"
            height={30}
            now={
              facts.happened[0]
                ? `Last recorded ${ago(facts.happened[0].at, now)}`
                : "Nothing recorded"
            }
          >
            {recorded.map((one) => (
              <i
                key={one.id}
                className="ovc-mark"
                data-state={one.state}
                style={{ left: `${x(one.at)}%` }}
                title={`${clock(one.at)} · ${one.title}`}
              />
            ))}
          </Lane>

          <div />
          <div className="ovc-axis" aria-hidden="true">
            {hours.map((hour, index) => (
              <span key={hour.at}>
                {new Date(hour.at).getHours() % 3 === 0 && index > 0 && (
                  <small>{clock(hour.at)}</small>
                )}
              </span>
            ))}
          </div>
          <div />
        </div>

        <p className="ovc-readout">
          {shown ? (
            <>
              <b>
                {clock(shown.at)} to {clock(shown.at + HOUR)}
              </b>
              {shown.covered
                ? `${plural(shown.visitors, "visitor")} · ${plural(shown.errors, "server error")}${shown.p95Ms ? ` · ${milliseconds(shown.p95Ms)}` : ""}`
                : "Not counted"}
              {cpuAt(shown.at) !== null && ` · CPU ${cpuAt(shown.at)}%`}
            </>
          ) : counted ? (
            "Point at an hour to read it."
          ) : (
            " "
          )}
        </p>
      </section>

      <div className="ovc-lower">
        <section aria-labelledby="ovc-arriving">
          <header>
            <h2 id="ovc-arriving">Arriving</h2>
            <PageLink facts={facts} to="traffic">
              Traffic
            </PageLink>
          </header>
          {traffic.arrivals.length ? (
            <ol className="ovc-arrivals">
              {traffic.arrivals.slice(0, 6).map((line) => (
                <li key={line.id}>
                  <span>{line.country ? countryName(line.country) : ""}</span>
                  <code title={line.path}>{line.path}</code>
                  <span>
                    {line.source
                      ? line.source === "Direct"
                        ? "direct"
                        : `from ${line.source}`
                      : ""}
                  </span>
                  <time>{since(line.at, traffic.clock)}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ovc-quiet">
              {traffic.state === "live"
                ? `Nobody has opened a page in the last ${WINDOW_MINUTES} minutes.`
                : traffic.state === "no-log"
                  ? "There is no access log to follow yet."
                  : "Arrivals show here while the log is open."}
            </p>
          )}
        </section>

        <section aria-labelledby="ovc-recorded">
          <header>
            <h2 id="ovc-recorded">Recorded</h2>
            <PageLink facts={facts} to="history">
              History
            </PageLink>
          </header>
          {facts.open.length > 0 && (
            <ul className="ovc-open" aria-label="Unresolved">
              {facts.open.slice(0, 3).map((need) => (
                <li key={need.id}>
                  <UnresolvedMarks tones={[need.tone]} />
                  <b>{need.title}</b>
                  <span>{openWord(need)}</span>
                  <OpenAction need={need} facts={facts} />
                </li>
              ))}
            </ul>
          )}
          {facts.happened.length ? (
            <ol className="ovc-recorded">
              {facts.happened.slice(0, 6).map((one) => (
                <li key={one.id}>
                  <time>
                    {one.at >= start ? clock(one.at) : ago(one.at, now)}
                  </time>
                  {one.open ? (
                    <button type="button" onClick={one.open}>
                      {one.title}
                    </button>
                  ) : (
                    <span>{one.title}</span>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="ovc-quiet">No work is recorded yet.</p>
          )}
        </section>
      </div>
    </div>
  );
}
