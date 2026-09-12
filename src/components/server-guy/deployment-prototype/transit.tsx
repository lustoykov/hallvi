"use client";

// PROTOTYPE · chosen on claude/deployment-history.
// Transit: now on the left, and the way here as one line of stops on the
// right, in Journeys' transit language. Pointing at a stop lights the line
// up to it, stop by stop from the first; a stop opens the lines recorded
// there. What isn't set up sits on the line as dashed ghosts where it would
// go: deploying on push before the first stop, rolling back after now.
// Little Server waits at now. Nothing moves on arrival.

import {
  ArrowRight,
  ChatCircleText,
  Check,
  SpinnerGap,
  User,
  Warning,
} from "@phosphor-icons/react";
import { useCallback, useState, type CSSProperties } from "react";

import type { MascotMood } from "../home/mascot-scene";
import { ago, localTime } from "../architecture-prototype/model";
import { useDismiss } from "../overview-prototype/shared";
import { took, type Phase, type Tone } from "./deployment-model";
import type { DirectionProps } from "./index";
import { LittleServer } from "./little-server";
import { nextStep } from "./next-step";
import { Tag } from "./tag";
import "./transit.css";

const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;
const moodOf: Record<Tone, MascotMood> = {
  verified: "ready",
  stale: "resting",
  failed: "attention",
  planned: "ready",
  checking: "working",
};
const span = (phase: Phase) =>
  Math.max(0, Date.parse(phase.end) - Date.parse(phase.start));
