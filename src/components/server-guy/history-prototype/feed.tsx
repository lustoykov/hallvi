"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction A, Story: History as a calm feed. One sentence says how the
// record reads and a tactile filter narrows it. Each entry says what happened
// in plain words without a click, on a quiet rail of days; a failure points
// to the work that resolved it, and its evidence opens in place. The row,
// the thread jump and the sentence are shared with C and D.

import { ArrowRight, CaretDown, ChatCircleText } from "@phosphor-icons/react";
import { useCallback, useState, type ReactNode } from "react";

import type {
  ApplicationOperation,
  OperationStep,
} from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import { labelOf } from "../operation-model";
import { reducedMotion } from "../architecture-prototype/motion";
import { TactileSlider } from "../architecture-prototype/tactile-slider";
import { OpChip } from "../overview-prototype/shared";
import {
  clockOf,
  dayName,
  FILTERS,
  later,
  settledAt,
  type Entry,
  type Filter,
  type HistoryRecord,
} from "./history-model";
import type { HistoryDirectionProps } from "./index";
import "./feed.css";

const stepGlyph: Record<OperationStep["state"], string> = {
  done: "✓",
  active: "›",
  failed: "✗",
  pending: "·",
};

/** The whole record in one sentence. */
export function sentenceOf(history: HistoryRecord) {
  if (!history.total)
    return "Nothing recorded yet. Work appears here as it happens.";
  const since = history.since
    ? new Date(history.since).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;
  const unresolved = history.failed - history.resolved;
  const failures = !history.failed
    ? ""
    : unresolved
      ? `; ${unresolved} failed and still need${unresolved === 1 ? "s" : ""} you`
      : `; ${history.failed} failed and ${history.failed === 1 ? "was" : "were"} resolved`;
  return `${history.total} ${history.total === 1 ? "operation" : "operations"}${since ? ` since ${since}` : ""}. ${history.verified} verified${failures}.`;
}

/** Following a thread shows everything, then lands on the work it names. */
export function useJump(onFilter: (filter: Filter) => void) {
  const [flash, setFlash] = useState<string | null>(null);
  const jump = useCallback(
    (id: string) => {
      onFilter("All");
      setFlash(id);
      requestAnimationFrame(() =>
        document.getElementById(`axh-${id}`)?.scrollIntoView({
          block: "center",
          behavior: reducedMotion() ? "auto" : "smooth",
        }),
      );
      window.setTimeout(
        () => setFlash((current) => (current === id ? null : current)),
        1700,
      );
    },
    [onFilter],
  );
  return { flash, jump };
}

