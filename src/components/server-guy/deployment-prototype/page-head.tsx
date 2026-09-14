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

/**
 * Whether the way in works. Three states, not two.
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
export type Reachability = "checking" | "open" | "closed";

export function PageHead({
  bar,
  title,
  name,
  openUrl,
  restricted,
  reachable = "checking",
  onReopen,
}: {
  bar: ReactNode;
  title: string;
  name: string;
  openUrl: string | null;
  restricted: boolean;
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
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
        />
      </div>
    </header>
  );
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
 */
export function AccessLink({
  openUrl,
  name,
  restricted,
  reachable = "checking",
  onReopen,
}: {
  openUrl: string | null;
  name: string;
  restricted: boolean;
  reachable?: Reachability;
  /** Asks Pi to reopen private access. Absent hides the offer. */
  onReopen?: () => void;
}) {
  if (!openUrl) return null;
  // Only a tunnel ends at this computer's own loopback.
  const tunnelled = Boolean(
    openUrl &&
    /^https?:\/\/(127\.0\.0\.1|\[?::1\]?|localhost)(:|\/|$)/.test(openUrl),
  );
  return (
    <div className="axj3-open" data-reach={reachable}>
      {reachable === "open" ? (
        <>
          {restricted && (
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
          <small className="axj3-closed">
            <WarningCircle weight="bold" />{" "}
            {/* A published address has no tunnel to be closed. What failed
                is the address itself, and saying "tunnel" sends the reader
                to look at the wrong thing. The address settles which one
                this is: only a tunnel ends at this computer's own
                loopback. */}
            {tunnelled ? "The tunnel is closed" : "The address did not answer"}
          </small>
          {/* No anchor at all. A dead link that looks alive is worse than
              no link: the reader spends the click, the wait and the browser
              error before learning what the page knew. */}
          {onReopen && (
            <button type="button" className="axj3-reopen" onClick={onReopen}>
              <ChatCircleText weight="bold" />
              {tunnelled ? "Ask Pi to reopen it" : "Ask Pi to look"}
            </button>
          )}
        </>
      ) : (
        // Nothing is claimed yet, and nothing is offered to click.
        <small className="axj3-checking">
          <SpinnerGap weight="bold" className="ax-spin" />
          Checking the way in…
        </small>
      )}
    </div>
  );
}
