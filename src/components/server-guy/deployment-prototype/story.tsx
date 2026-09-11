"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction A, Story: what is live, then how it got there. A calm release
// card says what is serving and how sure Server Guy is; exact values open
// on click. One band shows the deployment's phases at a glance, and each
// phase opens the recorded lines behind it. The checks, what isn't set up
// and the latest logs follow. Nothing animates on arrival; only work in
// progress moves.

import {
  ArrowRight,
  ChatCircleText,
  CaretDown,
  Check,
  Hourglass,
  MinusCircle,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useState, type ReactNode } from "react";

import { ago, localTime } from "../architecture-prototype/model";
import { useDismiss } from "../overview-prototype/shared";
import {
  took,
  type Phase,
  type PhaseTone,
  type Tone,
} from "./deployment-model";
import type { DirectionProps } from "./index";
import "./story.css";

const tagIcon: Record<Tone, ReactNode> = {
  verified: <Check weight="bold" />,
  stale: <Hourglass weight="bold" />,
  failed: <Warning weight="bold" />,
  planned: <MinusCircle weight="bold" />,
  checking: <SpinnerGap weight="bold" className="ax-spin" />,
};
const markIcon: Record<PhaseTone, ReactNode> = {
  pass: <Check weight="bold" />,
  fail: <Warning weight="bold" />,
  wait: <Hourglass weight="bold" />,
  work: <SpinnerGap weight="bold" className="ax-spin" />,
};
const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className="ax-tag" data-c={tone}>
      <span className="ax-tag-icon" aria-hidden="true">
        {tagIcon[tone]}
      </span>
      {children}
    </span>
  );
}