export function FeedRow({
  entry,
  expanded,
  onToggle,
  flash,
  onJump,
  decisionFor,
  onOpenConversation,
  onOpenDestination,
  className,
  onPointerEnter,
  onPointerLeave,
}: {
  entry: Entry;
  expanded: boolean;
  onToggle: () => void;
  flash: boolean;
  onJump: (id: string) => void;
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
  /** A direction's own state for the row, such as "is-later". */
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}) {
  const op = entry.op;
  const evidence = Boolean(op.evidence || op.steps?.length);
  const finished = op.state === "verified" || op.state === "inspected";
  const first = op.destinations.find((item) => item !== "history");
  return (
    <li
      id={`axh-${op.id}`}
      className={`axh-row${flash ? " is-flash" : ""}${className ? ` ${className}` : ""}`}
      data-state={op.state}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <time className="axh-time" dateTime={entry.at}>
        {clockOf(entry.at)}
      </time>
      <span className="axh-dot" aria-hidden="true" />
      <div className="axh-body">
        <div className="axh-head">
          <OpChip state={op.state} />
          <b className="axh-title">{op.title}</b>
        </div>
        <p className="axh-summary">{entry.summary}</p>
        <p className="axh-meta">
          {entry.from}
          {entry.where.length > 0 &&
            ` · ${entry.where.slice(0, 3).join(", ")}${entry.where.length > 3 ? ` and ${entry.where.length - 3} more` : ""}`}
        </p>
        {entry.resolver && (
          <button
            type="button"
            className="axh-thread"
            onClick={() => onJump(entry.resolver!.id)}
          >
            Resolved{" "}
            {later(
              Date.parse(settledAt(entry.resolver)) - Date.parse(entry.at),
            )}{" "}
            by {entry.resolver.title}
            <ArrowRight weight="bold" />
          </button>
        )}
        {entry.resolves && (
          <button
            type="button"
            className="axh-thread is-back"
            onClick={() => onJump(entry.resolves!.id)}
          >
            Resolves the failure at {clockOf(settledAt(entry.resolves))}
            <ArrowRight weight="bold" />
          </button>
        )}
        {op.state === "queued" && op.waitingForId && (
          <button
            type="button"
            className="axh-thread is-back"
            onClick={() => onJump(op.waitingForId!)}
          >
            Waits for {op.waitingForTitle ?? "the current change"}
            <ArrowRight weight="bold" />
          </button>
        )}
        {evidence && (
          <div className={`axh-evidence${expanded ? " is-open" : ""}`}>
            <div>
              {op.evidence && op.evidence !== entry.summary && (
                <p>{op.evidence}</p>
              )}
              {op.steps && op.steps.length > 0 && (
                <div className="axh-console" role="list">
                  {op.steps.map((step, index) => {
                    // Finished work has no step still in progress.
                    const state =
                      finished && step.state === "active" ? "done" : step.state;
                    return (
                      <div
                        key={`${index}:${step.label}`}
                        className="axh-step"
                        data-state={state}
                        role="listitem"
                      >
                        <b aria-hidden="true">{stepGlyph[state]}</b>
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {decisionFor?.(op)}
      </div>
      <div className="axh-actions">
        {evidence && (
          <button
            type="button"
            className="axh-more"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            Evidence
            <CaretDown weight="bold" />
          </button>
        )}
        {op.origin ? (
          <button
            type="button"
            className="axh-go"
            aria-label="Open its conversation"
            title="Open its conversation"
            onClick={() =>
              onOpenConversation(op.origin!.chatId, op.origin!.messageId)
            }
          >
            <ChatCircleText weight="bold" />
          </button>
        ) : (
          first && (
            <button
              type="button"
              className="axh-go"
              aria-label={`Open ${labelOf(first)}`}
              title={`Open ${labelOf(first)}`}
              onClick={() => onOpenDestination(first)}
            >
              <ArrowRight weight="bold" />
            </button>
          )
        )}
      </div>
    </li>
  );
}

export function FeedDirection({
  history,
  filter,
  onFilter,
  now,
  head,
  decisionFor,
  onOpenConversation,
  onOpenDestination,
}: HistoryDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const { flash, jump } = useJump(onFilter);
  const row = (entry: Entry) => (
    <FeedRow
      key={entry.op.id}
      entry={entry}
      expanded={open === entry.op.id}
      onToggle={() =>
        setOpen((current) => (current === entry.op.id ? null : entry.op.id))
      }
      flash={flash === entry.op.id}
      onJump={jump}
      decisionFor={decisionFor}
      onOpenConversation={onOpenConversation}
      onOpenDestination={onOpenDestination}
    />
  );

  return (
    <section className="axh" aria-label="History">
      {head}
      <div className="axh-top">
        <p className="axh-sum">{sentenceOf(history)}</p>
        <div className="axh-filter">
          <TactileSlider
            label="Show"
            size="sm"
            options={FILTERS.map((value) => ({
              id: value,
              label: `${value} ${history.counts[value]}`,
            }))}
            value={filter}
            onChange={onFilter}
          />
        </div>
      </div>
      {history.open.length > 0 && (
        <section className="axh-group is-live" aria-label="Open now">
          <h2>Open now</h2>
          <ol className="axh-list">{history.open.map(row)}</ol>
        </section>
      )}
      {history.days.map((day) => (
        <section key={day.key} className="axh-group" aria-label={day.key}>
          <h2>{dayName(day.at, now)}</h2>
          <ol className="axh-list">{day.entries.map(row)}</ol>
        </section>
      ))}
      {!history.open.length && !history.days.length && history.total > 0 && (
        <p className="axh-empty">Nothing matches this filter.</p>
      )}
    </section>
  );
}
