"use client";

// PROTOTYPE · opus-ui-improvements · Domains, direction B.
// Callers: the page from the other side of the wire. Four kinds of visitor
// knock — you, a stranger, someone typing a name, a browser asking for
// https — and each window shows what the record says they meet, with how
// sure that is: a check proved it, the deployment asked for it, or nothing
// is set up. Nothing is observed now; the windows are drawn from the
// record, never fetched.

import { ChatCircleText, Lock, Warning } from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { ReachProps } from "./reach-story";
import { countWord } from "../stack-prototype/stack-model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { ago, when, type Caller } from "./reach-model";
import "./callers.css";

const sureWord: Record<Caller["sure"], string> = {
  proved: "A check proved this",
  asked: "What the deployment asked for",
  absent: "Nothing is set up",
};

/** What the browser would put in its window, in the browser's own voice. */
const screen: Record<Caller["outcome"], { title: string; body: string }> = {
  loads: { title: "", body: "" },
  refused: {
    title: "This site can’t be reached",
    body: "The connection was refused before the server saw it.",
  },
  "no-name": {
    title: "That name doesn’t exist",
    body: "No DNS record answers for it, so the browser never gets an address.",
  },
  insecure: {
    title: "Nothing answers securely",
    body: "No certificate, and nothing listening on the secure port.",
  },
  // The name worked and the application did not. Said in the browser's voice
  // because that is what a visitor gets: a page, just not this application's.
  "no-answer": {
    title: "This page isn’t working",
    body: "The name resolved and the connection was made. Nothing came back from the application.",
  },
};

