"use client";

// PROTOTYPE · claude/deployment-history · throwaway.
// Direction B, Narrated: History as Server Guy's diary. Each day reads as a
// few sentences in his words, one for each stretch of work, and everything
// he did is a link in the sentence; opening it shows the record behind it
// right there, under the words. A failure is told with the retry that fixed
// it. The same filter narrows what he tells. Nothing moves on arrival.

import { ArrowRight, ChatCircleText, X } from "@phosphor-icons/react";
import { Fragment, useState } from "react";

import type {
  ApplicationOperation,
  OperationStep,
} from "@/server/operation-record";

import { labelOf } from "../operation-model";
import { TactileSlider } from "../architecture-prototype/tactile-slider";
import { OpChip } from "../overview-prototype/shared";
import { LittleServer } from "../deployment-prototype/little-server";
import {
  clockOf,
  dayName,
  FILTERS,
  later,
  type Entry,
  type HistoryRecord,
} from "./history-model";
import type { HistoryDirectionProps } from "./index";
import "./narrated.css";

const lower = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);
const stepGlyph: Record<OperationStep["state"], string> = {
  done: "✓",
  active: "›",
  failed: "✗",
  pending: "·",
};
const PAST: [RegExp, string][] = [
  [/^Back up\b/, "backed up"],
  [/^Set up\b/, "set up"],
  [/^Deploy\b/, "deployed"],
  [/^Configure\b/, "configured"],
  [/^Test\b/, "tested"],
  [/^Recreate\b/, "recreated"],
  [/^Restore\b/, "restored"],
  [/^Release\b/, "released"],
  [/^Collect\b/, "collected"],
  [/^Check\b/, "checked"],
  [/^Inspect\b/, "inspected"],
  [/^Investigate\b/, "investigated"],
  [/^Update\b/, "updated"],
  [/^Create\b/, "created"],
  [/^Rotate\b/, "rotated"],
  [/^Renew\b/, "renewed"],
  [/^Prepare\b/, "prepared"],
  [/^Change\b/, "changed"],
  [/^Add\b/, "added"],
  [/^Remove\b/, "removed"],
  [/^Refresh\b/, "refreshed"],
];

/** "Deploy x" → "deployed x"; a title already in the past stays. */
function pastOf(title: string) {
  const match = PAST.find(([pattern]) => pattern.test(title));
  if (match) return title.replace(match[0], match[1]);
  if (/^[A-Z][a-z]+ed\b/.test(title)) return lower(title);
  return `worked on “${title}”`;
}
function triedOf(title: string) {
  return PAST.some(([pattern]) => pattern.test(title))
    ? `tried to ${lower(title)}`
    : `tried “${title}”`;
}
const times = (count: number) =>
  count === 2 ? "twice" : count === 3 ? "three times" : `${count} times`;

/** A link in a sentence: one operation, or the same one done again. */
interface Mention {
  key: string;
  text: string;
  entries: Entry[];
  state: ApplicationOperation["state"];
}
type Part = string | Mention;

function clausesOf(entries: Entry[]): Part[][] {
  const used = new Set<string>();
  const clauses: Part[][] = [];
  for (const entry of entries) {
    const op = entry.op;
    if (used.has(op.id)) continue;
    if (op.state === "failed") {
      // Told with the retry that resolved it, when that is in the sentence.
      if (entries.some((other) => other.op.id === entry.resolver?.id)) continue;
      used.add(op.id);
      clauses.push([
        {
          key: op.id,
          text: triedOf(op.title),
          entries: [entry],
          state: "failed",
        },
        entry.resolver ? " (resolved later)" : ", and it failed",
      ]);
      continue;
    }
    const same = entries.filter(
      (other) =>
        !used.has(other.op.id) &&
        other.op.title === op.title &&
        other.op.state === op.state,
    );
    same.forEach((other) => used.add(other.op.id));
    const clause: Part[] = [
      {
        key: same.map((other) => other.op.id).join("+"),
        text:
          same.length > 1
            ? `${pastOf(op.title)} ${times(same.length)}`
            : pastOf(op.title),
        entries: same,
        state: op.state,
      },
    ];
    const failed = entries.find((other) => other.op.id === entry.resolves?.id);
    if (failed) {
      used.add(failed.op.id);
      clause.push(
        " (",
        {
          key: failed.op.id,
          text: "the first try failed",
          entries: [failed],
          state: "failed",
        },
        `; the retry passed ${later(Date.parse(entry.at) - Date.parse(failed.at))})`,
      );
    }
    clauses.push(clause);
  }
  return clauses;
}

function join(clauses: Part[][], last = " and "): Part[] {
  return clauses.flatMap((clause, index) =>
    index === 0
      ? clause
      : [index === clauses.length - 1 ? last : ", ", ...clause],
  );
}

/** Work an hour apart or more is a new stretch, and a new sentence. */
function sessionsOf(entries: Entry[]) {
  const ordered = [...entries].sort((a, b) => a.at.localeCompare(b.at));
  const groups: Entry[][] = [];
  for (const entry of ordered) {
    const last = groups.at(-1);
    if (last && Date.parse(entry.at) - Date.parse(last.at(-1)!.at) <= 3_600_000)
      last.push(entry);
    else groups.push([entry]);
  }
  return groups.map((group) => {
    const from = group[0].at;
    const to = group.at(-1)!.at;
    return {
      id: group[0].op.id,
      when:
        Date.parse(to) - Date.parse(from) < 5 * 60_000
          ? `At ${clockOf(from)}`
          : `From ${clockOf(from)} to ${clockOf(to)}`,
      parts: join(clausesOf(group)),
    };
  });
}

