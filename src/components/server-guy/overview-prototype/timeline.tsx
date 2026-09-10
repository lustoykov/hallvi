"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction A, Timeline: how it is doing, told in time. Four lanes show when
// Server Guy last checked, copied, reached the server and read the
// firewall, what is scheduled next, and how long nothing has looked.
// Little Server stands at now; a re-check lands on the lanes as it happens.
// Its log folds underneath, linked to the lanes: point at a line and its
// moment lights up, point at a moment and its lines do.

import { ArrowRight, ArrowsClockwise, CaretDown, ChatCircleText, SpinnerGap, X } from "@phosphor-icons/react";
import { Fragment, useCallback, useMemo, useRef, useState } from "react";

import { labelOf } from "../operation-model";
import { ago } from "../architecture-prototype/model";
import { reducedMotion } from "../architecture-prototype/motion";
import type { HeroProps } from "./hero";
import type { Overview, Vital } from "./overview-model";
import { NeedCard, span, useCountdown, useDismiss, VitalPop, vitalIcon, whenWords } from "./shared";
import { buildTimeline, laneOf, type Lane, type TimeEvent } from "./timeline-model";
import { Mascot, useServerGuy } from "./use-server-guy";
import "./timeline.css";

const HOUR = 3_600_000;
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;

const clock = (at: number | string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });

