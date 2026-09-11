"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction A, Story: History as a calm feed. One sentence says how the
// record reads and a tactile filter narrows it. Each entry says what happened
// in plain words without a click, on a quiet rail of days; a failure points
// to the work that resolved it, and its evidence opens in place.

import { ArrowRight, CaretDown, ChatCircleText } from "@phosphor-icons/react";
import { useState } from "react";

import type { OperationStep } from "@/server/operation-record";

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
} from "./history-model";
import type { HistoryDirectionProps } from "./index";
import "./feed.css";

const stepGlyph: Record<OperationStep["state"], string> = {
  done: "✓",
  active: "›",
  failed: "✗",
  pending: "·",
};

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
  const [flash, setFlash] = useState<string | null>(null);

  // Following a thread shows everything, then lands on the work it names.
  const jump = (id: string) => {
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
  };

  const since = history.since
    ? new Date(history.since).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : null;
  const unresolved = history.failed - history.resolved;
  const sentence = !history.total
    ? "Nothing recorded yet. Work appears here as it happens."
    : `${history.total} ${history.total === 1 ? "operation" : "operations"}${since ? ` since ${since}` : ""}. ${history.verified} verified${
        history.failed
          ? unresolved
            ? `; ${unresolved} failed and still need${unresolved === 1 ? "s" : ""} you`
            : `; ${history.failed} failed and ${history.failed === 1 ? "was" : "were"} resolved`
          : ""
      }.`;

  const row = (entry: Entry) => {
    const op = entry.op;
    const expanded = open === op.id;
    const evidence = Boolean(op.evidence || op.steps?.length);
    const finished = op.state === "verified" || op.state === "inspected";
    const first = op.destinations.find((item) => item !== "history");
    return (
      <li
        key={op.id}
        id={`axh-${op.id}`}
        className={`axh-row${flash === op.id ? " is-flash" : ""}`}
        data-state={op.state}
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
              onClick={() => jump(entry.resolver!.id)}
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
              onClick={() => jump(entry.resolves!.id)}
            >
              Resolves the failure at {clockOf(settledAt(entry.resolves))}
              <ArrowRight weight="bold" />
            </button>
          )}
          {op.state === "queued" && op.waitingForId && (
            <button
              type="button"
              className="axh-thread is-back"
              onClick={() => jump(op.waitingForId!)}
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
                        finished && step.state === "active"
                          ? "done"
                          : step.state;
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
              onClick={() =>
                setOpen((current) => (current === op.id ? null : op.id))
              }
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
  };

  return (
    <section className="axh" aria-label="History">
      {head}
      <div className="axh-top">
        <p className="axh-sum">{sentence}</p>
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
