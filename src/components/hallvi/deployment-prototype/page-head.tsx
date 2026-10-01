"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// The header the redesigned destinations draw for themselves, as Overview
// and Architecture do: the way back, the title, and "Open <app>" with who can
// reach it.

import {
  ArrowSquareOut,
  ChatCircleText,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useReconnectAction } from "../reconnect-action";

/**
 * Whether the way in works, or why it is currently unknown.
 *
 * A private URL lives inside an SSH tunnel this controller holds, and that
 * tunnel dies with a restart. Defaulting to "it works" meant every page
 * claimed a working way in for the moment before the answer arrived — a false
 * frame on every single load — and then went on offering the link as a live
 * one even after the answer said otherwise.
 *
 * `checking` is the honest state before anything is known, and it claims
 * nothing.
 */
/**
 * The page around a destination, as the shell draws it.
 *
 * It lives beside PageHead because PageHead is what draws it: every
 * destination page takes this and hands the pieces to the head. It used to
 * live in a chooser that let a reviewer flip between candidate layouts, which
 * is a thing the product no longer has.
 */
export interface PageChrome {
  /** The way back to the conversation. */
  bar: ReactNode;
  /** The destination's title, description and "Open application". */
  header: ReactNode;
  /** Unsettled work, then the last settled operation and earlier work. */
  activity: ReactNode;
}

/** What a page that draws its own header needs from the record. */
export interface PageContext {
  chrome: PageChrome;
  /** Where the application answers, while it is serving. */
  openUrl: string | null;
  /**
   * Whether the way in still works. A private URL lives inside a tunnel this
   * controller holds, so the record naming it outlives the way to reach it.
   */
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  /** Work is unsettled: the shipped activity is shown as it is. */
  busy: boolean;
  /** The last settled operation that touched this destination. */
  last: {
    title: string;
    at: string;
    conversation: string | null;
    open: (() => void) | null;
  } | null;
  /** Settled operations before the last one. */
  earlier: number;
}

export type Reachability =
  "checking" | "open" | "closed" | "unknown" | "unavailable";

export function accessStateText(state: Reachability) {
  return state === "unavailable"
    ? "Cannot reach Hallvi"
    : state === "unknown"
      ? "Access has not been checked"
      : "Checking access…";
}

/** Only a tunnel ends at this computer's own loopback. */
export const isTunnel = (url: string | null | undefined) =>
  Boolean(
    url && /^https?:\/\/(127\.0\.0\.1|\[?::1\]?|localhost)(:|\/|$)/.test(url),
  );

export function PageHead({
  bar,
  title,
  name,
  openUrl,
  restricted,
  reachable = "checking",
  onReopen,
  reading,
}: {
  bar: ReactNode;
  title: string;
  name: string;
  openUrl: string | null;
  restricted: boolean;
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  /** Overview's head also says how the address reads; see AccessLink. */
  reading?: boolean;
}) {
  return (
    <header className="axj3-head">
      {bar && <div className="axj3-bar">{bar}</div>}
      <div className="axj3-title">
        <h1>{title}</h1>
        <AccessLink
          openUrl={openUrl}
          name={name}
          restricted={restricted}
          reachable={reachable}
          onReopen={onReopen}
          reading={reading}
        />
      </div>
    </header>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * "Open <app>", and what is true about the way in.
 *
 * Shared by every destination header and by Overview, because the question
 * it answers is the same everywhere and so is the wrong answer: a private
 * URL lives inside an SSH tunnel this controller holds, the record that
 * names it stays exactly as true as it was written, and the tunnel is gone
 * after a restart. Overview drew this link from the record alone and so kept
 * offering it after it had stopped working — on the first page a returning
 * reader sees, and the one link they are most likely to click.
 *
 * The words are the ones `main` arrived at, including the distinction
 * between a tunnel that closed and a published address that did not answer.
 * This only makes them reachable from more than one page.
 *
 * `reading` is Overview's: with no tile left to say it, the head says how the
 * address reads beside the link, in the same words. A published address that
 * answered is "Answering" and its host. A tunnel is only ever "open": the
 * check proves the connection, never the application behind it. And a tunnel
 * this computer dropped gets an empty ring there in place of the warning
 * mark, because it says nothing about the application.
 */
export function AccessLink({
  openUrl,
  name,
  restricted,
  reachable = "checking",
  onReopen,
  reading,
}: {
  openUrl: string | null;
  name: string;
  restricted: boolean;
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
  /** Say how the address reads, in words, beside the link. */
  reading?: boolean;
}) {
  const reconnect = useReconnectAction();
  if (!openUrl) return null;
  const tunnelled = isTunnel(openUrl);
  return (
    <div className="axj3-open" data-reach={reachable}>
      {reachable === "open" ? (
        <>
          {reading ? (
            <small className="axj3-reading">
              <i aria-hidden="true" />
              <b>{tunnelled ? "Private connection open" : "Answering"}</b>
              {hostOf(openUrl)}
            </small>
          ) : (
            tunnelled && <small>Private connection open</small>
          )}
          {!tunnelled && restricted && (
            <small>
              <ShieldCheck weight="bold" /> Only from your network
            </small>
          )}
          <a href={openUrl} target="_blank" rel="noreferrer">
            Open {name}
            <ArrowSquareOut weight="bold" />
          </a>
        </>
      ) : reachable === "closed" ? (
        <>
          {reading && tunnelled ? (
            <small className="axj3-reading" data-closed>
              <i aria-hidden="true" />
              <b>The tunnel is closed</b>
            </small>
          ) : (
            <small className="axj3-closed">
              <WarningCircle weight="bold" />{" "}
              {/* A published address has no tunnel to be closed. What failed
                  is the address itself, and saying "tunnel" sends the reader
                  to look at the wrong thing. The address settles which one
                  this is: only a tunnel ends at this computer's own
                  loopback. */}
              {tunnelled
                ? "The tunnel is closed"
                : "The address did not answer"}
            </small>
          )}
          {/* No anchor at all. A dead link that looks alive is worse than
              no link: the reader spends the click, the wait and the browser
              error before learning what the page knew. */}
          {onReopen && (
            <button
              type="button"
              className="axj3-reopen"
              onClick={onReopen}
              disabled={tunnelled && reconnect.disabled}
            >
              <ChatCircleText weight="bold" />
              {/* The same words the release band uses for the same action.
                  "Reopen it" and "reopen access" name a thing the reader has
                  no picture of; what dropped is a connection this computer
                  holds open. */}
              {tunnelled ? reconnect.label : "Ask Hallvi to look"}
            </button>
          )}
        </>
      ) : (
        // Nothing is claimed yet, and nothing is offered to click.
        <small className="axj3-checking">
          {reachable === "checking" && (
            <SpinnerGap weight="bold" className="ax-spin" />
          )}
          {accessStateText(reachable)}
        </small>
      )}
    </div>
  );
}
