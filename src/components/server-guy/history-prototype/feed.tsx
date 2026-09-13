"use client";

// PROTOTYPE · chosen on claude/deployment-history.
// One operation on History's line: what happened in plain words, the thread
// to the work that resolved it, and its evidence opening in place. Also the
// thread jump and the record's one sentence.

import { ArrowRight, CaretDown, ChatCircleText } from "@phosphor-icons/react";
import { useCallback, useState, type ReactNode } from "react";

import type {
  ApplicationOperation,
  OperationStep,
} from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import { labelOf } from "../operation-model";
import { reducedMotion } from "../architecture-prototype/motion";
import { OpChip } from "../overview-prototype/shared";
import {
  clockOf,
  later,
  settledAt,
  type Entry,
  type Filter,
  type HistoryRecord,
} from "./history-model";
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
    return "No operations recorded yet. Work appears here as it happens.";
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
      ? // "and still needs you" is a claim about the present, and nothing on
        // record supports it: failure-and-repair pairing is deferred, so a
        // failure someone fixed an hour later still counts here. The number is
        // a fact; what it means for you is not yet knowable.
        `; ${unresolved} failed`
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
  /** The line's own state for the row, such as "is-linked". */
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
