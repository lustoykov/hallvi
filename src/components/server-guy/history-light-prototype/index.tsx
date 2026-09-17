"use client";

// PROTOTYPE · prototype/history-tasks-2 · throwaway.
//
// Three small additions to the shipped Transit History. The fixture is the
// first prototype's invented timeline, projected through the same History
// model the product uses. Nothing here reads product data or runs a mutation.

import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import type { ApplicationOperation } from "@/server/operation-record";

import type { ApplicationSection } from "../application-sections";
import type { PageChrome } from "../deployment-prototype/page-head";
import { PageHead } from "../deployment-prototype/page-head";
import { FeedRow } from "../history-prototype/feed";
import {
  buildHistory,
  dayName,
  type Entry,
  type Filter,
  type HistoryRecord,
} from "../history-prototype/history-model";
import { TransitHistory } from "../history-prototype/transit";
import { historyFromRecords } from "../history-records";
import { labelOf } from "../operation-model";
import {
  projectTasks,
  type Change,
  type Outcome,
  type Projection,
} from "./task-model";
import { states, timelineFor, type StateId } from "./timeline";
import "../architecture-prototype/prototype.css";
import "../architecture-prototype/journey-v2.css";
import "./light.css";

type Variant = "A" | "B" | "C";

const VARIANTS: { id: Variant; name: string }[] = [
  { id: "A", name: "Tasks, not rows" },
  { id: "B", name: "The shape of the week" },
  { id: "C", name: "What actually moved" },
];

const OUTCOME_STATE: Record<Outcome, ApplicationOperation["state"]> = {
  changed: "verified",
  looked: "inspected",
  failed: "failed",
  declined: "declined",
  waiting: "proposed",
};

export function wantedVariant(search: string): Variant | null {
  const wanted = new URLSearchParams(search).get("variant")?.toUpperCase();
  return wanted === "A" || wanted === "B" || wanted === "C" ? wanted : null;
}

function timelineEntries(history: HistoryRecord) {
  return [...history.open, ...history.days.flatMap((day) => day.entries)];
}

function runIndex(
  records: ReturnType<typeof timelineFor>["records"],
  executions: ReturnType<typeof timelineFor>["executions"],
) {
  const executionById = new Map(executions.map((item) => [item.id, item]));
  const index = new Map<string, string>();
  for (const execution of executions)
    if (execution.runId)
      index.set(`execution:${execution.id}`, execution.runId);
  for (const record of records) {
    const runs = new Set(
      record.evidence
        .filter((item) => item.type === "execution")
        .map((item) => executionById.get(item.id)?.runId)
        .filter((run): run is string => Boolean(run)),
    );
    if (runs.size === 1) index.set(`record:${record.id}`, [...runs][0]);
  }
  return index;
}

function taskOperations({
  operations,
  projection,
  runs,
}: {
  operations: ApplicationOperation[];
  projection: Projection;
  runs: Map<string, string>;
}) {
  const grouped = new Map<string, ApplicationOperation[]>();
  const loose: ApplicationOperation[] = [];
  for (const operation of operations) {
    const run = runs.get(operation.id);
    if (!run) loose.push(operation);
    else grouped.set(run, [...(grouped.get(run) ?? []), operation]);
  }
  const taskById = new Map(projection.tasks.map((task) => [task.id, task]));
  const children = new Map<string, string[]>();
  const folded: ApplicationOperation[] = [];
  for (const [run, items] of grouped) {
    const task = taskById.get(run);
    if (!task) {
      folded.push(...items);
      continue;
    }
    const id = `task:${run}`;
    children.set(
      id,
      items.map((item) => item.id),
    );
    folded.push({
      id,
      source: { type: "inspection", id },
      kind: task.outcome === "looked" ? "inspection" : "change",
      title: task.title,
      state: OUTCOME_STATE[task.outcome],
      destinations: items.flatMap((item) => item.destinations),
      origin:
        task.attribution.kind === "chat" && task.attribution.chatId
          ? {
              chatId: task.attribution.chatId,
              messageId: task.attribution.messageId,
            }
          : null,
      mentions: [],
      startedAt: task.startedAt,
      updatedAt: task.endedAt,
      summary: task.says,
      next: task.next ?? undefined,
      evidence: `${items.length} ${items.length === 1 ? "event" : "events"} in this Pi run.`,
    });
  }
  return { operations: [...folded, ...loose], children };
}

function Lens({
  pressed,
  onPress,
  children,
}: {
  pressed: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <div className="h2-lens">
      <button type="button" aria-pressed={pressed} onClick={onPress}>
        <span aria-hidden="true" />
        {children}
      </button>
    </div>
  );
}

