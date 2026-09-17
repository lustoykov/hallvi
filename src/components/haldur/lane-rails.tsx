"use client";

// Rails: what happened in each area of an application, and how long ago.
//
// Overview and Database used to draw dots on a linear time axis. The dots
// piled up against "now", said nothing until hovered, and sat under names
// ("Checks", "Access") that meant little to anyone who had not built the
// page. A rail has no time scale: its stops are evenly spaced, in order, each
// one worded as something that happened, with the quiet between them written
// on the line. Only the stretch from the last stop to now wears the lane's
// state, because a lane that is failing now did not fail at every stop. Each
// lane opens with the question it answers, the answer, and one plain
// sentence about what it covers. "Earlier" walks back through its history.

import {
  ArrowRight,
  CaretLeft,
  CaretRight,
  Check,
  Minus,
  X,
} from "@phosphor-icons/react";
import { useCallback, useState, type ReactNode } from "react";

import { useDismiss } from "./overview-prototype/shared";
import "./lane-rails.css";

export interface RailEvent {
  id: string;
  at: number;
  tone: "pass" | "fail" | "info" | "planned";
  title: string;
  detail: string;
}
export interface RailLane {
  id: string;
  icon: ReactNode;
  name: string;
  /** The lane as the question an owner would ask. */
  question: string;
  /** One plain sentence about what it covers. */
  plain: string;
  status: string;
  tone: "verified" | "stale" | "failed" | "absent" | "fact";
  /** Oldest first; a planned one is in the future. */
  events: RailEvent[];
  /** What to say on the rail when nothing is on record. */
  ghost: string | null;
  /** Live words for the planned stop, such as a countdown. */
  nextIn?: string | null;
  pointed?: boolean;
  /** Where a stop's default popover leads. */
  action?: { label: string; run: () => void };
}

const PAGE = 4;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function lasted(ms: number) {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))} min`;
  if (ms < 2 * DAY) return `${Math.round(ms / HOUR)} h`;
  return `${Math.round(ms / DAY)} days`;
}
/** "Today 09:04", "Yesterday 13:10", "Sep 15 13:04". */
function stamp(at: number, now: number) {
  const midnight = (time: number) => new Date(time).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(now) - midnight(at)) / DAY);
  const day =
    days === 0
      ? "Today"
      : days === 1
        ? "Yesterday"
        : days === -1
          ? "Tomorrow"
          : new Date(at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
  const clock = new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${day} ${clock}`;
}

/** Record keys, as something a person would say happened. */
function friendly(title: string) {
  const counted = /^(\d+) checks?( passed)?$/i.exec(title);
  if (counted) return `${counted[1]} checks passed`;
  return (
    (
      {
        written: "Backup copied",
        configured: "Backups set up",
        ssh: "Logged in to the server",
        valid: "Certificate valid",
        answering: "Database answered",
      } as Record<string, string>
    )[title.toLowerCase()] ?? title
  );
}

/** The answer in a word. Copies with no restore test are not a "no". */
const answerOf = (lane: RailLane) =>
  lane.tone === "verified" || lane.tone === "fact"
    ? "Yes"
    : lane.tone === "stale"
      ? "Last time, yes"
      : lane.tone === "failed"
        ? "No"
        : lane.events.some((event) => event.tone !== "planned")
          ? "Not proven"
          : "Not known yet";

