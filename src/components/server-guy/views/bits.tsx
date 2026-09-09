"use client";

import { ArrowRight } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ApplicationFacts, ViewAction } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import type { ChatSummary } from "@/server/types";

import type { ApplicationSection } from "../application-sections";
import { LocalTime } from "../local-time";
import { relativeTime } from "../operation-model";

/** What every stable view receives. Facts and actions are optional. */
export interface ViewProps {
  stack: ApplicationStack;
  facts: ApplicationFacts;
  deployment: DeploymentRecord | null;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  now: number;
  onOpenDestination: (destination: ApplicationSection) => void;
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  /** Drafts a message; null asks in the current conversation. */
  onAsk: (chatId: string | null, draft: string) => void;
  /** Present when the product can start the action; absent hides it. */
  onAction?: (action: ViewAction) => void;
  /** The action in progress, if any, so its control shows as busy. */
  busy?: string | null;
}

export function Facts({
  rows,
  wide,
}: {
  rows: Array<[string, ReactNode]>;
  /** One column, for values that are sentences rather than values. */
  wide?: boolean;
}) {
  return (
    <dl className={`sg-section-facts${wide ? " sg-facts-wide" : ""}`}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Planned({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="sg-planned-section">
      <span className="sg-availability">Not implemented yet</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}

export function TextLink({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="sg-op-text-link" onClick={onClick}>
      {children}
    </button>
  );
}

export function LinkButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="sg-op-link"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** A state word with its tint: ok, warn, bad or muted. */
export function Pill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "bad" | "muted" | "working";
  children: ReactNode;
}) {
  return <span className={`sg-pill sg-pill-${tone}`}>{children}</span>;
}

/** A time in local words plus how long ago. */
export function When({ at, now }: { at: string; now: number }) {
  return (
    <>
      <LocalTime value={at} variant="compact" />{" "}
      <span className="sg-op-muted">· {relativeTime(at, now)}</span>
    </>
  );
}

/**
 * A capability the application does not use or that nothing records yet:
 * what would appear, whether Server Guy can record it today, and the way to
 * start in conversation. No controls, because there is nothing to control.
 */
export function Possible({
  title,
  available,
  children,
  draft,
  onAsk,
}: {
  title: string;
  available: boolean;
  children: ReactNode;
  draft: string;
  onAsk: (draft: string) => void;
}) {
  return (
    <div className="sg-section-empty sg-possible">
      <h2>{title}</h2>
      <p>{children}</p>
      <div className="sg-op-links">
        <LinkButton onClick={() => onAsk(draft)}>
          Ask in the conversation <ArrowRight aria-hidden="true" />
        </LinkButton>
        {!available && (
          <span className="sg-availability">Not available yet</span>
        )}
      </div>
    </div>
  );
}

/** The condition line at the top of a view: dot, heading and one sentence. */
export function Condition({
  tone,
  title,
  children,
  aside,
}: {
  tone: "ok" | "warn" | "bad" | "muted" | "working";
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className={`sg-condition sg-condition-${tone}`}>
      <span className="sg-condition-dot" aria-hidden="true" />
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
      {aside && <div className="sg-condition-aside">{aside}</div>}
    </div>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="sg-subheading">{children}</h3>;
}

export const stateText = (state: "running" | "planned", verified: ReactNode) =>
  state === "running" ? (
    <>Running · verified {verified}</>
  ) : (
    "Planned · not deployed yet"
  );

export function verifiedText(deployment: DeploymentRecord | null) {
  return deployment?.verifiedAt ? (
    <LocalTime value={deployment.verifiedAt} variant="compact" />
  ) : (
    "Not verified"
  );
}

export function conversationTitle(chats: ChatSummary[], id?: string | null) {
  return chats.find((chat) => chat.id === id)?.title ?? "its conversation";
}