function TaskChildren({
  entries,
  onOpenConversation,
  onOpenDestination,
}: {
  entries: Entry[];
  onOpenConversation: (chatId: string, messageId: string | null) => void;
  onOpenDestination: (destination: ApplicationSection) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ol className="axh-list h2-task-children" aria-label="Events in this task">
      {entries.map((entry) => (
        <FeedRow
          key={entry.op.id}
          entry={entry}
          expanded={open === entry.op.id}
          onToggle={() =>
            setOpen((current) => (current === entry.op.id ? null : entry.op.id))
          }
          flash={false}
          onJump={() => undefined}
          onOpenConversation={onOpenConversation}
          onOpenDestination={onOpenDestination}
        />
      ))}
    </ol>
  );
}

function WeekStrip({ history, now }: { history: HistoryRecord; now: number }) {
  const entries = timelineEntries(history);
  const byDay = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = new Date(entry.at).toDateString();
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }
  const days = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - offset));
    return date;
  });
  const jump = (key: string) => {
    const index = history.days.findIndex((day) => day.key === key);
    if (index >= 0)
      document.getElementById(`axhm-day-${index}`)?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
  };
  return (
    <div className="h2-week" aria-label="The shape of the last seven days">
      {days.map((date) => {
        const key = date.toDateString();
        const dayEntries = byDay.get(key) ?? [];
        return (
          <button
            key={key}
            type="button"
            disabled={!dayEntries.length}
            onClick={() => jump(key)}
            title={
              dayEntries.length
                ? `Scroll to ${dayName(date.toISOString(), now)}`
                : "No recorded work"
            }
          >
            <span>
              {date.toLocaleDateString(undefined, { weekday: "short" })}
            </span>
            <i aria-hidden="true">
              {dayEntries.slice(0, 10).map((entry) => (
                <em
                  key={entry.op.id}
                  data-outcome={
                    entry.op.state === "failed"
                      ? "failed"
                      : entry.needsYou
                        ? "waiting"
                        : entry.op.kind === "inspection"
                          ? "looked"
                          : "verified"
                  }
                />
              ))}
              {!dayEntries.length && <em data-outcome="quiet" />}
            </i>
          </button>
        );
      })}
      <p>
        <span data-outcome="verified">Verified</span>
        <span data-outcome="failed">Failed</span>
        <span data-outcome="waiting">Waiting on you</span>
        <span data-outcome="looked">Only looked</span>
      </p>
    </div>
  );
}

function ChangeNote({ changes }: { changes: Change[] }) {
  const first = changes[0];
  if (!first) return null;
  return (
    <p className="h2-change">
      <span>{first.label}</span>
      <del>{first.before ?? "Not previously recorded"}</del>
      <b aria-hidden="true">→</b>
      <ins>{first.after}</ins>
      {changes.length > 1 && <small>+{changes.length - 1} more</small>}
    </p>
  );
}

