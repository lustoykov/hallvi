"use client";

import { ArrowRight } from "@phosphor-icons/react";

import type { ApplicationOperation } from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import {
  operationsFor,
  relativeTime,
  stepDetail,
  unresolved,
} from "./operation-model";
import { OperationSteps, StateChip } from "./operation-receipt";

/** Work no conversation and no view started: checks, schedules, hosts. */
function automatic(operation: ApplicationOperation) {
  return ["check", "backup", "job", "release", "issue"].includes(
    operation.source.type,
  );
}

/**
 * What is happening to a view right now, above its confirmed facts: every
 * unsettled operation that touches it, each with its origin. Once settled,
 * one line records the last operation and where it came from, and earlier
 * work stays reachable. Facts below never change before verification.
 */
export function DestinationActivity({
  section,
  operations,
  chats,
  now,
  onOpenConversation,
  onAsk,
  onInvestigate,
}: {
  section: ApplicationSection;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  now: number;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a question about work no conversation started. */
  onAsk?: (draft: string) => void;
  /**
   * Starts the linked investigation of automatic work, when the product can
   * record one; returns false when this operation has nothing to adopt.
   */
  onInvestigate?: (operation: ApplicationOperation) => boolean;
}) {
  const list = operationsFor(section, operations);
  if (!list.length) return null;
  const active = list.filter(
    (operation) =>
      operation.state === "working" ||
      operation.state === "proposed" ||
      unresolved(operation, operations),
  );
  const settled = list.filter((operation) => !active.includes(operation));
  const conversationName = (chatId: string) =>
    chats.find((chat) => chat.id === chatId)?.title ?? "its conversation";
  const originLink = (operation: ApplicationOperation, verb: string) =>
    operation.origin ? (
      <button
        type="button"
        className="sg-op-link"
        onClick={() =>
          onOpenConversation(
            operation.origin!.chatId,
            operation.origin!.messageId,
          )
        }
      >
        {verb} {conversationName(operation.origin.chatId)}{" "}
        <ArrowRight aria-hidden="true" />
      </button>
    ) : onAsk ? (
      <button
        type="button"
        className="sg-op-link"
        onClick={() => {
          if (onInvestigate?.(operation)) return;
          onAsk(
            `Investigate “${operation.title}” (${relativeTime(operation.updatedAt, now)}): what happened and what should I do next?`,
          );
        }}
      >
        Investigate <ArrowRight aria-hidden="true" />
      </button>
    ) : null;
  return (
    <div className="sg-activity-list">
      {active.map((operation) => (
        <div
          key={operation.id}
          className={`sg-activity sg-activity-${operation.state}`}
          role="status"
        >
          <div className="sg-activity-head">
            <StateChip state={operation.state} detail={stepDetail(operation)} />
            <strong>
              {operation.state === "proposed"
                ? "Proposed change · not applied"
                : operation.state === "working"
                  ? operation.kind === "inspection"
                    ? "Server Guy is inspecting · read-only"
                    : "Server Guy is applying a change"
                  : "This needs you"}
            </strong>
          </div>
          <p>
            {operation.title}. {operation.summary}
          </p>
          {operation.state !== "proposed" && (
            <OperationSteps steps={operation.steps} />
          )}
          {operation.state === "failed" && operation.next && (
            <p className="sg-op-next">Next: {operation.next}</p>
          )}
          <div className="sg-op-links">
            {originLink(
              operation,
              operation.state === "proposed"
                ? "Review and approve in"
                : "Open in",
            )}
          </div>
        </div>
      ))}
      {settled[0] && (
        <p className="sg-origin">
          <StateChip state={settled[0].state} />
          {settled[0].title}
          {settled[0].origin ? (
            <>
              {" "}
              · from{" "}
              <button
                type="button"
                className="sg-op-text-link"
                onClick={() =>
                  onOpenConversation(
                    settled[0].origin!.chatId,
                    settled[0].origin!.messageId,
                  )
                }
              >
                {conversationName(settled[0].origin.chatId)}
              </button>
            </>
          ) : automatic(settled[0]) ? (
            " · automatic"
          ) : (
            " · started from this view"
          )}{" "}
          · {relativeTime(settled[0].updatedAt, now)}
        </p>
      )}
      {settled.length > 1 && (
        <details className="sg-operation-history">
          <summary>Earlier work ({settled.length - 1})</summary>
          {settled.slice(1).map((operation) => (
            <div key={operation.id} className="sg-history-entry">
              <StateChip state={operation.state} />
              <strong>{operation.title}</strong>
              <p>{operation.evidence ?? operation.summary}</p>
              <div className="sg-op-links">
                {originLink(operation, "Open in")}
              </div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}
