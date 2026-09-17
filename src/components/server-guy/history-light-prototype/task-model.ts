// PROTOTYPE · prototype/history-tasks · throwaway.
//
// Records and executions, projected into tasks.
//
// A **task** is one piece of work: what it did to the application, who asked
// for it, and the commands it ran. The product already stores the two halves.
// An execution carries `runId`, which is one turn of Pi's, written by the
// executor. A record carries `evidence`, which names the executions it rests
// on and the message that asked for the work. Those two links are the whole
// projection; nothing here guesses.
//
// What this deliberately does not do is pair a record with a command because
// they happened close together. The shipped History has to, because Pi leaves
// `evidence` empty, and it says so on the page: "what ran around this". Every
// variant in this prototype needs the real link instead, so the fixture writes
// it. If a record arrives with no evidence it lands in its own task with no
// commands, which is the truthful answer rather than a plausible one.
//
// Three kinds of task come out of it:
//   asked         a message named a conversation
//   unasked       a run with no conversation behind it
//   unattributed  a command with no run at all
//
// "Automatic" is not one of them. Nothing in the record says a schedule
// started the work; all we know is that no conversation did.

import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";
import type { ChatSummary } from "@/server/types";

import {
  clip,
  commandOf,
  executionLine,
  placeOf,
  whereItRan,
} from "../execution-text";

export type Outcome =
  /** A change went through and something checked it. */
  | "changed"
  /** It was looked at and nothing was changed. */
  | "looked"
  /** It went wrong. */
  | "failed"
  /** Somebody was asked and said no. Nothing ran. */
  | "declined"
  /** Waiting on a person right now. */
  | "waiting";

export type Category = "version" | "access" | "data" | "configuration";

export interface Attribution {
  kind: "chat" | "unasked" | "unattributed";
  chatId: string | null;
  messageId: string | null;
  label: string;
  /** Said in full where a reader might otherwise assume a cause. */
  detail: string | null;
}

export interface Change {
  id: string;
  category: Category;
  /** The thing that changed, in the reader's words. */
  subject: string;
  label: string;
  before: string | null;
  after: string;
  at: string;
  taskId: string;
  recordId: string;
}

export interface Step {
  execution: ExecutionRecord;
  /** Which machine, in the product's own words. Null when it cannot say. */
  place: string | null;
  detail: string | null;
  line: string;
}

export interface Task {
  id: string;
  title: string;
  outcome: Outcome;
  /** One sentence: what this did to the application. */
  says: string;
  /** What has to happen next, where a record wrote one. */
  next: string | null;
  startedAt: string;
  endedAt: string;
  attribution: Attribution;
  records: SavedInformation[];
  /** The record the task is named after; the rest are beside it. */
  lead: SavedInformation | null;
  steps: Step[];
  changes: Change[];
  /** The destinations the records name. */
  destinations: string[];
  /** Every machine this task touched, deduplicated, in order. */
  places: string[];
}

export interface Projection {
  tasks: Task[];
  changes: Change[];
  /** Tasks that changed nothing, so a changes-first reading keeps them. */
  unchanged: Task[];
  counts: Record<Outcome, number>;
}

const CATEGORY_OF_SUBJECT: Record<string, Category> = {
  access: "access",
  door: "access",
  domain: "access",
  certificate: "access",
  firewall: "access",
  "backup-copy": "data",
  "restore-test": "data",
  volume: "data",
  database: "data",
  variable: "configuration",
  process: "configuration",
  monitor: "configuration",
  cache: "configuration",
  queue: "configuration",
  job: "configuration",
  host: "configuration",
};

export const CATEGORIES: { id: Category; label: string; says: string }[] = [
  {
    id: "version",
    label: "Version",
    says: "Which revision and which images are running",
  },
  { id: "access", label: "Access", says: "Who can reach it, and how" },
  {
    id: "data",
    label: "Data",
    says: "Copies of the data, and restores of them",
  },
  {
    id: "configuration",
    label: "Configuration",
    says: "Settings, processes and schedules around the application",
  },
];