export function HistoryLightPrototype({
  now,
  chrome,
}: {
  now: number;
  chrome: PageChrome;
}) {
  const [ready, setReady] = useState(false);
  const [variant, setVariant] = useState<Variant>("A");
  const [state, setState] = useState<StateId>("paperless");
  const [filter, setFilter] = useState<Filter>("All");
  const [chronological, setChronological] = useState(false);
  const [changesOnly, setChangesOnly] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setVariant(wantedVariant(window.location.search) ?? "A");
      const wanted = params.get("state") as StateId | null;
      if (wanted && states.some((item) => item.id === wanted)) setState(wanted);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const write = (nextVariant: Variant, nextState: StateId) => {
    const url = new URL(window.location.href);
    url.searchParams.set("variant", nextVariant);
    url.searchParams.set("state", nextState);
    window.history.replaceState(window.history.state, "", url);
  };

  const timeline = useMemo(() => timelineFor(state, now), [state, now]);
  const projection = useMemo(() => projectTasks(timeline), [timeline]);
  const operations = useMemo(() => historyFromRecords(timeline), [timeline]);
  const runs = useMemo(
    () => runIndex(timeline.records, timeline.executions),
    [timeline],
  );
  const folded = useMemo(
    () => taskOperations({ operations, projection, runs }),
    [operations, projection, runs],
  );
  const allHistory = useMemo(
    () => buildHistory(operations, timeline.chats, "All"),
    [operations, timeline.chats],
  );
  const originalEntries = useMemo(
    () =>
      new Map(timelineEntries(allHistory).map((entry) => [entry.op.id, entry])),
    [allHistory],
  );
  const changedRuns = useMemo(
    () =>
      new Set(
        projection.tasks
          .filter((task) => task.outcome === "changed")
          .map((task) => task.id),
      ),
    [projection.tasks],
  );
  const changesByOperation = useMemo(() => {
    const map = new Map<string, Change[]>();
    for (const change of projection.changes) {
      if (!changedRuns.has(change.taskId)) continue;
      const id = `record:${change.recordId}`;
      map.set(id, [...(map.get(id) ?? []), change]);
    }
    return map;
  }, [projection.changes, changedRuns]);

  const shownOperations = useMemo(() => {
    if (variant === "A" && !chronological) return folded.operations;
    if (variant === "C" && changesOnly)
      return operations.filter(
        (operation) =>
          changedRuns.has(runs.get(operation.id) ?? "") ||
          ["failed", "proposed", "queued", "declined", "stopped"].includes(
            operation.state,
          ),
      );
    return operations;
  }, [
    variant,
    chronological,
    changesOnly,
    folded.operations,
    operations,
    changedRuns,
    runs,
  ]);

  const history = useMemo(
    () => buildHistory(shownOperations, timeline.chats, filter),
    [shownOperations, timeline.chats, filter],
  );

  const stubConversation = (chatId: string) =>
    setNotice(
      `Would open ${
        timeline.chats.find((chat) => chat.id === chatId)?.title ??
        "the conversation"
      }. It is invented for this prototype.`,
    );
  const stubDestination = (destination: ApplicationSection) =>
    setNotice(
      `Would open ${labelOf(destination)}. ` +
        "This prototype does not change the application.",
    );

  const feedLead =
    variant === "A" ? (
      <Lens
        pressed={!chronological}
        onPress={() => setChronological((value) => !value)}
      >
        Fold rows into Pi tasks
      </Lens>
    ) : variant === "B" ? (
      <WeekStrip history={allHistory} now={now} />
    ) : (
      <Lens
        pressed={changesOnly}
        onPress={() => setChangesOnly((value) => !value)}
      >
        Changes only
      </Lens>
    );

  return (
    <div
      className="ax-root h2-root"
      data-variant={`history-${variant.toLowerCase()}`}
      style={{ visibility: ready ? undefined : "hidden" }}
    >
      <TransitHistory
        history={history}
        filter={filter}
        onFilter={setFilter}
        now={now}
        head={
          <PageHead
            bar={chrome.bar}
            title="History"
            name={timeline.applicationName}
            openUrl={null}
            restricted={false}
          />
        }
        feedLead={feedLead}
        expandedDetailFor={
          variant === "A" && !chronological
            ? (operation) => {
                const ids = folded.children.get(operation.id) ?? [];
                const entries = ids
                  .map((id) => originalEntries.get(id))
                  .filter((entry): entry is Entry => Boolean(entry));
                return entries.length ? (
                  <TaskChildren
                    entries={entries}
                    onOpenConversation={stubConversation}
                    onOpenDestination={stubDestination}
                  />
                ) : null;
              }
            : undefined
        }
        decisionFor={
          variant === "C"
            ? (operation) => (
                <ChangeNote
                  changes={changesByOperation.get(operation.id) ?? []}
                />
              )
            : undefined
        }
        onOpenConversation={(chatId) => stubConversation(chatId)}
        onOpenDestination={stubDestination}
      />

      {notice && (
        <p className="h2-notice" role="status">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)}>
            Close
          </button>
        </p>
      )}

      <div
        className="ax-bar h2-bar"
        role="region"
        aria-label="Prototype controls"
      >
        <span className="ax-bar-tag">Prototype · invented data</span>
        <div className="ax-bar-variant">
          <button
            type="button"
            aria-label="Previous idea"
            onClick={() => {
              const index = VARIANTS.findIndex((item) => item.id === variant);
              const next =
                VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length];
              setVariant(next.id);
              setFilter("All");
              write(next.id, state);
            }}
          >
            <CaretLeft weight="bold" />
          </button>
          <span className="ax-bar-name">
            <b>{variant}</b>
            {VARIANTS.find((item) => item.id === variant)!.name}
          </span>
          <button
            type="button"
            aria-label="Next idea"
            onClick={() => {
              const index = VARIANTS.findIndex((item) => item.id === variant);
              const next = VARIANTS[(index + 1) % VARIANTS.length];
              setVariant(next.id);
              setFilter("All");
              write(next.id, state);
            }}
          >
            <CaretRight weight="bold" />
          </button>
        </div>
        <div className="ax-bar-scenarios" role="radiogroup" aria-label="State">
          {states.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={state === item.id}
              title={item.note}
              onClick={() => {
                setState(item.id);
                setFilter("All");
                setChronological(false);
                setChangesOnly(false);
                write(variant, item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="ax-bar-source is-invented">In memory</span>
      </div>
    </div>
  );
}
