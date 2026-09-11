"use client";
import { useState, type ReactNode } from "react";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ActivityEvent, Decision } from "@/server/types";
import { OperationSteps, StateChip } from "../operation-receipt";
import { LocalTime } from "../local-time";
import { relativeTime, attentionItems, labelOf } from "../operation-model";
import type { ViewProps } from "./bits";

const filters = [
  "All",
  "Changes",
  "Inspections",
  "Outside chat",
  "Needs you",
] as const;

/** Operations that happened on the same local day share one heading. */
function dayOf(iso: string) {
  return new Date(iso).toDateString();
}

export function HistoryView({
  operations,
  chats,
  now,
  onOpenConversation,
  onOpenDestination,
  decisions = [],
  activity = [],
  decisionFor,
}: ViewProps & {
  /** Active saved requirements, with when each was saved. */
  decisions?: Decision[];
  /** Application events, including retained history of retired work. */
  activity?: ActivityEvent[];
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const needs = new Set(attentionItems(operations).map((item) => item.id));
  const matches = (item: ApplicationOperation, value: string) =>
    value === "All" ||
    (value === "Changes" && item.kind === "change") ||
    (value === "Inspections" && item.kind === "inspection") ||
    (value === "Outside chat" && !item.origin) ||
    (value === "Needs you" && needs.has(item.id));
  const rank = (item: ApplicationOperation) =>
    item.state === "working"
      ? 0
      : item.state === "queued"
        ? 1
        : item.state === "proposed"
          ? 2
          : 3;
  const shown = operations
    .filter((item) => matches(item, filter))
    .toSorted(
      (a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt),
    );
  // Unsettled work stays at the top; everything settled groups by day.
  const live = shown.filter((item) => rank(item) < 3);
  const settled = shown.filter((item) => rank(item) === 3);
  const days: { day: string; items: ApplicationOperation[] }[] = [];
  for (const item of settled) {
    const day = dayOf(item.updatedAt);
    const last = days.at(-1);
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  const row = (item: ApplicationOperation) => {
    const resolver = item.resolvedById
      ? operations.find(
          (candidate) =>
            candidate.id === item.resolvedById &&
            candidate.state === "verified",
        )
      : undefined;
    return (
      <li key={item.id} id={`operation-${item.id}`}>
        <button
          type="button"
          className="sg-history-open"
          onClick={() =>
            item.origin
              ? onOpenConversation(item.origin.chatId, item.origin.messageId)
              : onOpenDestination(
                  item.destinations[0] === "history"
                    ? "overview"
                    : item.destinations[0],
                )
          }
        >
          <StateChip state={item.state} />
          <span>
            <strong>{item.title}</strong>
            <small>
              {item.origin
                ? `from ${chats.find((chat) => chat.id === item.origin!.chatId)?.title ?? "its conversation"}`
                : item.source.type === "logs"
                  ? "Log collection"
                  : item.source.type === "deployment"
                    ? "Deployment record"
                    : "automatic"}{" "}
              · {labelOf(item.destinations[0])}
            </small>
          </span>
          <span className="sg-op-rel">
            {relativeTime(item.updatedAt, now)} ·{" "}
            <LocalTime value={item.updatedAt} variant="compact" />
          </span>
        </button>
        {item.state === "queued" && (
          <p className="sg-op-muted">
            Queued · after{" "}
            <button
              type="button"
              className="sg-op-text-link"
              onClick={() =>
                document
                  .getElementById(`operation-${item.waitingForId}`)
                  ?.scrollIntoView({ block: "center" })
              }
            >
              {item.waitingForTitle ?? "the current change"}
            </button>
          </p>
        )}
        {item.state === "proposed" && (
          <p className="sg-op-muted">{item.summary}</p>
        )}
        {item.state === "failed" && item.next && (
          <p className={resolver ? "sg-history-reason" : "sg-op-next"}>
            {item.next}
          </p>
        )}
        {resolver && (
          <p className="sg-history-resolved">
            Resolved by
            <button
              type="button"
              className="sg-op-text-link"
              onClick={() => {
                setFilter("All");
                requestAnimationFrame(() =>
                  document
                    .getElementById(`operation-${resolver.id}`)
                    ?.scrollIntoView({ block: "center" }),
                );
              }}
            >
              {resolver.title}
            </button>
            · verified {relativeTime(resolver.updatedAt, now)}
          </p>
        )}
        {(item.evidence || item.steps?.length || resolver) && (
          <details className="sg-history-details">
            <summary>View recorded evidence</summary>
            <p>{item.evidence ?? item.summary}</p>
            <OperationSteps steps={item.steps} />
            <span className="sg-op-muted">
              {item.destinations.map(labelOf).join(" · ")}
            </span>
          </details>
        )}
        {decisionFor?.(item)}
      </li>
    );
  };
  return (
    <>
      <div
        className="sg-history-filters"
        role="group"
        aria-label="Filter operation history"
      >
        {filters.map((value) => {
          const count = operations.filter((item) =>
            matches(item, value),
          ).length;
          return (
            <button
              type="button"
              key={value}
              aria-pressed={filter === value}
              className="sg-op-ref"
              disabled={count === 0 && value !== "All"}
              onClick={() => setFilter(value)}
            >
              {value} <span className="sg-filter-count">{count}</span>
            </button>
          );
        })}
      </div>
      {!shown.length && (
        <p className="sg-section-note">
          {operations.length
            ? "No operations match this filter."
            : "No operations recorded yet. Work will appear here as it happens."}
        </p>
      )}
      {live.length > 0 && (
        <div className="sg-band">
          <h2>Open now</h2>
          <ol className="sg-operation-history">{live.map(row)}</ol>
        </div>
      )}
      {days.map((group) => (
        <div className="sg-band" key={group.day}>
          <h2>
            <LocalTime value={group.items[0].updatedAt} variant="date" />
          </h2>
          <ol className="sg-operation-history">{group.items.map(row)}</ol>
        </div>
      ))}
      {filter === "All" && (
        <HistoryRecords decisions={decisions} activity={activity} />
      )}
    </>
  );
}

/**
 * The durable records beside the operations: saved requirements and
 * application events. Operation filters do not apply to them, so pages show
 * them only with every operation listed.
 */
export function HistoryRecords({
  decisions,
  activity,
  className = "sg-band",
}: {
  /** Active saved requirements, with when each was saved. */
  decisions: Decision[];
  /** Application events, including retained history of retired work. */
  activity: ActivityEvent[];
  /** Each record group's class in the page that shows it. */
  className?: string;
}) {
  const [allActivity, setAllActivity] = useState(false);
  return (
    <>
      {decisions.length > 0 && (
        <section
          className={className}
          id="history-requirements"
          aria-labelledby="history-requirements-title"
        >
          <h2 id="history-requirements-title">Saved requirements</h2>
          <ul className="sg-history-records">
            {decisions.map((decision) => (
              <li key={decision.id}>
                <strong>{decision.value}</strong>
                <small>
                  Saved{" "}
                  <LocalTime value={decision.createdAt} variant="compact" />
                </small>
              </li>
            ))}
          </ul>
        </section>
      )}
      {activity.length > 0 && (
        <section
          className={className}
          id="history-activity"
          aria-labelledby="history-activity-title"
        >
          <h2 id="history-activity-title">Application activity</h2>
          <ul className="sg-history-records">
            {(allActivity ? activity : activity.slice(0, 12)).map((event) => (
              <li key={event.id}>
                <strong>{event.summary}</strong>
                <small>
                  <LocalTime value={event.createdAt} variant="compact" />
                </small>
                {event.detail && <p>{event.detail}</p>}
              </li>
            ))}
          </ul>
          {activity.length > 12 && !allActivity && (
            <button
              type="button"
              className="sg-op-text-link"
              onClick={() => setAllActivity(true)}
            >
              Show all {activity.length} events
            </button>
          )}
        </section>
      )}
    </>
  );
}