function categoryOf(record: SavedInformation): Category | null {
  const content = record.presentation?.content?.kind;
  if (content === "deployment") return "version";
  if (content === "application-access") return "access";
  const subject = record.presentation?.states?.ref?.kind;
  return subject ? (CATEGORY_OF_SUBJECT[subject] ?? null) : null;
}

/** What a record's subject is called on screen: its own id, not its enum. */
function subjectName(record: SavedInformation): string {
  const ref = record.presentation?.states?.ref;
  if (ref) return ref.id;
  const content = record.presentation?.content;
  if (content?.kind === "deployment") return "the running release";
  if (content?.kind === "application-access") return "the way in";
  return record.title;
}

function outcomeOf(records: SavedInformation[], steps: Step[]): Outcome {
  if (steps.some((step) => step.execution.status === "awaiting-approval"))
    return "waiting";
  if (
    records.some((record) => record.presentation?.status === "failed") ||
    steps.some((step) => step.execution.status === "failed")
  )
    return "failed";
  if (
    steps.length > 0 &&
    steps.every((step) => step.execution.status === "declined")
  )
    return "declined";
  // Whether this changed the application is Pi's own word for the record, not
  // something to work out from its shape. `role: "outcome"` is a thing that
  // happened; `role: "status"` is the state of something, and reading a value
  // back off the host writes one of those without touching anything. Guessing
  // from `states` instead turned every read-back into a change.
  const changed = records.some(
    (record) => record.presentation?.role === "outcome",
  );
  return changed ? "changed" : "looked";
}

export const OUTCOMES: { id: Outcome; label: string }[] = [
  { id: "changed", label: "Changed something" },
  { id: "failed", label: "Went wrong" },
  { id: "waiting", label: "Waiting on you" },
  { id: "declined", label: "You said no" },
  { id: "looked", label: "Only looked" },
];

export function outcomeLabel(outcome: Outcome) {
  return OUTCOMES.find((item) => item.id === outcome)!.label;
}

/**
 * Every acting line of a command, for a task no record named. `essence` in
 * execution-text picks one line and this wants all of them, so the shell
 * preamble it skips is named here too rather than re-deriving it.
 */
