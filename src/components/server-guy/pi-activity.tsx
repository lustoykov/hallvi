"use client";

// What Pi did, between what Pi said.
//
// Work is quiet by default: a run of calls collapses to one line you can open,
// and inside it each call is a line of its own. Nothing here is boxed or
// tinted; the reading order is the conversation's, and the detail waits until
// it is asked for.
//
// Three things a reader needs and the runtime alone will not say:
//
//   Where it happened. Pi works in three places — your server, a throwaway
//   copy of your repository, and Server Guy's own records — and only the tool
//   name distinguishes them. A group states its place, and a group never
//   mixes two, so "read the repository, then ran this on the server" is
//   legible without opening anything.
//
//   What deserves the room of a card. Only a call that wants you, or one
//   whose output you could still be reading, and once earned it is kept: a
//   card that appeared for a moment and vanished reads as a glitch, and one
//   that collapses on finishing takes the output away mid-read.
//
//   What a finished call actually said. That is this component's own quiet
//   disclosure, not a second copy of the execution card.

import {
  CaretRight,
  FileText,
  FloppyDisk,
  Globe,
  MagnifyingGlass,
  PencilSimple,
  Question,
  SpinnerGap,
  Terminal,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";
import { placeOf as placeOfTool, plainText } from "./execution-text";
import { Markdown } from "./markdown";
import "./pi-activity.css";

/** True when this run has anything in the transcript at all. */
export function hasActivity(records: ActivityRecord[], runId: string) {
  return records.some((record) => record.runId === runId);
}

type Kind = "read" | "search" | "ran" | "wrote" | "saved" | "called" | "asked";

// Every tool Pi has, named the way a reader would name it. An unmapped tool
// keeps its own name rather than being dressed as something it is not.
const kinds: { test: RegExp; kind: Kind; verb: string }[] = [
  { test: /^(read|read_file|cat)$/, kind: "read", verb: "Read" },
  { test: /^(ls|list_directory)$/, kind: "read", verb: "Listed" },
  { test: /^(grep|find|glob|search)$/, kind: "search", verb: "Searched" },
  {
    test: /^search_information$/,
    kind: "search",
    verb: "Searched records for",
  },
  { test: /^(write|write_file)$/, kind: "wrote", verb: "Wrote" },
  { test: /^(edit|edit_file|multi_edit)$/, kind: "wrote", verb: "Edited" },
  { test: /^(bash|powershell|server_bash)$/, kind: "ran", verb: "Command" },
  { test: /^save_information$/, kind: "saved", verb: "Saved" },
  { test: /^retire_information$/, kind: "saved", verb: "Retired" },
  {
    test: /^get_application_status$/,
    kind: "read",
    verb: "Read the application record",
  },
  { test: /^hetzner_request$/, kind: "called", verb: "Called" },
  { test: /^open_server_port$/, kind: "called", verb: "Opened a tunnel to" },
  {
    test: /^connect_server$/,
    kind: "saved",
    verb: "Saved the server connection",
  },
  { test: /^server_public_key$/, kind: "read", verb: "Read the managed key" },
  { test: /^request_approval$/, kind: "asked", verb: "Asked you about" },
];

const icons: Record<Kind, typeof FileText> = {
  read: FileText,
  search: MagnifyingGlass,
  ran: Terminal,
  wrote: PencilSimple,
  saved: FloppyDisk,
  called: Globe,
  asked: Question,
};

/**
 * The machine a call touched. Two of these look identical on a row — `bash`
 * runs in the repository copy and `server_bash` runs on the deployed host —
 * so the place is never left to be inferred from the command.
 */
/** The phrase itself is the identity now: same words, same group. */
type Place = string;

/**
 * Where a call acted, read from the one table the console reads.
 *
 * This file used to carry its own list of tools and its own word for each
 * place, so the same call said "on your server" here and "On the server" on
 * the execution card beside it. One table, one answer, lowercased for use
 * inside a sentence.
 */
function placeOf(record: ActivityRecord) {
  const said = placeOfTool(record.tool);
  if (!said) return null;
  return said.charAt(0).toLowerCase() + said.slice(1);
}

/** "root@46.62.253.6:22" — the reader wants the host, not the login. */
function hostOf(target: string | undefined) {
  if (!target) return null;
  const host = target.split("@").at(-1)?.split(":")[0]?.trim();
  return host || null;
}

/** How a call is named and grouped; an unknown tool keeps its own name. */
function describe(record: ActivityRecord) {
  const match = kinds.find((entry) => entry.test.test(record.tool));
  return {
    kind: match?.kind ?? ("ran" as Kind),
    verb: match?.verb ?? record.tool.replaceAll("_", " "),
  };
}

/** The one detail worth putting on a row: a path, a pattern, a command. */
function subject(record: ActivityRecord) {
  try {
    const args = JSON.parse(record.args) as Record<string, unknown>;
    for (const key of [
      "command",
      "path",
      "file",
      "filePath",
      "pattern",
      "query",
      "title",
    ]) {
      const value = args[key];
      if (typeof value === "string" && value.trim())
        return value.replace(/\s+/g, " ").trim();
    }
  } catch {
    // Arguments that are not JSON are shown only in the opened row.
  }
  return null;
}

function duration(record: { startedAt: string; finishedAt?: string }) {
  if (!record.finishedAt) return null;
  const ms = Date.parse(record.finishedAt) - Date.parse(record.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * "Two file reads and a command" — what a run of quiet calls amounts to.
 *
 * Count-aware and written as a phrase, because the old form put the noun in
 * the label and the number in a separate column at the far end of the row
 * ("Commands · 1"), so a reader assembled the sentence themselves. Past three
 * kinds it stops listing and says how many calls there were; the row opens.
 */
function summarise(records: ActivityRecord[]) {
  const order: Kind[] = [
    "read",
    "search",
    "ran",
    "wrote",
    "saved",
    "called",
    "asked",
  ];
  const words: Record<Kind, [string, string]> = {
    read: ["file read", "file reads"],
    search: ["search", "searches"],
    ran: ["command", "commands"],
    wrote: ["file change", "file changes"],
    saved: ["record", "records"],
    called: ["request", "requests"],
    asked: ["approval", "approvals"],
  };
  const counts = order
    .map((kind) => ({
      kind,
      n: records.filter((record) => describe(record).kind === kind).length,
    }))
    .filter((entry) => entry.n > 0);
  if (!counts.length) return "Worked";
  if (counts.length > 3) return `${records.length} calls`;
  const said = counts.map(
    ({ kind, n }) => `${n} ${words[kind][n === 1 ? 0 : 1]}`,
  );
  const phrase =
    said.length === 1
      ? said[0]
      : `${said.slice(0, -1).join(", ")} and ${said.at(-1)}`;
  return phrase[0].toUpperCase() + phrase.slice(1);
}

/** What became of one call, for a mark that can be seen without reading. */
function outcomeOf(record: ActivityRecord) {
  if (record.status === "failed") return "failed";
  if (record.status === "declined") return "declined";
  if (record.status === "interrupted") return "stopped";
  if (record.status === "running") return "running";
  return "done";
}

type Item =
  | { type: "said"; record: ActivityRecord }
  | { type: "card"; record: ActivityRecord }
  | { type: "quiet"; place: Place | null; records: ActivityRecord[] };

/**
 * Messages stay separate; runs of quiet calls gather behind one line — but
 * only while the place holds, because a group that spans two machines cannot
 * honestly name either.
 */
function arrange(records: ActivityRecord[], card: (id: string) => boolean) {
  const items: Item[] = [];
  for (const record of records) {
    if (record.kind === "message") {
      items.push({ type: "said", record });
      continue;
    }
    if (record.executionId && card(record.executionId)) {
      items.push({ type: "card", record });
      continue;
    }
    const place = placeOf(record);
    const last = items.at(-1);
    if (last?.type === "quiet" && last.place === place)
      last.records.push(record);
    else items.push({ type: "quiet", place, records: [record] });
  }
  return items;
}

export function PiActivity({
  records,
  executions,
  runId,
  live,
  renderExecution,
}: {
  records: ActivityRecord[];
  executions?: ExecutionRecord[];
  /** The assistant message these calls belong to. */
  runId: string;
  /** What Pi is writing right now, drawn at the end where it happens. */
  live?: string | null;
  renderExecution?: (executionId: string) => ReactNode;
}) {
  // Executions that have earned a card keep it. Remembering is what stops a
  // fast command flashing one open and shut, and stops a finished one
  // snatching its output back into a closed row.
  const kept = useRef(new Set<string>());
  const mine = records
    .filter((record) => record.runId === runId)
    .sort((a, b) => a.sequence - b.sequence);
  // Between a message ending and the next starting, the draft still holds the
  // text that has just become the last item; showing both would say it twice.
  const said = mine.filter((record) => record.kind === "message").at(-1)?.text;
  const tail = live?.trim() && live.trim() !== said?.trim() ? live : null;

  // A call that wants a decision earns the room of a card at once. A call
  // that is merely running earns one only when there is output to watch:
  // anything quick is over before a reader could have read it.
  const cards = new Set<string>();
  for (const record of mine) {
    if (record.kind !== "tool" || !record.executionId) continue;
    const execution = executions?.find(
      (item) => item.id === record.executionId,
    );
    const watchable =
      !execution ||
      execution.status === "awaiting-approval" ||
      (execution.status === "running" &&
        Boolean(record.preview.trim() || execution.output.trim()));
    if (watchable || kept.current.has(record.executionId))
      cards.add(record.executionId);
  }
  useEffect(() => {
    for (const id of cards) kept.current.add(id);
  });

  if (!mine.length && !tail) return null;
  return (
    <div className="sg-did" aria-label="What Pi did">
      {arrange(mine, (id) => cards.has(id)).map((item) =>
        item.type === "said" ? (
          <div className="sg-did-said" key={item.record.id}>
            <Markdown source={item.record.text ?? ""} />
          </div>
        ) : item.type === "card" ? (
          <div className="sg-did-card" key={item.record.id}>
            {renderExecution?.(item.record.executionId as string)}
          </div>
        ) : (
          <Quiet
            // Keyed by the first call in it, not by position: while Pi is
            // working new items arrive and every index shifts, which would
            // remount the group and snap it shut under the reader.
            key={`quiet-${item.records[0].id}`}
            place={item.place}
            records={item.records}
            executions={executions}
          />
        ),
      )}
      {tail && (
        <div className="sg-did-said" data-live="">
          <Markdown source={tail} />
        </div>
      )}
    </div>
  );
}

/** A run of calls in one place, behind one line. */
function Quiet({
  place,
  records,
  executions,
}: {
  place: Place | null;
  records: ActivityRecord[];
  executions?: ExecutionRecord[];
}) {
  const [open, setOpen] = useState(false);
  const working = records.some((record) => record.status === "running");
  // A refusal is not a failure, and a stop is not either; say which it was.
  const count = (status: string) =>
    records.filter((record) => record.status === status).length;
  const wrong = count("failed")
    ? `${count("failed")} failed`
    : count("declined")
      ? `${count("declined")} not run`
      : count("interrupted")
        ? `${count("interrupted")} stopped`
        : "";
  // One machine named once. Several, and the rows carry their own targets.
  const hosts = new Set(
    records
      .map((record) =>
        hostOf(
          executions?.find((item) => item.id === record.executionId)?.target,
        ),
      )
      .filter((host): host is string => host !== null),
  );
  const host = hosts.size === 1 ? [...hosts][0] : null;
  // The row a failure used to hide in looked exactly like the five beside it,
  // and "1 · 1 failed" in the same grey as the count is not a way of telling
  // somebody something went wrong. The marks and the tone say it while the
  // group is still closed — opening five historical groups on load would bury
  // the conversation under its own machinery, which is the other half of the
  // same problem.
  const failed = count("failed") > 0;
  return (
    <div
      className="sg-did-quiet"
      data-open={open || undefined}
      data-wrong={failed || undefined}
    >
      <button
        type="button"
        className="sg-did-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CaretRight weight="bold" aria-hidden="true" />
        <span>{summarise(records)}</span>
        {place && (
          <span className="sg-did-where">
            {place}
            {host && <code>{host}</code>}
          </span>
        )}
        {/* One mark per call, in order. Six green ticks and one red is a
            shape; "7 · 1 failed" is a sentence you have to finish reading. */}
        <span className="sg-did-marks" aria-hidden="true">
          {records.slice(0, 12).map((record) => (
            <i key={record.id} data-outcome={outcomeOf(record)} />
          ))}
          {records.length > 12 && <b>+{records.length - 12}</b>}
        </span>
        {/* Without this the overflow count and the outcome run together:
            "+1" beside "2 failed" reads as twelve failures. */}
        <span className="sg-did-gap" aria-hidden="true" />
        <em>
          {working ? (
            <>
              <SpinnerGap
                weight="bold"
                aria-hidden="true"
                className="sg-did-spin"
              />
              working
            </>
          ) : wrong ? (
            // A decline is the reader's own decision and a stop is their
            // interruption; neither is an error, and colouring them like one
            // would teach them to distrust the colour.
            <span
              className="sg-did-wrong"
              data-tone={count("failed") ? "failed" : "chosen"}
            >
              {wrong}
            </span>
          ) : (
            ""
          )}
        </em>
      </button>
      {open && (
        <ol className="sg-did-rows">
          {records.map((record) => (
            <Row key={record.id} record={record} />
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({ record }: { record: ActivityRecord }) {
  const [open, setOpen] = useState(false);
  const { kind, verb } = describe(record);
  const Icon = icons[kind];
  const detail = subject(record);
  const took = duration(record);
  const shown = record.status === "running" ? record.preview : record.result;
  const wrong = ["failed", "declined", "interrupted"].includes(record.status);
  return (
    <li className="sg-did-item" data-status={record.status}>
      <button
        type="button"
        className="sg-did-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon weight="regular" aria-hidden="true" />
        <span className="sg-did-verb">{verb}</span>
        {detail && <span className="sg-did-subject">{detail}</span>}
        <span className="sg-did-state">
          {record.status === "running" ? (
            <>
              <SpinnerGap
                weight="bold"
                aria-hidden="true"
                className="sg-did-spin"
              />
              working
            </>
          ) : record.status === "declined" ? (
            "not run"
          ) : record.status === "interrupted" ? (
            "stopped"
          ) : record.status === "failed" ? (
            "failed"
          ) : (
            (took ?? "")
          )}
        </span>
      </button>
      {open && (
        <div className="sg-did-detail">
          <pre>{plainText(record.args) || "Nothing recorded."}</pre>
          <pre data-wrong={wrong || undefined}>
            {plainText(shown) ||
              (record.status === "running"
                ? "Nothing yet."
                : "Nothing was recorded for this call.")}
          </pre>
          {record.truncated && (
            <p>Longer than Server Guy keeps; what is shown was cut.</p>
          )}
        </div>
      )}
    </li>
  );
}
