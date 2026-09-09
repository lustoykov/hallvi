"use client";

import {
  ArrowRight,
  Check,
  X,
  HourglassMedium,
  MagnifyingGlass,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type {
  ApplicationOperation,
  OperationState,
} from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "./application-sections";
import {
  labelOf,
  relativeTime,
  stateLabel,
  stepDetail,
} from "./operation-model";

const icons: Record<OperationState, ReactNode> = {
  proposed: <HourglassMedium weight="bold" aria-hidden="true" />,
  queued: <HourglassMedium aria-hidden="true" />,
  cancelled: <X aria-hidden="true" />,
  working: <SpinnerGap className="spin" aria-hidden="true" />,
  inspected: <MagnifyingGlass weight="bold" aria-hidden="true" />,
  verified: <Check weight="bold" aria-hidden="true" />,
  failed: <Warning weight="bold" aria-hidden="true" />,
};

/** The smallest unit of the language: one icon, one word, one detail. */
export function StateChip({
  state,
  detail,
}: {
  state: OperationState;
  detail?: string | null;
}) {
  return (
    <span className={`sg-op-state sg-op-state-${state}`}>
      {icons[state]}
      {stateLabel[state]}
      {detail ? <em>· {detail}</em> : null}
    </span>
  );
}

export function OperationSteps({
  steps,
}: {
  steps: ApplicationOperation["steps"];
}) {
  if (!steps?.length) return null;
  return (
    <ol className="sg-op-steps">
      {steps.map((step, index) => (
        <li key={`${index}-${step.label}`} className={step.state}>
          <span className="sg-op-step-mark" aria-hidden="true">
            {step.state === "done" ? (
              <Check weight="bold" />
            ) : step.state === "active" ? (
              <SpinnerGap className="spin" />
            ) : step.state === "failed" ? (
              <Warning weight="bold" />
            ) : (
              <i />
            )}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function DestinationLinks({
  destinations,
  onOpen,
  prefix,
}: {
  destinations: ApplicationSection[];
  onOpen: (destination: ApplicationSection) => void;
  prefix?: string;
}) {
  return (
    <div className="sg-op-links">
      {prefix && <span className="sg-op-links-label">{prefix}</span>}
      {destinations.map((destination) => (
        <button
          key={destination}
          type="button"
          className="sg-op-link"
          onClick={() => onOpen(destination)}
        >
          Open {labelOf(destination)} <ArrowRight aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * The receipt under the reply that started an operation. It updates in place
 * as the operation moves through its states, carries the one decision it may
 * need, and links to the views it touched. A later message reports; the
 * receipt records.
 */
export function OperationReceipt({
  operation,
  now,
  onOpen,
  decision,
  onOpenOperation,
}: {
  onOpenOperation?: (id: string) => void;
  operation: ApplicationOperation;
  now: number;
  onOpen: (destination: ApplicationSection) => void;
  /** The real approval or recovery controls for this operation's record. */
  decision?: ReactNode;
}) {
  const showSteps =
    (operation.state === "working" ||
      operation.state === "queued" ||
      operation.state === "failed") &&
    operation.steps?.length;
  return (
    <div
      className={`sg-op-receipt sg-op-receipt-${operation.state}`}
      data-operation={operation.id}
      role="group"
      aria-label={`${stateLabel[operation.state]}: ${operation.title}`}
    >
      <div className="sg-op-receipt-head">
        <StateChip
          state={operation.state}
          detail={operation.state === "queued" ? null : stepDetail(operation)}
        />
        <strong>{operation.title}</strong>
        <span className="sg-op-rel">
          {relativeTime(operation.updatedAt, now)}
        </span>
      </div>
      {operation.state !== "queued" && (
        <p className="sg-op-summary">{operation.summary}</p>
      )}
      {operation.state === "queued" && operation.waitingForId && (
        <button
          type="button"
          className="sg-op-ref"
          onClick={() => {
            if (onOpenOperation && operation.waitingForId)
              return onOpenOperation(operation.waitingForId);
            onOpen("history");
            window.setTimeout(
              () =>
                document
                  .getElementById(`operation-${operation.waitingForId}`)
                  ?.scrollIntoView({ block: "center", behavior: "smooth" }),
              0,
            );
          }}
        >
          Waiting for {operation.waitingForTitle ?? "the current change"}{" "}
          <ArrowRight />
        </button>
      )}
      {showSteps ? <OperationSteps steps={operation.steps} /> : null}
      {operation.evidence &&
        (operation.state === "verified" || operation.state === "inspected") && (
          <p className="sg-op-evidence">
            <Check weight="bold" aria-hidden="true" /> {operation.evidence}
          </p>
        )}
      {operation.state === "failed" && operation.next && (
        <p className="sg-op-next">Next: {operation.next}</p>
      )}
      {decision}
      <DestinationLinks
        destinations={operation.destinations}
        onOpen={onOpen}
        prefix={
          operation.state === "verified"
            ? "Changed"
            : operation.state === "inspected"
              ? "Read"
              : undefined
        }
      />
    </div>
  );
}

/**
 * Compact references to operations this reply refers to, usually work that
 * another conversation started. Each opens that conversation at the receipt,
 * where the single decision lives.
 */
export function OperationReferences({
  operations,
  chats,
  onOpenConversation,
  onOpen,
}: {
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpen: (destination: ApplicationSection) => void;
}) {
  if (!operations.length) return null;
  return (
    <div className="sg-op-refs">
      <span className="sg-op-links-label">Refers to</span>
      {operations.map((operation) => {
        const origin = operation.origin;
        const chat = origin
          ? chats.find((item) => item.id === origin.chatId)
          : null;
        return (
          <button
            key={operation.id}
            type="button"
            className="sg-op-ref"
            onClick={() =>
              origin
                ? onOpenConversation(origin.chatId, origin.messageId)
                : onOpen(operation.destinations[0])
            }
          >
            <StateChip state={operation.state} />
            {operation.title}
            <em>
              {origin
                ? `from ${chat?.title ?? "another conversation"}`
                : `in ${labelOf(operation.destinations[0])}`}
            </em>
          </button>
        );
      })}
    </div>
  );
}
