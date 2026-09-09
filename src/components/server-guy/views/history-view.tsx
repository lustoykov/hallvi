"use client";
import { useState, type ReactNode } from "react";
import type { ApplicationOperation } from "@/server/operation-record";
import { StateChip } from "../operation-receipt";
import { LocalTime } from "../local-time";
import { relativeTime, attentionItems } from "../operation-model";
import type { ViewProps } from "./bits";

const filters = [
  "All",
  "Changes",
  "Inspections",
  "Automatic",
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
  decisionFor,
}: ViewProps & {
  decisionFor?: (operation: ApplicationOperation) => ReactNode;
}) {
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const needs = new Set(attentionItems(operations).map((item) => item.id));
  const matches = (item: ApplicationOperation, value: string) =>
    value === "All" ||
    (value === "Changes" && item.kind === "change") ||
    (value === "Inspections" && item.kind === "inspection") ||
    (value === "Automatic" && !item.origin) ||
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
  const row = (item: ApplicationOperation) => (
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
              : "automatic"}{" "}
            · {item.destinations.join(" · ")}
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
        <p className="sg-op-next">{item.next}</p>
      )}
      {decisionFor?.(item)}
    </li>
  );
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
    </>
  );
}
