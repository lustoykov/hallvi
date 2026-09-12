"use client";

// What Pi did, between what Pi said.
//
// Work is quiet by default: a run of reads and searches collapses to one line
// you can open, a finished command is a line like any other, and only
// something that wants you — an approval, a command still producing output —
// takes the room of a card. Nothing here is boxed or tinted; the reading order
// is the conversation's, and the detail waits until it is asked for.

import {
  CaretRight,
  FileText,
  FloppyDisk,
  MagnifyingGlass,
  PencilSimple,
  SpinnerGap,
  Terminal,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { ExecutionRecord } from "@/server/operator-execution";
import type { ActivityRecord } from "@/server/pi-activity";
import { Markdown } from "./markdown";
import "./pi-activity.css";

/** True when this run has anything in the transcript at all. */
export function hasActivity(records: ActivityRecord[], runId: string) {
  return records.some((record) => record.runId === runId);
}

type Kind = "read" | "search" | "ran" | "wrote" | "saved";

const kinds: { test: RegExp; kind: Kind; verb: string }[] = [
  { test: /^(read|read_file|cat)$/, kind: "read", verb: "Read" },
  { test: /^(ls|list_directory)$/, kind: "read", verb: "Listed" },
  {
    test: /^(grep|find|search|search_information)$/,
    kind: "search",
    verb: "Searched",
  },
  { test: /^(write|write_file)$/, kind: "wrote", verb: "Wrote" },
  { test: /^(edit|edit_file)$/, kind: "wrote", verb: "Edited" },
  { test: /^(bash|powershell|server_bash)$/, kind: "ran", verb: "Ran" },
  { test: /^save_information$/, kind: "saved", verb: "Saved" },
  { test: /^retire_information$/, kind: "saved", verb: "Retired" },
];

const icons: Record<Kind, typeof FileText> = {
  read: FileText,
  search: MagnifyingGlass,
  ran: Terminal,
  wrote: PencilSimple,
  saved: FloppyDisk,
};

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

/** "Read files, ran commands" — what a run of quiet calls amounts to. */
function summarise(records: ActivityRecord[]) {
  const order: Kind[] = ["read", "search", "ran", "wrote", "saved"];
  const words: Record<Kind, string> = {
    read: "read files",
    search: "searched",
    ran: "ran commands",
    wrote: "edited files",
    saved: "saved records",
  };
  const present = order.filter((kind) =>
    records.some((record) => describe(record).kind === kind),
  );
  const phrase = present.map((kind) => words[kind]).join(", ");
  return phrase ? phrase[0].toUpperCase() + phrase.slice(1) : "Worked";
}

type Item =
  | { type: "said"; record: ActivityRecord }
  | { type: "card"; record: ActivityRecord }
  | { type: "quiet"; records: ActivityRecord[] };

/** Messages stay separate; runs of quiet calls gather behind one line. */
function arrange(records: ActivityRecord[], noisy: (id: string) => boolean) {
  const items: Item[] = [];
  for (const record of records) {
    if (record.kind === "message") {
      items.push({ type: "said", record });
      continue;
    }
    if (record.executionId && noisy(record.executionId)) {
      items.push({ type: "card", record });
      continue;
    }
    const last = items.at(-1);
    if (last?.type === "quiet") last.records.push(record);
    else items.push({ type: "quiet", records: [record] });
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
  const mine = records
    .filter((record) => record.runId === runId)
    .sort((a, b) => a.sequence - b.sequence);
  // Between a message ending and the next starting, the draft still holds the
  // text that has just become the last item; showing both would say it twice.
  const said = mine.filter((record) => record.kind === "message").at(-1)?.text;
  const tail = live?.trim() && live.trim() !== said?.trim() ? live : null;
  if (!mine.length && !tail) return null;

  // A command that wants a decision, or is still producing output, earns the
  // room of a card. One that has finished is a line like any other.
  const noisy = (executionId: string) => {
    const execution = executions?.find((item) => item.id === executionId);
    return (
      !execution ||
      execution.status === "awaiting-approval" ||
      execution.status === "running"
    );
  };

  return (
    <div className="sg-did" aria-label="What Pi did">
      {arrange(mine, noisy).map((item, index) =>
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
            key={`quiet-${index}`}
            records={item.records}
            executions={executions}
            renderExecution={renderExecution}
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

/** A run of calls that finished quietly, behind one line. */
function Quiet({
  records,
  executions,
  renderExecution,
}: {
  records: ActivityRecord[];
  executions?: ExecutionRecord[];
  renderExecution?: (executionId: string) => ReactNode;
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
  return (
    <div className="sg-did-quiet" data-open={open || undefined}>
      <button
        type="button"
        className="sg-did-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CaretRight weight="bold" aria-hidden="true" />
        <span>{summarise(records)}</span>
        <em>
          {records.length}
          {working ? (
            <>
              {" · "}
              <SpinnerGap
                weight="bold"
                aria-hidden="true"
                className="sg-did-spin"
              />
              working
            </>
          ) : wrong ? (
            ` · ${wrong}`
          ) : (
            ""
          )}
        </em>
      </button>
      {open && (
        <ol className="sg-did-rows">
          {records.map((record) => (
            <Row
              key={record.id}
              record={record}
              executions={executions}
              renderExecution={renderExecution}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function Row({
  record,
  executions,
  renderExecution,
}: {
  record: ActivityRecord;
  executions?: ExecutionRecord[];
  renderExecution?: (executionId: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { kind, verb } = describe(record);
  const Icon = icons[kind];
  const detail = subject(record);
  const execution = record.executionId
    ? executions?.find((item) => item.id === record.executionId)
    : undefined;
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
          {execution && renderExecution ? (
            renderExecution(execution.id)
          ) : (
            <>
              <pre>{record.args || "Nothing recorded."}</pre>
              <pre data-wrong={wrong || undefined}>
                {shown ||
                  (record.status === "running"
                    ? "Nothing yet."
                    : "Nothing was recorded for this call.")}
              </pre>
              {record.truncated && (
                <p>Longer than Server Guy keeps; what is shown was cut.</p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