function ledeOf(history: HistoryRecord) {
  if (!history.total)
    return "Nothing here yet. I'll write down what I do as I do it.";
  const since = history.since
    ? new Date(history.since).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "the start";
  const count = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;
  const { Changes: changes, Inspections: inspections } = history.counts;
  const unresolved = history.failed - history.resolved;
  const made = [
    changes && count(changes, "change"),
    inspections && count(inspections, "inspection"),
  ].filter(Boolean);
  const failures = !history.failed
    ? "."
    : unresolved
      ? `; ${unresolved} failed and still need${unresolved === 1 ? "s" : ""} you.`
      : history.failed === 1
        ? "; the one that failed, I resolved."
        : `; the ${history.failed} that failed, I resolved.`;
  return `Since ${since} I've made ${made.join(" and ")} here. I verified ${history.verified}${failures}`;
}

export function NarratedHistory({
  history,
  filter,
  onFilter,
  now,
  head,
  decisionFor,
  onOpenConversation,
  onOpenDestination,
}: HistoryDirectionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const days = history.days.map((day) => ({
    ...day,
    sessions: sessionsOf(day.entries),
  }));
  const openNow = join(
    history.open.map((entry): Part[] => {
      const mention: Mention = {
        key: entry.op.id,
        text: entry.op.title,
        entries: [entry],
        state: entry.op.state,
      };
      return entry.op.state === "working"
        ? ["I'm on ", mention]
        : entry.op.state === "proposed"
          ? [mention, " waits for your approval"]
          : [mention, " is next"];
    }),
    "; ",
  );
  const unresolved = history.failed - history.resolved;

  const render = (parts: Part[]) =>
    parts.map((part, index) =>
      typeof part === "string" ? (
        <Fragment key={index}>{part}</Fragment>
      ) : (
        <button
          key={part.key}
          type="button"
          className="axhn-op"
          data-state={part.state}
          aria-expanded={selected === part.key}
          onClick={() =>
            setSelected((current) => (current === part.key ? null : part.key))
          }
        >
          {part.text}
        </button>
      ),
    );
  const mentioned = (parts: Part[]) =>
    parts.find(
      (part): part is Mention =>
        typeof part !== "string" && part.key === selected,
    );

  const card = (mention: Mention) => (
    <div className="axhn-card" role="region" aria-label={mention.text}>
      <button
        type="button"
        className="axhn-close"
        aria-label="Close"
        onClick={() => setSelected(null)}
      >
        <X weight="bold" />
      </button>
      {mention.entries.map((entry) => {
        const op = entry.op;
        const first = op.destinations.find((item) => item !== "history");
        const finished = op.state === "verified" || op.state === "inspected";
        return (
          <article key={op.id} className="axhn-entry" data-state={op.state}>
            <header>
              <OpChip state={op.state} />
              <b>{op.title}</b>
              <time dateTime={entry.at}>{clockOf(entry.at)}</time>
            </header>
            <p className="axhn-summary">{entry.summary}</p>
            {op.evidence && op.evidence !== entry.summary && (
              <p className="axhn-evidence">{op.evidence}</p>
            )}
            {op.steps && op.steps.length > 0 && (
              <div className="axhn-console" role="list">
                {op.steps.map((step, index) => {
                  const state =
                    finished && step.state === "active" ? "done" : step.state;
                  return (
                    <div
                      key={`${index}:${step.label}`}
                      className="axhn-step"
                      data-state={state}
                      role="listitem"
                    >
                      <b aria-hidden="true">{stepGlyph[state]}</b>
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {decisionFor?.(op)}
            <footer>
              <span>
                {entry.from}
                {entry.where.length > 0 && ` · ${entry.where.join(", ")}`}
              </span>
              {op.origin ? (
                <button
                  type="button"
                  className="ax-textlink"
                  onClick={() =>
                    onOpenConversation(op.origin!.chatId, op.origin!.messageId)
                  }
                >
                  <ChatCircleText weight="bold" />
                  Open its conversation
                </button>
              ) : (
                first && (
                  <button
                    type="button"
                    className="ax-textlink"
                    onClick={() => onOpenDestination(first)}
                  >
                    Open {labelOf(first)}
                    <ArrowRight weight="bold" />
                  </button>
                )
              )}
            </footer>
          </article>
        );
      })}
    </div>
  );
  const openMention = mentioned(openNow);

  return (
    <section className="axhn" aria-label="History">
      {head}
      <header className="axhn-lede">
        <LittleServer
          mood={unresolved > 0 ? "attention" : "ready"}
          className="axhn-guy"
        />
        <div>
          <p className="axhn-say">{ledeOf(history)}</p>
          <div className="axhn-filter">
            <TactileSlider
              label="Show"
              size="sm"
              options={FILTERS.map((value) => ({
                id: value,
                label: `${value} ${history.counts[value]}`,
              }))}
              value={filter}
              onChange={onFilter}
            />
          </div>
        </div>
      </header>

      {openNow.length > 0 && (
        <section className="axhn-day is-live" aria-label="Right now">
          <h2>Right now</h2>
          <p className="axhn-para">{render(openNow)}.</p>
          {openMention && card(openMention)}
        </section>
      )}
      {days.map((day) => (
        <section key={day.key} className="axhn-day" aria-label={day.key}>
          <h2>{dayName(day.at, now)}</h2>
          {day.sessions.map((session) => {
            const mention = mentioned(session.parts);
            return (
              <Fragment key={session.id}>
                <p className="axhn-para">
                  <span className="axhn-when">{session.when}</span> I{" "}
                  {render(session.parts)}.
                </p>
                {mention && card(mention)}
              </Fragment>
            );
          })}
        </section>
      ))}
      {!days.length && !openNow.length && history.total > 0 && (
        <p className="axhn-empty">Nothing I did matches this filter.</p>
      )}
    </section>
  );
}
