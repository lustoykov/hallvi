// Derivations over the application operation record, shared by the chat,
// the views, navigation and Overview. Pure; the wall clock is passed in.
import type { NavigationIndicator } from "./application-navigation";
import {
  applicationSections,
  type ApplicationSection,
} from "./application-sections";
import type {
  ApplicationOperation,
  OperationState,
} from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

export const stateLabel: Record<OperationState, string> = {
  proposed: "Waiting for you",
  working: "Working",
  queued: "Queued",
  declined: "Not run",
  stopped: "Stopped",
  cancelled: "Cancelled",
  inspected: "Inspected",
  verified: "Verified",
  failed: "Failed",
};

export function labelOf(section: ApplicationSection) {
  return (
    applicationSections.find((item) => item.id === section)?.label ?? section
  );
}

export function relativeTime(iso: string, now: number) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function isStale(
  iso: string | null | undefined,
  now: number,
  hours = 24,
) {
  return !iso || now - new Date(iso).getTime() > hours * 3_600_000;
}

/** Newest change first; on a tie, the operation recorded later wins. */
function newestFirst(operations: ApplicationOperation[]) {
  return operations
    .map((operation, index) => ({ operation, index }))
    .sort(
      (a, b) =>
        b.operation.updatedAt.localeCompare(a.operation.updatedAt) ||
        b.index - a.index,
    )
    .map((item) => item.operation);
}

/** A failure counts until the operation that addressed it has been verified. */
export function unresolved(
  operation: ApplicationOperation,
  operations: ApplicationOperation[],
) {
  if (operation.state !== "failed") return false;
  const resolver = operation.resolvedById
    ? operations.find((item) => item.id === operation.resolvedById)
    : undefined;
  return !(resolver && resolver.state === "verified");
}

/** Work that is not settled: waiting for the user, running, or failed. */
export function activeOperations(operations: ApplicationOperation[]) {
  return newestFirst(
    operations.filter(
      (operation) =>
        operation.state === "working" ||
        operation.state === "queued" ||
        operation.state === "proposed" ||
        unresolved(operation, operations),
    ),
  );
}

export function attentionItems(operations: ApplicationOperation[]) {
  return newestFirst(
    operations.filter(
      (operation) =>
        operation.state === "proposed" || unresolved(operation, operations),
    ),
  );
}

export function operationsFor(
  section: ApplicationSection,
  operations: ApplicationOperation[],
) {
  return newestFirst(
    operations.filter((operation) => operation.destinations.includes(section)),
  );
}

export function recentOperations(operations: ApplicationOperation[]) {
  return newestFirst(operations);
}

export function stepDetail(operation: ApplicationOperation) {
  if (operation.state === "queued")
    return `after ${operation.waitingForTitle ?? "the current change"}`;
  if (operation.state !== "working" || !operation.steps) return null;
  const active = operation.steps.findIndex((step) => step.state === "active");
  return active < 0 ? null : `step ${active + 1} of ${operation.steps.length}`;
}

/**
 * The one operation the top bar names while a view is open: work in the
 * viewed area first, then the current conversation's, then any.
 */
export function featuredOperation(
  operations: ApplicationOperation[],
  section: ApplicationSection | null,
  chatId: string | null,
) {
  const active = activeOperations(operations).filter(
    (operation) => operation.kind === "change" && operation.state === "working",
  );
  return (
    (section &&
      active.find((operation) => operation.destinations.includes(section))) ||
    active.find((operation) => operation.origin?.chatId === chatId) ||
    active[0] ||
    null
  );
}

function count(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/**
 * One mark per destination. A failure or a waiting decision outranks work in
 * progress so a new operation cannot hide an issue; a confirmed change shows
 * until the destination is looked at.
 */
export function navigationIndicators(
  operations: ApplicationOperation[],
  seen: Partial<Record<ApplicationSection, string>>,
) {
  const result: Partial<Record<ApplicationSection, NavigationIndicator>> = {};
  for (const section of applicationSections) {
    if (section.id === "overview") continue;
    const list = operationsFor(section.id, operations);
    if (!list.length) continue;
    const failed = list.find((operation) => unresolved(operation, operations));
    const proposed = list.find((operation) => operation.state === "proposed");
    const working = list.filter(
      (operation) =>
        operation.state === "working" || operation.state === "queued",
    );
    const others = working.length
      ? ` · ${count(working.length, "operation")} working`
      : "";
    // An operation names the destination it is mainly about first; only
    // that one animates, so one change across five destinations does not
    // set five marks pulsing.
    const leads = (operation: ApplicationOperation) =>
      operation.destinations[0] === section.id;
    if (failed) {
      result[section.id] = {
        tone: "failed",
        label: `Failed: ${failed.title}${others}`,
        primary: leads(failed),
      };
      continue;
    }
    if (proposed) {
      result[section.id] = {
        tone: "needs-you",
        label: `Waiting for you: ${proposed.title}${others}`,
        primary: leads(proposed),
      };
      continue;
    }
    if (working.length) {
      result[section.id] = {
        tone: "working",
        label:
          working.length > 1
            ? `${count(working.length, "operation")} working: ${working.map((operation) => operation.title).join(", ")}`
            : `Haldur is working here: ${working[0].title}`,
        primary: working.some(leads),
      };
      continue;
    }
    const seenAt = seen[section.id];
    const changed = list.find(
      (operation) =>
        (operation.state === "verified" || operation.state === "inspected") &&
        (!seenAt || operation.updatedAt > seenAt),
    );
    if (changed)
      result[section.id] = {
        tone: "updated",
        label: `Updated since you last looked: ${changed.title}`,
      };
  }
  return result;
}

/** The mark beside each conversation for its own unsettled operation. */
export function conversationMarks(
  operations: ApplicationOperation[],
  chats: ChatSummary[],
) {
  const marks: Record<string, NavigationIndicator> = {};
  // A conversation owns the work it started, so its own mark leads.
  for (const chat of chats) {
    const own = newestFirst(
      operations.filter((operation) => operation.origin?.chatId === chat.id),
    );
    const live =
      own.find((operation) => unresolved(operation, operations)) ??
      own.find((operation) => operation.state === "proposed") ??
      own.find((operation) => operation.state === "working") ??
      own.find((operation) => operation.state === "queued");
    if (!live) continue;
    marks[chat.id] = {
      tone:
        live.state === "failed"
          ? "failed"
          : live.state === "proposed"
            ? "needs-you"
            : "working",
      label: `${stateLabel[live.state]}: ${live.title}`,
      primary: true,
    };
  }
  return marks;
}