function dayName(at: number, now: number) {
  const day = (value: number) => {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return new Date(at).toLocaleDateString(undefined, { weekday: "long" });
}

/** What the stretch since the last look is called, per lane. */
const since: Record<Lane["id"], string> = {
  checks: "No check for",
  backups: "No copy for",
  server: "Not reached for",
  access: "Not read for",
};

function subline(model: HeroProps["model"], overview: Overview) {
  if (model.status !== "live")
    return "Nothing runs yet. Once you approve, Server Guy builds it, checks it and starts copying its data off the server.";
  if (overview.needs.length) return null;
  const app = model.byId.app;
  const host = model.byId.host;
  if (app?.evidence.certainty === "stale" && app.evidence.at)
    return `${model.headline} hasn't been checked for ${span(model.now - Date.parse(app.evidence.at))}, so it may have changed.${host?.evidence.certainty === "verified" ? ` The server answered ${ago(host.evidence.at, model.now)}.` : ""}`;
  return `${model.headline} passed its checks ${ago(app?.evidence.at, model.now)}.`;
}

function EventPop({
  event,
  vital,
  now,
  onClose,
  onOpenDestination,
  onAsk,
}: {
  event: TimeEvent;
  vital: Vital;
  now: number;
  onClose: () => void;
  onOpenDestination: HeroProps["onOpenDestination"];
  onAsk: HeroProps["onAsk"];
}) {
  const future = event.at > now;
  return (
    <div className="axj2-pop axt-ev-pop" role="dialog" aria-label={event.title}>
      <header>
        <span className="axj2-icon" aria-hidden="true">
          {vitalIcon[vital.id]}
        </span>
        <div>
          <b>{event.title}</b>
          <small>
            {whenWords(event.at, now).replace(/^./, (c) => c.toUpperCase())}
            {future ? "" : ` · ${ago(new Date(event.at).toISOString(), now)}`}
          </small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close">
          <X weight="bold" />
        </button>
      </header>
      <div className="axt-console" role="log">
        {event.lines.map((line) => (
          <div key={line.id} className="axt-console-line" data-tone={line.tone}>
            <time>{clock(line.at)}</time>
            <b aria-hidden="true">{glyph[line.tone]}</b>
            <span>
              {line.text}
              {line.invented && (
                <em>{line.id.startsWith("live:") ? "simulated" : "invented"}</em>
              )}
            </span>
          </div>
        ))}
      </div>
      <footer>
        <button type="button" className="ax-textlink" onClick={() => onOpenDestination(vital.destination)}>
          Open {labelOf(vital.destination)}
          <ArrowRight weight="bold" />
        </button>
        <button type="button" className="ax-textlink" onClick={() => onAsk(vital.ask)}>
          <ChatCircleText weight="bold" />
          Ask in the conversation
        </button>
      </footer>
    </div>
  );
}

export function TimelineHero({
  model,
  record,
  overview,
  recheck,
  offset,
  pointed,
  onPoint,
  onShow,
  onAsk,
  onOpenDestination,
}: HeroProps) {
  const [guy, mascot] = useServerGuy(model, recheck, { narrate: true });
  const timeline = useMemo(
    () => buildTimeline({ model, record, live: guy.live, marks: recheck.marks }),
    [model, record, guy.live, recheck.marks],
  );
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axt-pop, .axt-ev, .axt-lane-name", close);
  const toggle = (id: string) => setOpen((current) => (current === id ? null : id));
  const [logOpen, setLogOpen] = useState(false);
  // The moment being pointed at, on the lanes or in the log.
  const [lit, setLit] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  // Which moment on the lanes each recorded line belongs to.
  const momentOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const lane of timeline.lanes)
      for (const event of lane.events) for (const line of event.lines) map[line.id] = event.id;
    return map;
  }, [timeline]);

  const planned = model.status !== "live";
  const vitals = Object.fromEntries(overview.vitals.map((vital) => [vital.id, vital])) as Record<
    Vital["id"],
    Vital
  >;
  const { start, end, now } = timeline;
  const x = (at: number) => ((at - start) / (end - start)) * 100;
  const nowX = x(now);
  const nextIn = useCountdown(vitals.backups?.countdownTo, offset);
  const pointedLane = pointed ? laneOf(pointed) : null;

  // Hours every six, and the days they belong to.
  const ticks: number[] = [];
  const first = new Date(start);
  first.setMinutes(0, 0, 0);
  while (first.getHours() % 6 !== 0 || first.getTime() < start) first.setTime(first.getTime() + HOUR);
  for (let at = first.getTime(); at <= end; at += 6 * HOUR) ticks.push(at);
  const midnights = ticks.filter((at) => new Date(at).getHours() === 0);
  const days = [start, ...midnights]
    .map((at, i, all) => ({ at, width: x(all[i + 1] ?? end) - x(at) }))
    .filter((day) => day.width > 9);

  const sub = subline(model, overview);
  const showLog = logOpen || guy.simulating;
  const lines = guy.lines.slice(-8);

  return (
    <section className={`axt${planned ? " is-planned" : ""}${guy.simulating ? " is-live" : ""}`} aria-label="How it is doing">
      <div className="axt-top">
        <div className="axt-words">
          <h2 className="axt-say" key={overview.headline}>
            {overview.headline}
          </h2>
          {sub && <p className="axt-sub">{sub}</p>}
        </div>
        {!planned && (
          <div className="axt-check">
            <button type="button" className="ax-button" disabled={guy.running} onClick={guy.run}>
              {guy.running ? <SpinnerGap weight="bold" className="ax-spin" /> : <ArrowsClockwise weight="bold" />}
              {guy.running ? "Checking…" : "Check now"}
            </button>
            <small>Simulated · nothing is contacted</small>
          </div>
        )}
      </div>

      {overview.needs.length > 0 && (
        <div className="axt-needs">
          {overview.needs.map((need) => (
            <NeedCard
              key={need.id}
              need={need}
              onAsk={onAsk}
              onOpenDestination={onOpenDestination}
              onHover={onPoint}
              onShow={onShow}
            />
          ))}
        </div>
      )}

      <div className="axt-time" style={{ ["--now" as string]: `${nowX}%` }}>
        <div className="axt-field" aria-hidden="true">
          {ticks.map((at) => (
            <i key={at} className={`axt-grid${new Date(at).getHours() === 0 ? " is-midnight" : ""}`} style={{ left: `${x(at)}%` }} />
          ))}
          {days.map((day) => (
            <span key={day.at} className="axt-day" style={{ left: `${x(day.at)}%` }}>
              {dayName(day.at, now)}
            </span>
          ))}
          <div className="axt-future" />
          <div className="axt-now" />
        </div>
        <div className="axt-over">
          <div className="axt-stand" style={{ left: `${nowX}%` }}>
            <Mascot guy={guy} mascotRef={mascot} className="axt-mascot" />
          </div>
        </div>

        {timeline.lanes.map((lane) => {
          const vital = vitals[lane.id];
          if (!vital) return null;
          const certainty = vital.status.certainty;
          const gapFrom = lane.lastAt !== null ? Math.max(start, lane.lastAt) : start;
          const gap =
            !planned && (certainty === "stale" || certainty === "unknown") && now - (lane.lastAt ?? start) > HOUR;
          return (
            <div
              key={lane.id}
              className={`axt-lane${pointedLane === lane.id ? " is-pointed" : ""}`}
              data-c={certainty}
            >
              <div className="axt-lane-head">
                <button
                  type="button"
                  className="axt-lane-name"
                  aria-expanded={open === `lane:${lane.id}`}
                  onClick={() => toggle(`lane:${lane.id}`)}
                >
                  <span className="axt-lane-icon" aria-hidden="true">
                    {vitalIcon[lane.id]}
                  </span>
                  <span className="axt-lane-text">
                    <b>{vital.label}</b>
                    <small>
                      <i aria-hidden="true" />
                      {vital.status.text}
                    </small>
                  </span>
                </button>
                {open === `lane:${lane.id}` && (
                  <div className="axt-pop is-lane">
                    <VitalPop vital={vital} onClose={close} onOpenDestination={onOpenDestination} onAsk={onAsk} />
                  </div>
                )}
              </div>
              <div className="axt-track">
                {gap && (
                  <div
                    className="axt-gap"
                    data-c={certainty}
                    style={{ left: `${x(gapFrom)}%`, width: `${nowX - x(gapFrom)}%` }}
                  >
                    {nowX - x(gapFrom) > 14 && (
                      <span>
                        {since[lane.id]} {span(now - (lane.lastAt ?? start))}
                      </span>
                    )}
                  </div>
                )}
                {planned && <span className="axt-empty">After deployment</span>}
                {lane.events.map((event) => {
                  const id = `event:${event.id}`;
                  const at = x(event.at);
                  return (
                    <div key={event.id}>
                      <button
                        type="button"
                        className={`axt-ev${open === id ? " is-open" : ""}${lit === event.id ? " is-lit" : ""}`}
                        data-tone={event.tone}
                        style={{ left: `${at}%` }}
                        aria-label={`${event.title}, ${whenWords(event.at, now)}`}
                        onClick={() => toggle(id)}
                        onPointerEnter={() => setLit(event.id)}
                        onPointerLeave={() => setLit(null)}
                      >
                        {event.lines.length > 1 && <b>{event.lines.length}</b>}
                      </button>
                      {event.tone === "planned" && nextIn && (
                        <span className="axt-next" style={{ left: `${at}%` }}>
                          in {nextIn}
                        </span>
                      )}
                      {open === id && (
                        <div
                          className="axt-pop"
                          data-align={at > 62 ? "end" : at < 22 ? "start" : "middle"}
                          style={{ left: `${at}%` }}
                        >
                          <EventPop
                            event={event}
                            vital={vital}
                            now={now}
                            onClose={close}
                            onOpenDestination={onOpenDestination}
                            onAsk={onAsk}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div className="axt-axis" aria-hidden="true">
          <div className="axt-ticks">
            {ticks
              .filter((at) => Math.abs(x(at) - nowX) > 5)
              .map((at) => (
                <span key={at} style={{ left: `${x(at)}%` }}>
                  {clock(at)}
                </span>
              ))}
            <span className="axt-now-label" style={{ left: `${nowX}%` }}>
              Now · {clock(now)}
            </span>
          </div>
        </div>
      </div>

      <div className="axt-sign">
        <span>Little Server, from your network</span>
        <button
          type="button"
          className="axt-log-toggle"
          aria-expanded={showLog}
          aria-controls="axt-log"
          onClick={() => {
            const next = !logOpen;
            setLogOpen(next);
            // Opened by hand: bring the log into view once it unfolds.
            if (next)
              window.setTimeout(
                () =>
                  log.current?.scrollIntoView({
                    block: "nearest",
                    behavior: reducedMotion() ? "auto" : "smooth",
                  }),
                440,
              );
          }}
        >
          {guy.simulating ? "What I'm doing" : "What I did last"}
          <CaretDown weight="bold" />
        </button>
      </div>
      <div className={`axt-log${showLog ? " is-open" : ""}`} id="axt-log" ref={log}>
        <div>
          <div className="axt-log-lines" role="log" aria-live="polite">
            {lines.length === 0 && (
              <div className="axt-log-line" data-tone="info">
                <time>--:--</time>
                <b aria-hidden="true">·</b>
                <span>{planned ? "Nothing has run yet." : "No work recorded yet."}</span>
              </div>
            )}
            {lines.map((line, i) => {
              const previous = lines[i - 1];
              const day = dayName(Date.parse(line.at), now);
              const moment = momentOf[line.id];
              const newest = i === lines.length - 1;
              return (
                <Fragment key={line.id}>
                  {(!previous || dayName(Date.parse(previous.at), now) !== day) && (
                    <div className="axt-log-day">{day}</div>
                  )}
                  <div
                    className={`axt-log-line${newest ? " is-newest" : ""}${moment && lit === moment ? " is-lit" : ""}`}
                    data-tone={line.tone}
                    onPointerEnter={() => setLit(moment ?? null)}
                    onPointerLeave={() => setLit(null)}
                  >
                    <time>{clock(line.at)}</time>
                    <b aria-hidden="true">{glyph[line.tone]}</b>
                    <span>
                      {line.text}
                      {line.invented && (
                        <em>{line.id.startsWith("live:") ? "simulated" : "invented"}</em>
                      )}
                      {newest && guy.running && <i className="axt-caret" aria-hidden="true" />}
                    </span>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