export function CallersDirection({
  story,
  now,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: ReachProps) {
  const [picked, setPicked] = useState(story.callers[0]?.id ?? "");
  const open = story.callers.find((caller) => caller.id === picked) ?? null;
  const named = Boolean(story.domain);
  const reachable = story.callers.filter(
    (caller) => caller.outcome === "loads",
  ).length;

  // The headline tag is the most prominent claim on the page, so it is the
  // one that must not overstate. A domain record existing means somebody
  // wrote a name down; only the serves check means the application answers
  // on it. These were the same sentence once, and a proxied name that timed
  // out read as "Answering on ..." in green.
  const domain = story.domain;
  const domainTone: Tone = !domain
    ? "planned"
    : domain.state === "serving"
      ? "verified"
      : domain.state === "failed" || domain.state === "unreachable"
        ? "failed"
        : "planned";
  const domainWord = !domain
    ? "No name, no certificate"
    : domain.state === "serving"
      ? `Answering on ${domain.name}`
      : domain.state === "unreachable"
        ? `${domain.name} does not answer`
        : domain.state === "failed"
          ? `${domain.name} does not resolve`
          : domain.state === "resolving"
            ? `${domain.name} resolves; what answers is unchecked`
            : `${domain.name} is on record; nobody has resolved it`;

  return (
    <section className="axca" aria-label="Domains">
      {head}
      {activity}
      <div className="axca-lede">
        <div>
          <h2>
            {named
              ? `${countWord(story.callers.length)} way${story.callers.length === 1 ? "" : "s"} to knock, and ${
                  reachable === story.callers.length
                    ? "every one of them gets"
                    : reachable === 1
                      ? "one of them gets"
                      : `${countWord(reachable).toLowerCase()} of them get`
                } ${story.name}.`
              : `Only one kind of visitor reaches ${story.name} today.`}
          </h2>
          <p>
            <Tag tone={domainTone}>{domainWord}</Tag>
            <span>
              Each window is what the record says a visitor would meet. None of
              it is being tried now: the only knocks on record are the
              deployment’s own checks.
            </span>
          </p>
          {domain && (domain.origin || domain.concern) && (
            <p className="axca-record">
              {domain.origin && (
                <span className="axca-record-line">
                  The record sends {domain.name} to <code>{domain.origin}</code>
                  {domain.proxied
                    ? `, and ${domain.provider === "cloudflare" ? "Cloudflare" : "the provider"} answers for the name rather than handing that address out.`
                    : "."}
                </span>
              )}
              {domain.concern && (
                <span className="axca-record-concern">{domain.concern}</span>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          className="ax-button axca-ask"
          onClick={() =>
            onAsk(
              `Try reaching ${story.name} the way a visitor would, and tell me what answers and what does not.`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          Ask for a knock test
        </button>
      </div>

      <div className="axca-grid">
        {story.callers.map((caller) => {
          const loads = caller.outcome === "loads";
          const secure = caller.secure;
          return (
            <button
              key={caller.id}
              type="button"
              className="axca-win"
              data-outcome={caller.outcome}
              data-picked={picked === caller.id || undefined}
              onClick={() => setPicked(caller.id)}
            >
              <span className="axca-who">
                <b>{caller.who}</b>
                <small>from {caller.from}</small>
              </span>
              <span className="axca-chrome">
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <i aria-hidden="true" />
                <span className="axca-url" data-secure={secure && loads}>
                  {loads && secure ? (
                    <Lock weight="fill" />
                  ) : (
                    <Warning weight="fill" />
                  )}
                  <em>{caller.typed}</em>
                </span>
              </span>
              <span className="axca-view">
                {loads ? (
                  <span className="axca-served">
                    <b>{caller.headline}</b>
                    <span className="axca-bars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <small>
                      {secure
                        ? "Encrypted end to end"
                        : "Plain HTTP · readable on the way"}
                    </small>
                  </span>
                ) : (
                  <span className="axca-error">
                    <b>{screen[caller.outcome].title}</b>
                    <small>{screen[caller.outcome].body}</small>
                  </span>
                )}
              </span>
              <span className="axca-sure" data-sure={caller.sure}>
                {sureWord[caller.sure]}
                {caller.at ? ` · ${when(caller.at)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      {open && (
        <div className="axca-read" role="region" aria-label={open.who}>
          <div className="axca-read-head">
            <h3>{open.headline}</h3>
            <Tag
              tone={
                open.sure === "proved"
                  ? "verified"
                  : open.sure === "asked"
                    ? "stale"
                    : "planned"
              }
            >
              {sureWord[open.sure]}
              {open.at ? ` · ${ago(open.at, now)}` : ""}
            </Tag>
          </div>
          <p>{open.detail}</p>
          <dl className="ax-facts">
            <div>
              <dt>Who</dt>
              <dd>
                {open.who}, from {open.from}
              </dd>
            </div>
            <div>
              <dt>Typed</dt>
              <dd>
                <code>{open.typed}</code>
              </dd>
            </div>
          </dl>
          <div className="axca-read-links">
            <button
              type="button"
              className="ax-textlink"
              onClick={() => onOpenDestination("security")}
            >
              What can reach the server at all
            </button>
            <button
              type="button"
              className="ax-textlink"
              onClick={() =>
                onAsk(
                  open.sure === "proved"
                    ? `Check again that ${open.typed} still answers, and tell me what it returned.`
                    : `Can you confirm what happens when ${open.who.toLowerCase()} opens ${open.typed}?`,
                )
              }
            >
              Ask about this one
            </button>
          </div>
        </div>
      )}

      <footer className="axca-foot">
        <LittleServer
          mood={named ? "ready" : "pointing"}
          className="axca-guy"
        />
        <p>
          {story.audience === "controller"
            ? // "While it is being set up" was a phase nothing recorded.
              // What is on record is that access is private.
              `HTTP is held to your network${story.controllerIp ? ` (${story.controllerIp})` : ""}, so a stranger gets nothing. `
            : `Port 80 is open to every network, which is what a public application is for. `}
          {named
            ? story.tls.state === "valid"
              ? `The certificate ${story.tls.expiresAt ? `expires ${when(story.tls.expiresAt)}` : "is valid"}.`
              : "There is still no certificate, so even the name is served over plain HTTP."
            : "Connecting a name is not implemented yet; until then the server’s address is the only way in."}
        </p>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
