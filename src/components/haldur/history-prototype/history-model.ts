// PROTOTYPE · claude/deployment-history · throwaway.
// History's record for the redesigned directions: the filters and their
// counts, what is open now, settled work grouped by the viewer's own day,
// and the thread from a failure to the work that resolved it.

import type { ApplicationOperation } from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import { attentionItems, labelOf } from "../operation-model";

export const FILTERS = [
  "All",
  "Changes",
  "Inspections",
  "Outside chat",
  "Needs you",
] as const;
export type Filter = (typeof FILTERS)[number];

export interface Entry {
  op: ApplicationOperation;
  /** When the work last moved; see settledAt. */
  at: string;
  /** Where it came from: a conversation, or the work itself. */
  from: string;
  /** The destinations it touched, History itself left out. */
  where: string[];
  summary: string;
  /** The later work that resolved this failure. */
  resolver: ApplicationOperation | null;
  /** The failure this work resolved. */
  resolves: ApplicationOperation | null;
  needsYou: boolean;
}
export interface Day {
  key: string;
  at: string;
  entries: Entry[];
}
export interface HistoryRecord {
  counts: Record<Filter, number>;
  open: Entry[];
  days: Day[];
  total: number;
  verified: number;
  failed: number;
  resolved: number;
  since: string | null;
}

const rank = (op: ApplicationOperation) =>
  op.state === "working"
    ? 0
    : op.state === "queued"
      ? 1
      : op.state === "proposed"
        ? 2
        : 3;

/**
 * When the work settled. Finished work settled at its newest recorded step:
 * its updatedAt can be later, since a deployment's is its record's and moves
 * whenever the record is rewritten. Anything else is as of its last update.
 */
export function settledAt(op: ApplicationOperation) {
  if (op.state !== "verified" && op.state !== "inspected") return op.updatedAt;
  return (
    op.steps
      ?.map((step) => step.at)
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1) ?? op.updatedAt
  );
}

export function buildHistory(
  operations: ApplicationOperation[],
  chats: ChatSummary[],
  filter: Filter,
): HistoryRecord {
  const needs = new Set(attentionItems(operations).map((item) => item.id));
  const matches = (op: ApplicationOperation, value: Filter) =>
    value === "All" ||
    (value === "Changes" && op.kind === "change") ||
    (value === "Inspections" && op.kind === "inspection") ||
    (value === "Outside chat" && !op.origin) ||
    (value === "Needs you" && needs.has(op.id));
  const byId = new Map(operations.map((op) => [op.id, op]));
  const entry = (op: ApplicationOperation): Entry => {
    const resolver = op.resolvedById ? byId.get(op.resolvedById) : undefined;
    return {
      op,
      at: settledAt(op),
      from: op.origin
        ? `from ${chats.find((chat) => chat.id === op.origin!.chatId)?.title ?? "its conversation"}`
        : op.source.type === "logs"
          ? "Log collection"
          : op.source.type === "deployment"
            ? "Deployment record"
            : "Automatic",
      where: op.destinations
        .filter((destination) => destination !== "history")
        .map(labelOf),
      summary: op.state === "failed" ? (op.next ?? op.summary) : op.summary,
      resolver: resolver?.state === "verified" ? resolver : null,
      resolves:
        operations.find(
          (other) => other.resolvedById === op.id && other.state === "failed",
        ) ?? null,
      needsYou: needs.has(op.id),
    };
  };
  const shown = operations
    .filter((op) => matches(op, filter))
    .map(entry)
    .toSorted((a, b) => rank(a.op) - rank(b.op) || b.at.localeCompare(a.at));
  const days: Day[] = [];
  for (const item of shown.filter((each) => rank(each.op) === 3)) {
    // Rendered on the client only, so this is the viewer's own day.
    const key = new Date(item.at).toDateString();
    const last = days.at(-1);
    if (last?.key === key) last.entries.push(item);
    else days.push({ key, at: item.at, entries: [item] });
  }
  const failed = operations.filter((op) => op.state === "failed");
  return {
    counts: Object.fromEntries(
      FILTERS.map((value) => [
        value,
        operations.filter((op) => matches(op, value)).length,
      ]),
    ) as Record<Filter, number>,
    open: shown.filter((item) => rank(item.op) < 3),
    days,
    total: operations.length,
    verified: operations.filter((op) => op.state === "verified").length,
    failed: failed.length,
    resolved: failed.filter((op) => op.resolvedById).length,
    since:
      operations
        .map((op) => op.startedAt ?? op.updatedAt)
        .sort()
        .at(0) ?? null,
  };
}

/** "Today", "Yesterday", or "Wednesday 9 Sep". */
export function dayName(at: string, now: number) {
  const day = (value: number) => {
    const date = new Date(value);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
  };
  const days = Math.round((day(Date.parse(at)) - day(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export const clockOf = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** "2 min later", "3 h later", "2 days later". */
export function later(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "moments later";
  if (minutes < 60) return `${minutes} min later`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h later`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} later`;
}
