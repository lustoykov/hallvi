"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction B, Narrated: Server Guy tells you what is running and how it got
// there, in his own words. The account is the page: each sentence opens the
// lines recorded behind it, and a thin ribbon under the words shows the same
// phases, lit from either side. What it runs on, what it checks and what
// isn't set up sit in the margin, exact on click. Nothing moves on arrival.

import {
  ArrowRight,
  ChatCircleText,
  Check,
  MinusCircle,
  X,
} from "@phosphor-icons/react";
import { Fragment, useCallback, useState, type KeyboardEvent } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { ago, localTime } from "../architecture-prototype/model";
import { useDismiss } from "../overview-prototype/shared";
import { took, type Phase, type Tone } from "./deployment-model";
import type { DirectionProps } from "./index";
import { LittleServer } from "./little-server";
import { saidOf } from "./said";
import { Tag } from "./story";
import "./narrated.css";

const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;

const span = (phase: Phase) =>
  Math.max(0, Date.parse(phase.end) - Date.parse(phase.start));
const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function NarratedDirection({
  story,
  now,
  head,
  activity,
  panel,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: DirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [fact, setFact] = useState<string | null>(null);
  const close = useCallback(() => setFact(null), []);
  useDismiss(Boolean(fact), ".axn-fact", close);

  const live = story.state === "live";
  const chat = story.chat;
  const total = story.phases.reduce((sum, item) => sum + span(item), 0);
  // Even a one-second phase stays visible on the ribbon.
  const weight = (item: Phase) => Math.max(span(item), total * 0.05, 1);
  const shown = story.phases.find((item) => item.id === open);
  const toggle = (item: Phase) => {
    if (!item.lines.length) return;
    setOpen((current) => (current === item.id ? null : item.id));
  };
  const onKey = (item: Phase) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle(item);
  };
  // The account reads in two breaths when something failed on the way.
  const turn = story.phases.findIndex((item) => item.tone === "fail");
  const paragraphs =
    turn > 0
      ? [story.phases.slice(0, turn), story.phases.slice(turn)]
      : [story.phases];
  const lastPass = story.checks
    .map((check) => check.at)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);

  const next =
    story.state === "live"
      ? {
          label: "Release an update",
          ask: true,
          run: () =>
            onAsk(`Release the latest revision of ${story.repository}.`),
        }
      : story.state === "awaiting" && chat
        ? {
            label: "Review and approve",
            ask: false,
            run: () => onOpenConversation(chat.chatId, chat.messageId),
          }
        : story.state === "failed"
          ? {
              label: "Ask me to look into it",
              ask: true,
              run: () =>
                onAsk(
                  "Find out why the latest deployment stopped, and fix it.",
                ),
            }
          : story.state === "working" && chat
            ? {
                label: "Follow in the conversation",
                ask: false,
                run: () => onOpenConversation(chat.chatId, chat.messageId),
              }
            : story.state === "unknown"
              ? {
                  label: "Ask me to check it",
                  ask: true,
                  run: () =>
                    onAsk(`Check what is running for ${story.name} now.`),
                }
              : null;

  if (story.state === "none")
    return (
      <section className="axn" aria-label="Deployment">
        {head}
        {activity}
        <div className="axn-none">{panel}</div>
      </section>
    );

  return (
    <section className="axn" aria-label="Deployment">
      {head}
      {activity}
      <header className="axn-lede" data-tone={story.tone}>
        <LittleServer mood={moodOf[story.tone]} className="axn-guy" />
        <div>
          <h2 className="axn-say">{story.statement}</h2>
          <p className="axn-sure">
            <Tag tone={story.tone}>{story.word}</Tag>
            <span>{story.detail}</span>
          </p>
          {next && (
            <button
              type="button"
              className="ax-button axn-next"
              onClick={next.run}
            >
              {next.ask && <ChatCircleText weight="bold" />}
              {next.label}
              {!next.ask && <ArrowRight weight="bold" />}
            </button>
          )}
        </div>
      </header>

      <div className="axn-body">
        {story.phases.length > 0 ? (
          <section className="axn-account" aria-label="How it got there">
            <header className="axn-head">
              <h2>
                {story.state === "awaiting"
                  ? "How I made the plan"
                  : "How I got it there"}
              </h2>
              {story.started && (
                <small>
                  {new Date(story.started).toLocaleDateString(undefined, {
                    day: "numeric",
                    month: "short",
                  })}
                  {story.took && ` · ${story.took}`} · {story.attempts}{" "}
                  {story.attempts === 1 ? "attempt" : "attempts"}
                </small>
              )}
            </header>
            {paragraphs.map((group, index) => (
              <p key={index} className="axn-prose">
                {group.map((item, position) => (
                  <Fragment key={item.id}>
                    {position > 0 && " "}
                    <span
                      className="axn-s"
                      data-tone={item.tone}
                      data-lit={lit === item.id || undefined}
                      role={item.lines.length ? "button" : undefined}
                      tabIndex={item.lines.length ? 0 : undefined}
                      aria-expanded={
                        item.lines.length ? open === item.id : undefined
                      }
                      onClick={() => toggle(item)}
                      onKeyDown={onKey(item)}
                      onPointerEnter={() => setLit(item.id)}
                      onPointerLeave={() => setLit(null)}
                    >
                      {saidOf(item)}
                    </span>
                  </Fragment>
                ))}
              </p>
            ))}
            <div className="axn-ribbon" aria-hidden="true">
              {story.phases.map((item) => (
                <span
                  key={item.id}
                  className="axn-seg"
                  data-tone={item.tone}
                  data-lit={lit === item.id || open === item.id || undefined}
                  style={{ flexGrow: weight(item) }}
                  title={`${item.title} · ${took(span(item))}`}
                  onPointerEnter={() => setLit(item.id)}
                  onPointerLeave={() => setLit(null)}
                  onClick={() => toggle(item)}
                />
              ))}
            </div>
            <div className="axn-ends" aria-hidden="true">
              <span>{localTime(story.phases[0].start)}</span>
              <span>{localTime(story.phases.at(-1)!.end)}</span>
            </div>
            {shown && (
              <div
                className="axn-evidence"
                role="region"
                aria-label={`What I recorded: ${shown.title}`}
              >
                <header>
                  <b>{shown.title}</b>
                  <small>
                    {clock(shown.start)} – {clock(shown.end)} ·{" "}
                    {took(span(shown))}
                  </small>
                  <button
                    type="button"
                    className="axn-close"
                    aria-label="Close"
                    onClick={() => setOpen(null)}
                  >
                    <X weight="bold" />
                  </button>
                </header>
                <div className="axn-console" role="log">
                  {shown.lines.map((line, index) => (
                    <div
                      key={`${line.at}:${index}`}
                      className="axn-line"
                      data-tone={line.tone}
                    >
                      <time>{clock(line.at)}</time>
                      <b aria-hidden="true">{glyph[line.tone]}</b>
                      <span>{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <div />
        )}

        <aside className="axn-margin" aria-label="Details">
          {story.facts.length > 0 && (
            <section>
              <h3>What it runs on</h3>
              <dl className="axn-facts">
                {story.facts.map((item) => (
                  <div key={item.label} className="axn-fact">
                    <dt>{item.label}</dt>
                    <dd>
                      <button
                        type="button"
                        className="axn-fact-open"
                        aria-expanded={fact === item.label}
                        disabled={!item.exact.length}
                        onClick={() =>
                          setFact((current) =>
                            current === item.label ? null : item.label,
                          )
                        }
                      >
                        <b>{item.value}</b>
                        <small>{item.sub}</small>
                      </button>
                      {fact === item.label && (
                        <div
                          className="axn-pop"
                          role="dialog"
                          aria-label={item.label}
                        >
                          <dl>
                            {item.exact.map((row) => (
                              <div key={row.label}>
                                <dt>{row.label}</dt>
                                <dd
                                  className={row.mono ? "ax-mono" : undefined}
                                >
                                  {row.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {story.checks.length > 0 && (
            <section>
              <h3>{live ? "What I check" : "What I will check"}</h3>
              <ul className="axn-checks">
                {story.checks.map((check) => (
                  <li
                    key={`${check.name}:${check.probe}`}
                    data-passed={Boolean(check.at)}
                  >
                    <span className="axn-tick" aria-hidden="true">
                      <Check weight="bold" />
                    </span>
                    <span>
                      <b>{check.name}</b>
                      <small>
                        {check.inside
                          ? "Inside the server"
                          : "From your network"}{" "}
                        · <code>{check.probe}</code>
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <small className="axn-note">
                {lastPass
                  ? `Last passed ${ago(lastPass, now)}.`
                  : "They run when it deploys."}
              </small>
            </section>
          )}
          <section>
            <h3>What I don&apos;t do yet</h3>
            <ul className="axn-gaps">
              {story.gaps.map((gap) => (
                <li key={gap.id}>
                  <MinusCircle weight="bold" aria-hidden="true" />
                  <span>
                    <b>{gap.title}</b>
                    <small>{gap.detail}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {story.logs.lines.length > 0 && (
            <details className="axn-logs">
              <summary>
                Latest logs
                <small>
                  {story.logs.at
                    ? `collected ${ago(story.logs.at, now)}`
                    : "from the deployment"}
                </small>
              </summary>
              <pre>{story.logs.lines.join("\n")}</pre>
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpenDestination("logs")}
              >
                Open Logs
                <ArrowRight weight="bold" />
              </button>
            </details>
          )}
        </aside>
      </div>
    </section>
  );
}
