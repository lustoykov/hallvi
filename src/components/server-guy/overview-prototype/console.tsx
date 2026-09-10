"use client";

// PROTOTYPE · claude/architecture-directions · throwaway.
// Direction C, Console: Server Guy's console is the page. Little Server
// stands on it; the four vital signs are its status lines, each opening in
// place; the recorded work runs underneath, and a re-check streams into it.

import {
  ArrowRight,
  ArrowsClockwise,
  CaretDown,
  ChatCircleText,
  Hourglass,
  SpinnerGap,
  Warning,
} from "@phosphor-icons/react";
import { Fragment, useState } from "react";

import { labelOf } from "../operation-model";
import { ago } from "../architecture-prototype/model";
import type { HeroProps } from "./hero";
import type { Vital } from "./overview-model";
import { span, useCountdown } from "./shared";
import { Mascot, useServerGuy } from "./use-server-guy";
import "./console.css";

const glyph = { pass: "✓", fail: "✗", work: "›", info: "·" } as const;
const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const day = (at: string) =>
  new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function ConsoleHero({
  model,
  overview,
  recheck,
  page,
  offset,
  onPoint,
  onShow,
  onAsk,
  onOpenDestination,
}: HeroProps) {
  const [guy, mascot] = useServerGuy(model, recheck);
  const [open, setOpen] = useState<Vital["id"] | null>(null);
  const [more, setMore] = useState(false);
  const planned = model.status !== "live";
  const host = model.byId.host;
  const app = model.byId.app;
  const service = model.parts.find((part) => part.kind === "private");
  const failed = model.parts.find((part) => part.evidence.certainty === "failed");
  const backups = overview.vitals.find((vital) => vital.id === "backups");
  const nextIn = useCountdown(backups?.countdownTo, offset);
  const lines = guy.lines.slice(more ? -16 : -6);

  const parts: Record<Vital["id"], string[]> = {
    checks: ["app", service?.id ?? ""],
    backups: [],
    server: ["host"],
    access: ["gate:http"],
  };
  const partOf: Record<Vital["id"], string> = {
    checks: failed && failed.id !== "host" ? failed.id : "app",
    backups: "offsite",
    server: "host",
    access: "gate:http",
  };
  const sub = planned
    ? "Nothing runs yet. The plan waits for your approval."
    : overview.needs.length
      ? null
      : app?.evidence.at
        ? `Last full check ${ago(app.evidence.at, model.now)}.${host?.evidence.certainty === "verified" && app.evidence.certainty !== "verified" ? ` The server answered ${ago(host.evidence.at, model.now)}.` : ""}`
        : null;

  return (
    <section
      className={`axk${guy.simulating ? " is-live" : ""}${planned ? " is-planned" : ""}`}
      aria-label="How it is doing"
    >
      <div className="axk-perch">
        <Mascot guy={guy} mascotRef={mascot} className="axk-mascot" />
      </div>
      <div className="axk-bar">
        <span>
          server-guy · {model.headline.toLowerCase()} · {host?.name.toLowerCase() ?? "server"}
        </span>
        <em className={guy.simulating ? "is-simulated" : undefined}>
          {guy.simulating
            ? guy.running
              ? "Simulated check · nothing is contacted"
              : "Simulated check · nothing was contacted"
            : "Recorded work"}
        </em>
      </div>

      <div className="axk-head">
        <div>
          <h2 className="axk-say" key={overview.headline}>
            {overview.headline}
          </h2>
          {sub && <p className="axk-sub">{sub}</p>}
        </div>
        {!planned && (
          <div className="axk-run">
            <button type="button" className="axk-button" disabled={guy.running} onClick={guy.run}>
              {guy.running ? <SpinnerGap weight="bold" className="ax-spin" /> : <ArrowsClockwise weight="bold" />}
              {guy.running ? "Checking…" : "Run the checks"}
            </button>
            <small>Simulated</small>
          </div>
        )}
      </div>

      {overview.needs.length > 0 && (
        <div className="axk-needs">
          {overview.needs.map((need) => (
            <div
              key={need.id}
              className="axk-need"
              data-tone={need.tone}
              onPointerEnter={() => need.partId && onPoint(need.partId)}
              onPointerLeave={() => onPoint(null)}
            >
              <span className="axk-need-icon" aria-hidden="true">
                {need.tone === "failed" ? <Warning weight="bold" /> : <Hourglass weight="bold" />}
              </span>
              <div>
                <b>{need.title}</b>
                <p>
                  {need.detail}
                  {need.invented && <span className="ax-invented">invented</span>}
                </p>
              </div>
              <div className="axk-need-actions">
                {need.partId && (
                  <button type="button" className="axk-link" onClick={() => onShow(need.partId!)}>
                    Show on the map
                    <ArrowRight weight="bold" />
                  </button>
                )}
                <button
                  type="button"
                  className="axk-button"
                  onClick={() =>
                    need.primary.open ? need.primary.open() : need.primary.draft && onAsk(need.primary.draft)
                  }
                >
                  {need.primary.label}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="axk-rows">
        {overview.vitals.map((vital) => {
          const checking = parts[vital.id].some((id) => recheck.marks[id] === "checking");
          const isOpen = open === vital.id;
          return (
            <div
              key={vital.id}
              className={`axk-row${isOpen ? " is-open" : ""}`}
              data-c={checking ? "checking" : vital.status.certainty}
            >
              <button
                type="button"
                className="axk-row-main"
                aria-expanded={isOpen}
                onClick={() => setOpen((current) => (current === vital.id ? null : vital.id))}
                onPointerEnter={() => onPoint(partOf[vital.id])}
                onPointerLeave={() => onPoint(null)}
              >
                <i className="axk-dot" aria-hidden="true" />
                <b>{vital.label}</b>
                <span className="axk-what">
                  <strong>{vital.value}</strong>
                  {vital.id === "backups" && nextIn && !planned && <> · next copy in {nextIn}</>}
                  {vital.lines.length > 0 && <> · {vital.lines.join(" · ")}</>}
                </span>
                <span className="axk-state" key={`${vital.status.text}:${checking}`}>
                  {checking ? "Checking…" : vital.status.text}
                </span>
                <CaretDown weight="bold" className="axk-caret" aria-hidden="true" />
              </button>
              <div className="axk-detail">
                <div>
                  <p>{vital.plain}</p>
                  {vital.facts.length > 0 && (
                    <dl>
                      {vital.facts.map((fact) => (
                        <div key={`${fact.label}:${fact.value}`}>
                          <dt>{fact.label}</dt>
                          <dd className={fact.mono ? "ax-mono" : undefined}>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="axk-detail-actions">
                    <button type="button" className="axk-link" onClick={() => onOpenDestination(vital.destination)}>
                      Open {labelOf(vital.destination)}
                      <ArrowRight weight="bold" />
                    </button>
                    <button type="button" className="axk-link" onClick={() => onAsk(vital.ask)}>
                      <ChatCircleText weight="bold" />
                      Ask in the conversation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="axk-log">
        <div className="axk-log-head">
          <span>
            # {page.last ? `Last change: ${page.last.title} · ${ago(page.last.at, model.now)}` : "Recorded work"}
            {page.last?.open && page.last.conversation && (
              <>
                {" · from "}
                <button type="button" onClick={page.last.open}>
                  {page.last.conversation}
                </button>
              </>
            )}
          </span>
          {guy.lines.length > 6 && (
            <button type="button" onClick={() => setMore((value) => !value)}>
              {more ? "Show less" : "Show more"}
            </button>
          )}
        </div>
        <div className="axk-lines" role="log" aria-live="polite">
          {lines.length === 0 && (
            <div className="axk-line" data-tone="info">
              <time>--:--:--</time>
              <b>·</b>
              <span>{planned ? "Nothing has run yet. The plan waits for your approval." : "No work recorded yet."}</span>
            </div>
          )}
          {lines.map((line, i) => {
            const previous = lines[i - 1];
            const newest = i === lines.length - 1;
            return (
              <Fragment key={line.id}>
                {(!previous || day(previous.at) !== day(line.at)) && <div className="axk-day">{day(line.at)}</div>}
                <div className={`axk-line${newest ? " is-newest" : ""}`} data-tone={line.tone}>
                  <time>{clock(line.at)}</time>
                  <b aria-hidden="true">{glyph[line.tone]}</b>
                  <span>
                    {line.text}
                    {line.invented && <em>{line.id.startsWith("live:") ? "simulated" : "invented"}</em>}
                    {newest && guy.running && <i className="axk-caret-blink" aria-hidden="true" />}
                  </span>
                </div>
              </Fragment>
            );
          })}
        </div>
        {!planned && lines.length > 0 && (
          <p className="axk-quiet">
            {model.monitored
              ? "A watcher checks between runs."
              : `Between runs nothing watches it${app?.evidence.at ? `: the last run was ${span(model.now - Date.parse(app.evidence.at))} ago` : ""}.`}
          </p>
        )}
      </div>
    </section>
  );
}
