"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction B, Ledger: History as one table. Plain filter tabs with counts,
// a row per operation under day rows, and the evidence as a row that opens
// beneath it. No visuals.

import { Fragment, useState } from "react";

import { OpChip } from "../overview-prototype/shared";
import {
  clockOf,
  dayName,
  FILTERS,
  settledAt,
  type Entry,
} from "./history-model";
import type { HistoryDirectionProps } from "./index";
import "./table.css";

export function TableDirection({
  history,
  filter,
  onFilter,
  now,
  head,
  decisionFor,
  onOpenConversation,
  onOpenDestination,
}: HistoryDirectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  const groups: { key: string; label: string; entries: Entry[] }[] = [
    ...(history.open.length
      ? [{ key: "open", label: "Open now", entries: history.open }]
      : []),
    ...history.days.map((day) => ({
      key: day.key,
      label: dayName(day.at, now),
      entries: day.entries,
    })),
  ];

  return (
    <section className="axlh" aria-label="History">
      {head}
      <div
        className="axlh-tabs"
        role="group"
        aria-label="Filter operation history"
      >
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            disabled={!history.counts[value] && value !== "All"}
            onClick={() => onFilter(value)}
          >
            {value} <span>{history.counts[value]}</span>
          </button>
        ))}
      </div>
      {groups.length ? (
        <div className="axlh-scroll">
          <table className="axlh-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Operation</th>
                <th>State</th>
                <th>From</th>
                <th>Touched</th>
                <th aria-label="Evidence" />
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key}>
                <tr className="axlh-day">
                  <th colSpan={6}>{group.label}</th>
                </tr>
                {group.entries.map((entry) => {
                  const op = entry.op;
                  const expanded = open === op.id;
                  const evidence = Boolean(op.evidence || op.steps?.length);
                  return (
                    <Fragment key={op.id}>
                      <tr id={`axh-${op.id}`} data-state={op.state}>
                        <td className="axlh-when">{clockOf(entry.at)}</td>
                        <td>
                          <b>{op.title}</b>
                          <small>{entry.summary}</small>
                          {entry.resolver && (
                            <small className="axlh-resolved">
                              Resolved by {entry.resolver.title} at{" "}
                              {clockOf(settledAt(entry.resolver))}
                            </small>
                          )}
                          {decisionFor?.(op)}
                        </td>
                        <td>
                          <OpChip state={op.state} />
                        </td>
                        <td>
                          {op.origin ? (
                            <button
                              type="button"
                              className="axlh-link"
                              onClick={() =>
                                onOpenConversation(
                                  op.origin!.chatId,
                                  op.origin!.messageId,
                                )
                              }
                            >
                              {entry.from.replace(/^from /, "")}
                            </button>
                          ) : (
                            entry.from
                          )}
                        </td>
                        <td>
                          {op.destinations
                            .filter((item) => item !== "history")
                            .slice(0, 3)
                            .map((destination, index) => (
                              <Fragment key={destination}>
                                {index > 0 && ", "}
                                <button
                                  type="button"
                                  className="axlh-link"
                                  onClick={() => onOpenDestination(destination)}
                                >
                                  {entry.where[index]}
                                </button>
                              </Fragment>
                            ))}
                          {entry.where.length > 3 &&
                            ` +${entry.where.length - 3}`}
                        </td>
                        <td className="axlh-more">
                          {evidence && (
                            <button
                              type="button"
                              className="axlh-link"
                              aria-expanded={expanded}
                              onClick={() =>
                                setOpen((current) =>
                                  current === op.id ? null : op.id,
                                )
                              }
                            >
                              {expanded ? "Hide" : "Evidence"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="axlh-detail">
                          <td />
                          <td colSpan={5}>
                            {op.evidence && <p>{op.evidence}</p>}
                            {op.steps && op.steps.length > 0 && (
                              <ol>
                                {op.steps.map((step, index) => (
                                  <li
                                    key={`${index}:${step.label}`}
                                    data-state={step.state}
                                  >
                                    {step.label}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <p className="axlh-empty">
          {history.total
            ? "No operations match this filter."
            : "No operations recorded yet. Work appears here as it happens."}
        </p>
      )}
    </section>
  );
}
