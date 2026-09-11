"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction B, Ledger: the same record as a well-set document. No visuals:
// facts in a sheet, phases, checks and every recorded action in tables, and
// the logs as plain text. Exact values are shown, not hidden.

import { ArrowRight, ChatCircleText } from "@phosphor-icons/react";
import { useState } from "react";

import { ago, localTime } from "../architecture-prototype/model";
import { took } from "./deployment-model";
import type { DirectionProps } from "./index";
import { Tag } from "./story";
import "./ledger.css";

const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

export function LedgerDirection({
  story,
  now,
  head,
  activity,
  panel,
  onAsk,
  onOpenConversation,
  onOpenDestination,
}: DirectionProps) {
  const [all, setAll] = useState(false);
  const lines = story.phases.flatMap((phase) => phase.lines);
  const shown = all ? lines : lines.slice(-10);
  const chat = story.chat;

  return (
    <section className="axl" aria-label="Deployment">
      {head}
      {activity}
      {story.state === "none" ? (
        panel
      ) : (
        <>
          <p className="axl-say">
            {story.statement}
            <Tag tone={story.tone}>{story.word}</Tag>
          </p>
          <p className="axl-note">{story.detail}</p>

          <dl className="axl-sheet">
            {story.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>
                  <span>
                    {fact.value} · {fact.sub}
                  </span>
                  {fact.exact.map((row) => (
                    <small key={row.label}>
                      {row.label}:{" "}
                      {row.mono ? <code>{row.value}</code> : row.value}
                    </small>
                  ))}
                </dd>
              </div>
            ))}
            {story.took && (
              <div>
                <dt>Took</dt>
                <dd>
                  <span>
                    {story.took}, {story.attempts}{" "}
                    {story.attempts === 1 ? "attempt" : "attempts"}
                  </span>
                </dd>
              </div>
            )}
          </dl>

          {story.phases.length > 0 && (
            <>
              <h3 className="axl-h">Phases</h3>
              <table className="axl-table">
                <thead>
                  <tr>
                    <th>Started</th>
                    <th>Phase</th>
                    <th>What happened</th>
                    <th className="num">Took</th>
                  </tr>
                </thead>
                <tbody>
                  {story.phases.map((phase) => (
                    <tr key={phase.id} data-tone={phase.tone}>
                      <td className="axl-when">{localTime(phase.start)}</td>
                      <td>
                        <b>{phase.title}</b>
                      </td>
                      <td>{phase.detail}</td>
                      <td className="num">
                        {took(Date.parse(phase.end) - Date.parse(phase.start))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {story.checks.length > 0 && (
            <>
              <h3 className="axl-h">Checks</h3>
              <table className="axl-table">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Probe</th>
                    <th>From</th>
                    <th className="num">Last passed</th>
                  </tr>
                </thead>
                <tbody>
                  {story.checks.map((check) => (
                    <tr key={`${check.name}:${check.probe}`}>
                      <td>{check.name}</td>
                      <td>
                        <code>{check.probe}</code>
                      </td>
                      <td>
                        {check.inside ? "Inside the server" : "Your network"}
                      </td>
                      <td className="num">
                        {check.at ? ago(check.at, now) : "Not yet"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {lines.length > 0 && (
            <>
              <h3 className="axl-h">
                Every recorded action
                {lines.length > 10 && (
                  <button
                    type="button"
                    onClick={() => setAll((value) => !value)}
                  >
                    {all ? "Show the last 10" : `Show all ${lines.length}`}
                  </button>
                )}
              </h3>
              <table className="axl-table axl-actions-table">
                <tbody>
                  {shown.map((line, index) => (
                    <tr key={`${line.at}:${index}`} data-tone={line.tone}>
                      <td className="axl-when">{clock(line.at)}</td>
                      <td>{line.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {story.logs.lines.length > 0 && (
            <>
              <h3 className="axl-h">
                Latest logs
                <button type="button" onClick={() => onOpenDestination("logs")}>
                  Open Logs
                </button>
              </h3>
              <pre className="axl-pre">{story.logs.lines.join("\n")}</pre>
            </>
          )}

          <h3 className="axl-h">Not set up yet</h3>
          <ul className="axl-gaps">
            {story.gaps.map((gap) => (
              <li key={gap.id}>
                {gap.title}. <span>{gap.detail}</span>
              </li>
            ))}
          </ul>

          <p className="axl-links">
            {story.state === "live" && (
              <button
                type="button"
                className="ax-textlink"
                onClick={() =>
                  onAsk(`Release the latest revision of ${story.repository}.`)
                }
              >
                <ChatCircleText weight="bold" />
                Ask Server Guy to release an update
              </button>
            )}
            {chat && (
              <button
                type="button"
                className="ax-textlink"
                onClick={() => onOpenConversation(chat.chatId, chat.messageId)}
              >
                Open the conversation it came from
                <ArrowRight weight="bold" />
              </button>
            )}
          </p>
        </>
      )}
    </section>
  );
}
