"use client";

// PROTOTYPE · opus-ui-improvements · Domains, direction C.
// Handover: connecting a name is the one job here that is not Server Guy's
// alone, so the page is laid out as two desks. Yours holds the single thing
// only you can do — one DNS record, written out as your provider will ask
// for it, ready to copy. His holds everything that follows, each step
// blocked until the one above it is true. A step is only ever "done" with a
// date on the record.

import { Check, ChatCircleText, Copy } from "@phosphor-icons/react";
import { useState } from "react";

import { LittleServer } from "../deployment-prototype/little-server";
import { Tag } from "../deployment-prototype/tag";
import type { Tone } from "../deployment-prototype/deployment-model";
import type { ReachDirectionProps } from "./index";
import { countWord } from "../stack-prototype/stack-model";
import { when, type Step } from "./reach-model";
import "./handover.css";

const stateWord: Record<Step["state"], string> = {
  done: "Done",
  waiting: "Waiting for you",
  blocked: "Not possible yet",
  standing: "From then on, forever",
};
const stateTone: Record<Step["state"], Tone> = {
  done: "verified",
  waiting: "stale",
  blocked: "planned",
  standing: "verified",
};

export function HandoverDirection({
  story,
  head,
  activity,
  onAsk,
  onOpenDestination,
}: ReachDirectionProps) {
  const [copied, setCopied] = useState(false);
  const named = Boolean(story.domain);
  const host = story.address?.replace(/^https?:\/\//, "") ?? "this server";
  const name = story.domain?.name ?? "the name you choose";
  const mine = story.steps.filter((step) => step.who === "server-guy").length;

  const copy = () => {
    void navigator.clipboard?.writeText(host);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <section className="axha" aria-label="Domains">
      {head}
      {activity}
      <div className="axha-lede">
        <div>
          <h2>
            {named
              ? `${name} is pointed here, and Server Guy took it from there.`
              : `One step is yours. The other ${countWord(mine).toLowerCase()} are Server Guy’s, and none of them can start until yours is done.`}
          </h2>
          <p>
            <Tag tone={named ? "verified" : "planned"}>
              {named ? "Name connected" : "Nothing pointed here yet"}
            </Tag>
            <span>
              Server Guy cannot change a name it does not own, and no amount of
              automation gets around that. Domain setup is not implemented yet
              either; this is the shape it would take.
            </span>
          </p>
        </div>
        <button
          type="button"
          className="ax-button ax-button-primary axha-ask"
          onClick={() =>
            onAsk(
              named
                ? `Confirm ${name} still resolves here and that its certificate renews automatically.`
                : `I want ${story.name} to answer on my own domain. Walk me through what you need.`,
            )
          }
        >
          <ChatCircleText weight="bold" />
          {named ? "Ask about this name" : "Start it in the conversation"}
        </button>
      </div>

      {/* The one thing only you can do, written as your provider asks it. */}
      <div className="axha-slip" data-done={named || undefined}>
        <div className="axha-slip-head">
          <span className="axha-stamp">{named ? "Done" : "Yours to do"}</span>
          <h3>One record at your DNS provider</h3>
        </div>
        <dl className="axha-record">
          <div>
            <dt>Type</dt>
            <dd>A</dd>
          </div>
          <div>
            <dt>Name</dt>
            <dd>{story.domain?.name ?? "the name you want"}</dd>
          </div>
          <div>
            <dt>Value</dt>
            <dd className="axha-value">
              <code>{host}</code>
              <button
                type="button"
                className="ax-button axha-copy"
                onClick={copy}
              >
                {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </dd>
          </div>
          <div>
            <dt>TTL</dt>
            <dd>Whatever your provider suggests</dd>
          </div>
        </dl>
        <p className="axha-slip-note">
          {named
            ? story.domain?.detail
            : `This is the server’s own address. Until a record like this exists, nothing on the internet knows where ${story.name} lives.`}
        </p>
      </div>

      <div className="axha-desks">
        <h3 className="axha-desk-head" data-who="you">
          Your desk
        </h3>
        <h3 className="axha-desk-head" data-who="server-guy">
          <LittleServer
            mood={named ? "ready" : "waving"}
            className="axha-guy"
          />
          Server Guy’s desk
        </h3>
        {story.steps.map((step, index) => {
          const handed = index > 0 && story.steps[index - 1].who !== step.who;
          return (
            <div
              key={step.id}
              className="axha-slot"
              style={{ gridRow: index + 2 }}
              data-who={step.who}
              data-state={step.state}
            >
              {handed && (
                <span className="axha-baton" aria-hidden="true">
                  handed over
                </span>
              )}
              <article className="axha-step">
                <header>
                  <span className="axha-n">{index + 1}</span>
                  <h4>{step.title}</h4>
                </header>
                <p>{step.detail}</p>
                <Tag tone={stateTone[step.state]}>
                  {stateWord[step.state]}
                  {step.at ? ` · ${when(step.at)}` : ""}
                </Tag>
              </article>
            </div>
          );
        })}
      </div>

      <footer className="axha-foot">
        <p>
          Until the name resolves there is nothing to certify, so every step
          below the first stays impossible rather than pending — the page would
          rather say “not possible yet” than show a spinner that never finishes.
        </p>
        <button
          type="button"
          className="ax-textlink"
          onClick={() => onOpenDestination("security")}
        >
          Who can reach the server today
        </button>
      </footer>
      {story.invented && <p className="ax-invented">{story.invented}</p>}
    </section>
  );
}