const PREAMBLE = /^(#|set\s+[-+][a-zA-Z]|shopt\s|umask\s|cd\s|PS4=|IFS=)/;
function commandTitle(step: Step) {
  const lines = commandOf(step.execution.input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const acting = lines.filter((line) => !PREAMBLE.test(line));
  return clip((acting.length ? acting : lines).join(" ; "), 110);
}

function stepOf(execution: ExecutionRecord): Step {
  const where = whereItRan(execution);
  return {
    execution,
    place: where?.said ?? placeOf(execution.tool),
    detail: where?.detail ?? null,
    line: executionLine(execution, 110),
  };
}

/**
 * One sentence about what the task did, taken from a record where there is
 * one. A task with no record has only its commands, and says so rather than
 * describing them as an outcome.
 */
function saysOf(records: SavedInformation[], steps: Step[], outcome: Outcome) {
  const spoken = records.find((record) => record.body.trim());
  if (spoken) return spoken.body.trim();
  if (outcome === "waiting")
    return "Server Guy is waiting for you to approve this before it runs.";
  if (outcome === "declined")
    return "You were asked and said no, so this never ran.";
  if (steps.length === 1)
    return `One command ran and nothing was written about what it established.`;
  return `${steps.length} commands ran and nothing was written about what they established.`;
}

export function projectTasks({
  records,
  executions,
  chats,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
  chats: ChatSummary[];
}): Projection {
  const byExecution = new Map<string, ExecutionRecord>(
    executions.map((execution) => [execution.id, execution]),
  );
  // Which run a record belongs to, read from the executions it names.
  const runOfRecord = new Map<string, string>();
  const recordsOfRun = new Map<string, SavedInformation[]>();
  const loose: SavedInformation[] = [];
  for (const record of records) {
    const named = record.evidence
      .filter((item) => item.type === "execution")
      .map((item) => byExecution.get(item.id))
      .filter((execution): execution is ExecutionRecord => Boolean(execution));
    const run = named.find((execution) => execution.runId)?.runId;
    if (!run) {
      loose.push(record);
      continue;
    }
    runOfRecord.set(record.id, run);
    recordsOfRun.set(run, [...(recordsOfRun.get(run) ?? []), record]);
  }

  const runs = new Map<string, ExecutionRecord[]>();
  const orphans: ExecutionRecord[] = [];
  for (const execution of executions) {
    if (!execution.runId) orphans.push(execution);
    else
      runs.set(execution.runId, [
        ...(runs.get(execution.runId) ?? []),
        execution,
      ]);
  }

  const chatById = new Map(chats.map((item) => [item.id, item]));

  const build = (
    id: string,
    taskRecords: SavedInformation[],
    taskExecutions: ExecutionRecord[],
    attribution: Attribution,
  ): Task => {
    const steps = taskExecutions
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(stepOf);
    const outcome = outcomeOf(taskRecords, steps);
    const stamps = [
      ...steps.map((step) => step.execution.createdAt),
      ...taskRecords.map((record) => record.establishedAt ?? record.createdAt),
    ].toSorted();
    const ends = [
      ...steps.map(
        (step) => step.execution.finishedAt ?? step.execution.createdAt,
      ),
      ...taskRecords.map((record) => record.establishedAt ?? record.createdAt),
    ].toSorted();
    // The record the entry is named after: what happened, before what is so.
    // A run that wrote only observations is named after the last one, because
    // the last thing written in a turn is the conclusion. The others are still
    // listed; none of them is dropped.
    const settled = taskRecords.toSorted((a, b) =>
      (a.establishedAt ?? a.createdAt).localeCompare(
        b.establishedAt ?? b.createdAt,
      ),
    );
    const lead =
      settled.find((record) => record.presentation?.role === "outcome") ??
      settled.at(-1);
    const places: string[] = [];
    for (const step of steps)
      if (step.place && !places.includes(step.place)) places.push(step.place);
    return {
      id,
      // A task with no record has only its commands to be named after, and
      // the first line of a script is rarely what the script does: naming a
      // firewall change "apt-get update" is worse than saying nothing. So the
      // whole command goes in the title, preamble dropped, rather than one
      // line of it chosen as if it were the point.
      title:
        steps[0] && !lead
          ? commandTitle(steps[0])
          : (lead?.title ?? "A command"),
      outcome,
      says: saysOf(taskRecords, steps, outcome),
      next:
        taskRecords.find((record) => record.presentation?.nextStep)
          ?.presentation?.nextStep ?? null,
      startedAt: stamps[0] ?? new Date().toISOString(),
      endedAt: ends.at(-1) ?? stamps[0] ?? new Date().toISOString(),
      attribution,
      records: settled,
      lead: lead ?? null,
      steps,
      changes: [],
      destinations: [
        ...new Set(
          taskRecords.flatMap((record) => record.presentation?.views ?? []),
        ),
      ].filter((view) => view !== "history"),
      places,
    };
  };

  const tasks: Task[] = [];
  for (const [run, taskExecutions] of runs) {
    const taskRecords = recordsOfRun.get(run) ?? [];
    const chatId =
      taskExecutions.find((execution) => execution.chatId)?.chatId ?? "";
    const known = chatById.get(chatId);
    const messageId =
      taskRecords
        .flatMap((record) => record.evidence)
        .find((item) => item.type === "message")?.id ?? null;
    const attribution: Attribution = known
      ? {
          kind: "chat",
          chatId,
          messageId,
          label: known.title,
          detail: null,
        }
      : {
          kind: "unasked",
          chatId: null,
          messageId: null,
          label: "Not from a conversation",
          detail:
            "These commands ran as one piece of work, and no conversation is recorded for them.",
        };
    tasks.push(build(run, taskRecords, taskExecutions, attribution));
  }
  for (const execution of orphans)
    tasks.push(
      build(`execution:${execution.id}`, [], [execution], {
        kind: "unattributed",
        chatId: null,
        messageId: null,
        label: "Unattributed",
        detail:
          "This command has no run and no conversation on record. Nothing says who asked for it or why.",
      }),
    );
  for (const record of loose)
    tasks.push(
      build(`record:${record.id}`, [record], [], {
        kind: "unattributed",
        chatId: null,
        messageId: null,
        label: "Unattributed",
        detail:
          "This record names no command it rests on, so there is no evidence to open.",
      }),
    );

  tasks.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  // Before and after, from the record before this one about the same subject.
  // A subject nobody recorded earlier has no before, and the page says that
  // rather than showing the current value twice.
  const changes: Change[] = [];
  const dated = records
    .filter((record) => record.establishedAt)
    .toSorted((a, b) => a.establishedAt!.localeCompare(b.establishedAt!));
  const previous = new Map<string, SavedInformation>();
  for (const record of dated) {
    const category = categoryOf(record);
    const ref = record.presentation?.states?.ref;
    const key = ref
      ? `${ref.kind}:${ref.id}`
      : record.presentation?.content?.kind === "deployment"
        ? "release"
        : null;
    const earlier = key ? previous.get(key) : undefined;
    if (key) previous.set(key, record);
    if (!category || record.presentation?.status === "failed") continue;
    const facts = record.presentation?.facts ?? [];
    const interesting = facts.filter((fact) => fact.key);
    for (const fact of interesting) {
      const was = earlier?.presentation?.facts?.find(
        (item) => item.key === fact.key,
      );
      if (was && was.value === fact.value) continue;
      changes.push({
        id: `${record.id}:${fact.key}`,
        category,
        subject: subjectName(record),
        label: fact.label,
        before: was?.value ?? null,
        after: fact.value,
        at: record.establishedAt!,
        taskId: runOfRecord.get(record.id) ?? `record:${record.id}`,
        recordId: record.id,
      });
    }
  }
  const byTask = new Map<string, Change[]>();
  for (const change of changes)
    byTask.set(change.taskId, [...(byTask.get(change.taskId) ?? []), change]);
  for (const task of tasks) task.changes = byTask.get(task.id) ?? [];

  const counts = {
    changed: 0,
    looked: 0,
    failed: 0,
    declined: 0,
    waiting: 0,
  } as Record<Outcome, number>;
  for (const task of tasks) counts[task.outcome] += 1;

  return {
    tasks,
    changes: changes.toSorted((a, b) => b.at.localeCompare(a.at)),
    unchanged: tasks.filter((task) => task.changes.length === 0),
    counts,
  };
}

/** "Today", "Yesterday", or "Monday 14 Sep". */
export function dayName(at: string, now: number) {
  const day = (value: number) => {
    const date = new Date(value);
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    ).getTime();
  };
  const days = Math.round((day(Date.parse(at)) - day(now)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export const clockOf = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/** How long a command took, where both ends are on record. */
export function tookOf(execution: ExecutionRecord) {
  if (!execution.finishedAt) return null;
  const ms = Date.parse(execution.finishedAt) - Date.parse(execution.createdAt);
  if (!Number.isFinite(ms) || ms < 1000) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) return `${seconds}s`;
  return `${Math.round(seconds / 60)} min`;
}

/** Days, newest first, for a list that groups by the viewer's own day. */
export function byDay(tasks: Task[]) {
  const days: { key: string; at: string; tasks: Task[] }[] = [];
  for (const task of tasks) {
    const key = new Date(task.startedAt).toDateString();
    const last = days.at(-1);
    if (last?.key === key) last.tasks.push(task);
    else days.push({ key, at: task.startedAt, tasks: [task] });
  }
  return days;
}

/** "Today", "Yesterday", or "12 Sep" — for a column, not a heading. */
export function shortDay(at: string, now: number) {
  const name = dayName(at, now);
  if (name === "Today" || name === "Yesterday") return name;
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}