const span = (phase: Phase) =>
  Math.max(0, Date.parse(phase.end) - Date.parse(phase.start));

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function StoryDirection({
  story,
  now,
  head,
  activity,
  panel,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: DirectionProps) {
  const [fact, setFact] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const close = useCallback(() => setFact(null), []);
  useDismiss(Boolean(fact), ".axd-fact", close);

  const live = story.state === "live";
  const chat = story.chat;
  const total = story.phases.reduce((sum, item) => sum + span(item), 0);
  // Even a one-second phase stays visible on the band.
  const weight = (item: Phase) => Math.max(span(item), total * 0.05, 1);
  const lastPass = story.checks
    .map((check) => check.at)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);

  const actions =
    story.state === "live" ? (
      <button
        type="button"
        className="ax-button axd-primary"
        onClick={() =>
          onAsk(`Release the latest revision of ${story.repository}.`)
        }
      >
        <ChatCircleText weight="bold" />
        Release an update
      </button>
    ) : story.state === "awaiting" && chat ? (
      <button
        type="button"
        className="ax-button axd-primary"
        onClick={() => onOpenConversation(chat.chatId, chat.messageId)}
      >
        Review and approve
        <ArrowRight weight="bold" />
      </button>
    ) : story.state === "failed" ? (
      <button
        type="button"
        className="ax-button axd-primary"
        onClick={() =>
          onAsk("Find out why the latest deployment stopped, and fix it.")
        }
      >
        <ChatCircleText weight="bold" />
        Ask Server Guy to look into it
      </button>
    ) : story.state === "working" && chat ? (
      <button
        type="button"
        className="ax-button"
        onClick={() => onOpenConversation(chat.chatId, chat.messageId)}
      >
        Follow in the conversation
        <ArrowRight weight="bold" />
      </button>
    ) : story.state === "unknown" ? (
      <button
        type="button"
        className="ax-button axd-primary"
        onClick={() => onAsk(`Check what is running for ${story.name} now.`)}
      >
        <ChatCircleText weight="bold" />
        Ask Server Guy to check it
      </button>
    ) : null;

  return (
    <section className="axd" aria-label="Deployment">
      {head}
      {activity}

      {story.state === "none" ? (
        <div className="axd-none">{panel}</div>
      ) : (
        <section className="axd-live" data-tone={story.tone}>
          <div className="axd-live-head">
            <div>
              <h2 className="axd-say">{story.statement}</h2>
              <p className="axd-said">
                <Tag tone={story.tone}>{story.word}</Tag>
                <span>{story.detail}</span>
              </p>
            </div>
            {actions && <div className="axd-actions">{actions}</div>}
          </div>
          {story.facts.length > 0 && (
            <dl className="axd-facts">
              {story.facts.map((item) => (
                <div key={item.label} className="axd-fact">
                  <dt>{item.label}</dt>
                  <dd>
                    <button
                      type="button"
                      className="axd-fact-open"
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
                        className="axd-pop"
                        role="dialog"
                        aria-label={item.label}
                      >
                        <dl>
                          {item.exact.map((row) => (
                            <div key={row.label}>
                              <dt>{row.label}</dt>
                              <dd className={row.mono ? "ax-mono" : undefined}>
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
          )}
        </section>
      )}

      {story.phases.length > 0 && (
        <section className="axd-sec" aria-label="How it got there">
          <header className="axd-sec-head">
            <h2>
              {story.state === "awaiting"
                ? "How the plan was made"
                : "How it got there"}
            </h2>
            {story.started && (
              <small>
                {new Date(story.started).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {story.took} · {story.attempts}{" "}
                {story.attempts === 1 ? "attempt" : "attempts"}
              </small>
            )}
          </header>
          <div className="axd-band" aria-hidden="true">
            {story.phases.map((item) => (
              <span
                key={item.id}
                className="axd-seg"
                data-tone={item.tone}
                data-lit={lit === item.id || undefined}
                style={{ flexGrow: weight(item) }}
                title={`${item.title} · ${took(span(item))}`}
                onPointerEnter={() => setLit(item.id)}
                onPointerLeave={() => setLit(null)}
                onClick={() => item.lines.length && setPhase(item.id)}
              />
            ))}
          </div>
          <div className="axd-band-ends" aria-hidden="true">
            <span>{localTime(story.phases[0].start)}</span>
            <span>{localTime(story.phases.at(-1)!.end)}</span>
          </div>
          <ol className="axd-steps">
            {story.phases.map((item) => {
              const open = phase === item.id;
              return (
                <li
                  key={item.id}
                  className={`axd-step${open ? " is-open" : ""}${lit === item.id ? " is-lit" : ""}`}
                  data-tone={item.tone}
                  onPointerEnter={() => setLit(item.id)}
                  onPointerLeave={() => setLit(null)}
                >
                  <button
                    type="button"
                    className="axd-step-main"
                    aria-expanded={item.lines.length ? open : undefined}
                    disabled={!item.lines.length}
                    onClick={() =>
                      setPhase((current) =>
                        current === item.id ? null : item.id,
                      )
                    }
                  >
                    <span className="axd-mark" aria-hidden="true">
                      {markIcon[item.tone]}
                    </span>
                    <span className="axd-step-text">
                      <b>{item.title}</b>
                      <small>{item.detail}</small>
                    </span>
                    <span className="axd-step-when">
                      <time>{localTime(item.start)}</time>
                      <small>{took(span(item))}</small>
                    </span>
                    {item.lines.length > 0 ? (
                      <CaretDown weight="bold" className="axd-caret" />
                    ) : (
                      <span />
                    )}
                  </button>
                  {item.lines.length > 0 && (
                    <div className="axd-step-body">
                      <div>
                        <div className="axd-console" role="log">
                          {item.lines.map((line, index) => (
                            <div
                              key={`${line.at}:${index}`}
                              className="axd-line"
                              data-tone={line.tone}
                            >
                              <time>{clock(line.at)}</time>
                              <b aria-hidden="true">{glyph[line.tone]}</b>
                              <span>{line.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {story.state !== "none" && (
        <div className="axd-lower">
          {story.checks.length > 0 && (
            <section className="axd-sec axd-checks" aria-label="Checks">
              <header className="axd-sec-head">
                <h2>{live ? "Checks it passes" : "Checks it runs"}</h2>
                <small>
                  {lastPass
                    ? `Last passed ${ago(lastPass, now)}`
                    : "Run when it deploys"}
                </small>
              </header>
              <ul>
                {story.checks.map((check) => (
                  <li
                    key={`${check.name}:${check.probe}`}
                    className="axd-check"
                    data-passed={Boolean(check.at)}
                  >
                    <span className="axd-check-mark" aria-hidden="true">
                      <Check weight="bold" />
                    </span>
                    <b>{check.name}</b>
                    <span className="axd-check-probe">
                      <code>{check.probe}</code>
                      <span>
                        {check.inside
                          ? "inside the server"
                          : "from your network"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="axd-side">
            <section className="axd-sec" aria-label="Not set up yet">
              <header className="axd-sec-head">
                <h2>Not set up yet</h2>
              </header>
              <div className="axd-gaps">
                {story.gaps.map((gap) => (
                  <div key={gap.id} className="axd-gap">
                    <MinusCircle weight="bold" aria-hidden="true" />
                    <b>{gap.title}</b>
                    <small>{gap.detail}</small>
                  </div>
                ))}
              </div>
            </section>
            {story.logs.lines.length > 0 && (
              <details className="axd-logs">
                <summary>
                  <span>Latest logs</span>
                  <small>
                    {story.logs.at
                      ? `collected ${ago(story.logs.at, now)}`
                      : "collected with the deployment"}
                  </small>
                </summary>
                <pre className="axd-pre">{story.logs.lines.join("\n")}</pre>
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
          </div>
        </div>
      )}
    </section>
  );
}
