"use client";

// PROTOTYPE · prototype/overview-directions · throwaway.
// The one thing the five directions share: the page head, and the smallest
// pieces of vocabulary. The head says how the address reads right now in
// plain words beside the application itself, which is the page's one primary
// action. That sentence is what the tile with the beating dot used to be.

import { ArrowRight, ArrowSquareOut, SpinnerGap } from "@phosphor-icons/react";
import type { ReactNode } from "react";

import type { ApplicationSection } from "../application-sections";
import type { NeedItem } from "../overview-prototype/overview-model";
import { useReconnectAction } from "../reconnect-action";
import type { Address, Facts } from "./facts";

export interface VariantProps {
  facts: Facts;
  /** The way back to the conversation, as the shell draws it. */
  bar: ReactNode;
}

/** A small dot that says how something reads. Never animated. */
export function Dot({ state }: { state: Address["state"] }) {
  if (state === "checking")
    return <SpinnerGap weight="bold" className="ovx-spin hv-spin" />;
  return <i className="ovx-dot" data-state={state} aria-hidden="true" />;
}

/** The application, or the one thing to do when it cannot be opened. */
export function OpenApplication({ facts }: { facts: Facts }) {
  const reconnect = useReconnectAction();
  const { address } = facts;
  if (!address.url) return null;
  if (address.reachable === "open")
    return (
      <a
        className="ovx-open"
        href={address.url}
        target="_blank"
        rel="noreferrer"
      >
        Open {facts.name}
        <ArrowSquareOut weight="bold" />
      </a>
    );
  if (address.reachable === "closed" && facts.onReopen)
    return (
      <button
        type="button"
        className="ovx-button"
        onClick={facts.onReopen}
        disabled={address.tunnelled && reconnect.disabled}
      >
        {address.tunnelled ? reconnect.label : "Ask Hallvi to look"}
      </button>
    );
  return null;
}

export function DirectionsHead({
  facts,
  bar,
  state = true,
}: VariantProps & {
  /** False where the page says how the address reads in its own way. */
  state?: boolean;
}) {
  const { address } = facts;
  return (
    <header className="ovx-head">
      {bar && <div className="axj3-bar">{bar}</div>}
      <div className="ovx-head-row">
        <h1>{facts.title}</h1>
        <div className="ovx-head-side">
          {state && address.state !== "none" && (
            <p
              className="ovx-address"
              data-state={address.state}
              title={address.reach ?? undefined}
            >
              <Dot state={address.state} />
              <b>{address.word}</b>
              {address.host && <span>{address.host}</span>}
            </p>
          )}
          <OpenApplication facts={facts} />
        </div>
      </div>
    </header>
  );
}

/** A plain link to another page of the application. */
export function PageLink({
  facts,
  to,
  children,
}: {
  facts: Facts;
  to: ApplicationSection;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="ovx-link"
      onClick={() => facts.onOpenDestination(to)}
    >
      {children}
      <ArrowRight weight="bold" />
    </button>
  );
}

/** An open thing's state, named for the thing and never for the reader. */
export const openWord = (need: NeedItem) =>
  need.tone === "waiting" ? "Awaiting approval" : "Failed";

/** What can be done about an open thing, as a quiet link. */
export function OpenAction({ need, facts }: { need: NeedItem; facts: Facts }) {
  const { primary } = need;
  if (!primary.open && !primary.draft) return null;
  return (
    <button
      type="button"
      className="ovx-link"
      onClick={primary.open ?? (() => facts.onAsk(primary.draft!))}
    >
      {primary.label}
      <ArrowRight weight="bold" />
    </button>
  );
}

/** The first sentence of a longer saying. */
export const firstSentence = (text: string) =>
  text.split(/(?<=[.!?])\s+/)[0] ?? text;