const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function TransitDirection({
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
  const [lit, setLit] = useState<number | null>(null);
  const [fact, setFact] = useState<string | null>(null);
  const close = useCallback(() => setFact(null), []);
  useDismiss(Boolean(fact), ".axm-fact", close);

  const step = nextStep(story, onAsk, onOpenConversation);
  const push = story.gaps.find((gap) => gap.id === "push");
  const rollback = story.gaps.find((gap) => gap.id === "rollback");
  const lastPass = story.checks
    .map((check) => check.at)
    .filter((at): at is string => Boolean(at))
    .sort()
    .at(-1);
  // Stops in order: the ghost before, the phases, now, the ghost after. A
  // lit stop lights the rail of every stop before it.
  const first = push ? 1 : 0;
  const nowAt = first + story.phases.length;
  const isLit = (at: number) => (lit !== null && at < lit) || undefined;
  const point = (at: number) => ({
    onPointerEnter: () => setLit(at),
    onPointerLeave: () => setLit(null),
    onFocus: () => setLit(at),
    onBlur: () => setLit(null),
  });

  // Nothing deployed: the product's panel is the Deployment region, with its
  // actions, so the page doesn't name a second one around it.
  if (story.state === "none")
    return (
      <div className="axm">
        {head}
        {activity}
        <div className="axm-none">{panel}</div>
      </div>
    );

  return (
    <section className="axm" aria-label="Deployment">
      {head}
      {activity}
      <div className="axm-body">
        <aside className="axm-now" aria-label="Now">
          <h2 className="axm-say">{story.statement}</h2>
          <p className="axm-sure">
            <Tag tone={story.tone}>{story.word}</Tag>
            <span>{story.detail}</span>
          </p>
          {step && (
            <button
              type="button"
              className="ax-button axm-next"
              onClick={step.run}
            >
              {step.ask && <ChatCircleText weight="bold" />}
              {step.label}
              {!step.ask && <ArrowRight weight="bold" />}
            </button>
          )}
          {story.facts.length > 0 && (
            <dl className="axm-facts">
              {story.facts.map((item) => (
                <div key={item.label} className="axm-fact">
                  <dt>{item.label}</dt>
                  <dd>
                    <button
                      type="button"
                      className="axm-fact-open"
                      aria-expanded={fact === item.label}
                      disabled={!item.exact.length}
                      onClick={() =>
                        setFact((value) =>
                          value === item.label ? null : item.label,
                        )
                      }
                    >
                      <b>{item.value}</b>
                      <small>{item.sub}</small>
                    </button>
                    {fact === item.label && (
                      <div
                        className="axm-pop"
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
          {story.checks.length > 0 && (
            <section className="axm-checks" aria-label="Checks">
              <h3>
                {story.state === "live" ? "Checks it passes" : "Checks it runs"}
              </h3>
              <ul>
                {story.checks.map((check) => (
                  <li
                    key={`${check.name}:${check.probe}`}
                    data-passed={Boolean(check.at)}
                  >
                    <span className="axm-tick" aria-hidden="true">
                      <Check weight="bold" />
                    </span>
                    <span>
                      <b>{check.name}</b>
                      <small>
                        {check.inside
                          ? "Inside the server"
                          : "From your network"}
                        {/* A check Pi recorded without naming what it probed
                            says where it ran and stops there, rather than
                            trailing a separator into nothing. */}
                        {check.probe && (
                          <>
                            {" · "}
                            <code>{check.probe}</code>
                          </>
                        )}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <small className="axm-note">
                {lastPass
                  ? `Last passed ${ago(lastPass, now)}.`
                  : "They run when it deploys."}
              </small>
            </section>
          )}
          {story.logs.lines.length > 0 && (
            <details className="axm-logs">
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

        <section className="axm-map" aria-label="How it got here">
          <header className="axm-map-head">
            <h2>
              {story.state === "awaiting"
                ? "How the plan was made"
                : "How it got here"}
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
          <ol className="axm-line">
            {push && (
              <li className="axm-stop is-ghost" data-lit={isLit(0)}>
                <span className="axm-dot" aria-hidden="true" />
                <div className="axm-stop-main">
                  <b>{push.title}</b>
                  <small>{push.detail}</small>
                </div>
              </li>
            )}
            {story.phases.map((phase, index) => {
              const at = first + index;
              const expanded = open === phase.id;
              return (
                <li
                  key={phase.id}
                  className={`axm-stop${expanded ? " is-open" : ""}`}
                  data-tone={phase.tone}
                  data-then={
                    story.phases[index + 1]?.tone === "wait"
                      ? "wait"
                      : undefined
                  }
                  data-lit={isLit(at)}
                  style={{ "--i": index } as CSSProperties}
                  {...point(at)}
                >
                  <span className="axm-dot" aria-hidden="true">
                    {phase.tone === "fail" ? (
                      <Warning weight="bold" />
                    ) : phase.tone === "wait" ? (
                      <User weight="bold" />
                    ) : phase.tone === "work" ? (
                      <SpinnerGap weight="bold" className="ax-spin" />
                    ) : null}
                  </span>
                  <button
                    type="button"
                    className="axm-stop-main"
                    aria-expanded={phase.lines.length ? expanded : undefined}
                    disabled={!phase.lines.length}
                    onClick={() =>
                      setOpen((value) => (value === phase.id ? null : phase.id))
                    }
                  >
                    <b>{phase.title}</b>
                    <small>{phase.detail}</small>
                  </button>
                  <span className="axm-when">
                    <time>{localTime(phase.start)}</time>
                    <small>{took(span(phase))}</small>
                  </span>
                  {expanded && (
                    <div className="axm-lines" role="log">
                      {phase.lines.map((line, position) => (
                        <div
                          key={`${line.at}:${position}`}
                          className="axm-rec"
                          data-tone={line.tone}
                        >
                          <time>{clock(line.at)}</time>
                          <b aria-hidden="true">{glyph[line.tone]}</b>
                          <span>{line.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
            <li
              className="axm-stop is-now"
              data-tone={story.tone}
              data-then={rollback ? "ghost" : undefined}
              onPointerEnter={() => setLit(nowAt)}
              onPointerLeave={() => setLit(null)}
            >
              <span className="axm-dot" aria-hidden="true" />
              <div className="axm-stop-main">
                <b>Now</b>
                <small>
                  {story.word}. {story.detail}
                </small>
              </div>
              <LittleServer mood={moodOf[story.tone]} className="axm-guy" />
            </li>
            {rollback && (
              <li className="axm-stop is-ghost">
                <span className="axm-dot" aria-hidden="true" />
                <div className="axm-stop-main">
                  <b>{rollback.title}</b>
                  <small>{rollback.detail}</small>
                </div>
              </li>
            )}
          </ol>
        </section>
      </div>
    </section>
  );
}
