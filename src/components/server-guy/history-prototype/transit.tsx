"use client";

// PROTOTYPE · chosen on claude/deployment-history.
// Transit: History as a line with a timetable. A sticky
// almanac on the left says how the record reads, filters it and lists its
// days. On the right every operation is a stop on the line, its time in a
// timetable column, and a failure is tied to the work that resolved it by
// a thread in the gutter; pointing at either stop sends a light along it,
// from the failure to the fix. Nothing moves on arrival.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { ApplicationOperation } from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";

import { reducedMotion } from "../architecture-prototype/motion";
import { FeedRow, sentenceOf, useJump } from "./feed";
import {
  dayName,
  FILTERS,
  type Entry,
  type Filter,
  type HistoryRecord,
} from "./history-model";
/** What the History page hands this layout. */
export interface HistoryDirectionProps {
  history: HistoryRecord;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  now: number;
  head: ReactNode;
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  /** Prototype-only addition above the shipped line. */
  feedLead?: ReactNode;
  /** Prototype-only detail rendered inside a row's Evidence disclosure. */
  expandedDetailFor?: (operation: ApplicationOperation) => ReactNode;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}
import "./transit.css";

interface Arc {
  id: string;
  d: string;
}

const goTo = (id: string) =>
  document.getElementById(id)?.scrollIntoView({
    block: "start",
    behavior: reducedMotion() ? "auto" : "smooth",
  });

export function TransitHistory({
  history,
  filter,
  onFilter,
  now,
  head,
  decisionFor,
  feedLead,
  expandedDetailFor,
  onOpenConversation,
  onOpenDestination,
}: HistoryDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { flash, jump } = useJump(onFilter);
  const feed = useRef<HTMLDivElement>(null);

  const entries = useMemo(
    () => [...history.open, ...history.days.flatMap((day) => day.entries)],
    [history],
  );
  // A thread runs from a failure to the work that resolved it, when both
  // are on the page.
  const threads = useMemo(
    () =>
      entries
        .filter(
          (entry) =>
            entry.op.state === "failed" &&
            entry.resolver &&
            entries.some((other) => other.op.id === entry.resolver!.id),
        )
        .map((entry) => ({ id: entry.op.id, to: entry.resolver!.id })),
    [entries],
  );
  const threadOf = (entry: Entry) =>
    entry.op.state === "failed" && entry.resolver
      ? entry.op.id
      : (entry.resolves?.id ?? null);

  // The threads follow the stops: measured whenever the feed changes size,
  // an opening row included.
  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const measure = () => {
      const box = element.getBoundingClientRect();
      const centre = (id: string) => {
        const dot = document
          .getElementById(`axh-${id}`)
          ?.querySelector(".axh-dot");
        if (!dot) return null;
        const rect = dot.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2 - box.left,
          y: rect.top + rect.height / 2 - box.top,
        };
      };
      setSize({ width: box.width, height: box.height });
      setArcs(
        threads.flatMap((thread) => {
          const a = centre(thread.id);
          const b = centre(thread.to);
          if (!a || !b) return [];
          const bow = Math.min(50, 18 + Math.abs(b.y - a.y) * 0.12);
          return [
            {
              id: thread.id,
              d: `M ${a.x} ${a.y} C ${a.x - bow} ${a.y}, ${b.x - bow} ${b.y}, ${b.x} ${b.y}`,
            },
          ];
        }),
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [threads]);

  const row = (entry: Entry) => {
    const thread = threadOf(entry);
    return (
      <FeedRow
        key={entry.op.id}
        entry={entry}
        expanded={open === entry.op.id}
        onToggle={() =>
          setOpen((value) => (value === entry.op.id ? null : entry.op.id))
        }
        flash={flash === entry.op.id}
        onJump={jump}
        decisionFor={decisionFor}
        expandedDetail={expandedDetailFor?.(entry.op)}
        onOpenConversation={onOpenConversation}
        onOpenDestination={onOpenDestination}
        className={thread && lit === thread ? "is-linked" : undefined}
        onPointerEnter={thread ? () => setLit(thread) : undefined}
        onPointerLeave={thread ? () => setLit(null) : undefined}
      />
    );
  };

  return (
    <section className="axh axhm" aria-label="History">
      {head}
      <div className="axhm-body">
        <aside className="axhm-almanac" aria-label="The record">
          <p className="axhm-sum">{sentenceOf(history)}</p>
          <div
            className="axhm-filters"
            role="group"
            aria-label="Filter operation history"
          >
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                disabled={!history.counts[value] && value !== "All"}
                onClick={() => onFilter(value)}
              >
                <span>{value}</span>
                <b>{history.counts[value]}</b>
              </button>
            ))}
          </div>
          {(history.open.length > 0 || history.days.length > 0) && (
            <nav className="axhm-index" aria-label="Days">
              <ol>
                {history.open.length > 0 && (
                  <li>
                    <button type="button" onClick={() => goTo("axhm-open")}>
                      <span>Open now</span>
                      <i aria-hidden="true">
                        {history.open.map((entry) => (
                          <em key={entry.op.id} data-state={entry.op.state} />
                        ))}
                      </i>
                    </button>
                  </li>
                )}
                {history.days.map((day, index) => (
                  <li key={day.key}>
                    <button
                      type="button"
                      onClick={() => goTo(`axhm-day-${index}`)}
                    >
                      <span>{dayName(day.at, now)}</span>
                      <i aria-hidden="true">
                        {day.entries.map((entry) => (
                          <em key={entry.op.id} data-state={entry.op.state} />
                        ))}
                      </i>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          )}
        </aside>

        <div ref={feed} className="axhm-feed">
          <svg
            className="axhm-arcs"
            width={size.width}
            height={size.height}
            aria-hidden="true"
          >
            {arcs.map((arc) => (
              <g key={arc.id} className={lit === arc.id ? "is-lit" : undefined}>
                <path className="axhm-arc" d={arc.d} />
                <path className="axhm-flow" d={arc.d} pathLength={100} />
              </g>
            ))}
          </svg>
          {feedLead}
          {history.open.length > 0 && (
            <section
              id="axhm-open"
              className="axh-group is-live"
              aria-label="Open now"
            >
              <h2>Open now</h2>
              <ol className="axh-list">{history.open.map(row)}</ol>
            </section>
          )}
          {history.days.map((day, index) => (
            <section
              key={day.key}
              id={`axhm-day-${index}`}
              className="axh-group"
              aria-label={day.key}
            >
              <h2>{dayName(day.at, now)}</h2>
              <ol className="axh-list">{day.entries.map(row)}</ol>
            </section>
          ))}
          {!entries.length && history.total > 0 && (
            <p className="axh-empty">Nothing matches this filter.</p>
          )}
        </div>
      </div>
    </section>
  );
}