function Rail({
  lane,
  now,
  open,
  onToggle,
  onLit,
  lanePop,
  eventPop,
}: {
  lane: RailLane;
  now: number;
  open: string | null;
  onToggle: (id: string) => void;
  onLit?: (eventId: string | null) => void;
  lanePop?: (laneId: string) => ReactNode;
  eventPop?: (laneId: string, eventId: string) => ReactNode;
}) {
  const [back, setBack] = useState(0);
  const events = lane.events.filter(
    (event) => event.tone !== "planned" && event.at <= now,
  );
  const coming = lane.events.find(
    (event) => event.tone === "planned" || event.at > now,
  );
  const end = events.length - back;
  const stops = events.slice(Math.max(0, end - PAGE), end);
  const earlier = Math.max(0, end - PAGE);
  const last = events.at(-1);
  const titleId = `lane:${lane.id}`;

  return (
    <div
      className={`axlr-lane${lane.pointed ? " is-pointed" : ""}`}
      data-c={lane.tone}
    >
      <div className="axlr-title">
        <button
          type="button"
          className="axlr-name"
          aria-expanded={lanePop ? open === titleId : undefined}
          disabled={!lanePop}
          onClick={() => onToggle(titleId)}
        >
          <span className="axlr-icon" aria-hidden="true">
            {lane.icon}
          </span>
          <span>
            <small>{lane.name}</small>
            <b>{lane.question}</b>
          </span>
        </button>
        <p className="axlr-answer">
          <em>{answerOf(lane)}</em>
          {lane.status}
        </p>
        <p className="axlr-plain">{lane.plain}</p>
        {lanePop && open === titleId && (
          <div className="axlr-pop is-lane">{lanePop(lane.id)}</div>
        )}
      </div>

      <div className="axlr-rail">
        <button
          type="button"
          className="axlr-page"
          disabled={!earlier}
          onClick={() => setBack(back + PAGE)}
          aria-label={`${earlier} earlier`}
        >
          <CaretLeft weight="bold" />
          {earlier > 0 && <small>{earlier} earlier</small>}
        </button>
        {!events.length && (
          <span className="axlr-none">{lane.ghost ?? "Nothing on record"}</span>
        )}
        {stops.map((event, index) => {
          const before = stops[index - 1];
          const id = `event:${event.id}`;
          return (
            <div key={event.id} className="axlr-stop">
              <span
                className="axlr-leg"
                data-long={
                  (before && event.at - before.at > 6 * HOUR) || undefined
                }
              >
                {before && <em>{lasted(event.at - before.at)}</em>}
              </span>
              <button
                type="button"
                className="axlr-station"
                data-tone={event.tone}
                aria-expanded={open === id}
                onClick={() => onToggle(id)}
                onPointerEnter={() => onLit?.(event.id)}
                onPointerLeave={() => onLit?.(null)}
              >
                <span className="axlr-ring">
                  {event.tone === "fail" ? (
                    <X weight="bold" />
                  ) : event.tone === "info" ? (
                    <Minus weight="bold" />
                  ) : (
                    <Check weight="bold" />
                  )}
                </span>
                <b>{friendly(event.title)}</b>
                <small>{stamp(event.at, now)}</small>
              </button>
              {open === id && (
                <div className="axlr-pop">
                  {eventPop?.(lane.id, event.id) ?? (
                    <div className="axlr-card" role="dialog">
                      <b>{friendly(event.title)}</b>
                      <small>
                        {stamp(event.at, now)} · {lasted(now - event.at)} ago
                      </small>
                      {event.detail && <p>{event.detail}</p>}
                      {lane.action && (
                        <button type="button" onClick={lane.action.run}>
                          {lane.action.label}
                          <ArrowRight weight="bold" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {back > 0 ? (
          <button
            type="button"
            className="axlr-page"
            onClick={() => setBack(Math.max(0, back - PAGE))}
          >
            <CaretRight weight="bold" />
            <small>Later</small>
          </button>
        ) : (
          <>
            <div className="axlr-stop axlr-end">
              <span className="axlr-leg axlr-since">
                {last && <em>{lasted(now - last.at)}</em>}
                <i aria-hidden="true" />
              </span>
              <span className="axlr-now">Now</span>
            </div>
            {coming && (
              <div className="axlr-stop axlr-end">
                <span className="axlr-leg axlr-future">
                  <em>in {lane.nextIn ?? lasted(coming.at - now)}</em>
                </span>
                <span className="axlr-station axlr-planned">
                  <span className="axlr-ring" />
                  <b>{friendly(coming.title)}</b>
                  <small>{stamp(coming.at, now)}</small>
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function LaneRails({
  lanes,
  now,
  mascot,
  onLit,
  lanePop,
  eventPop,
}: {
  lanes: RailLane[];
  now: number;
  /** Little Server, standing on the corner of the card. */
  mascot?: ReactNode;
  /** Pointing at a stop, so a log beside it can light the same moment. */
  onLit?: (eventId: string | null) => void;
  /** What opens from a lane's title; the close handler is the caller's. */
  lanePop?: (laneId: string, close: () => void) => ReactNode;
  eventPop?: (laneId: string, eventId: string, close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(Boolean(open), ".axlr-pop, .axlr-station, .axlr-name", close);
  const toggle = (id: string) =>
    setOpen((current) => (current === id ? null : id));

  return (
    <div className="axlr">
      {mascot && <div className="axlr-mascot">{mascot}</div>}
      {lanes.map((lane) => (
        <Rail
          key={lane.id}
          lane={lane}
          now={now}
          open={open}
          onToggle={toggle}
          onLit={onLit}
          lanePop={lanePop && ((laneId) => lanePop(laneId, close))}
          eventPop={
            eventPop && ((laneId, eventId) => eventPop(laneId, eventId, close))
          }
        />
      ))}
    </div>
  );
}
