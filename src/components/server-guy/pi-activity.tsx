"use client";

// What Pi did, between what Pi said.
//
// One compact row per tool call, in the order the runtime reported them. A row
// says what was called and how it ended; opening it shows the exact arguments
// and whatever came back, redacted before it was ever stored. Calls that
// already draw their own card — a command through the executor, a record shown
// in chat — are left to that card rather than shown twice.

import {
  CaretRight,
  Check,
  SpinnerGap,
  Warning,
  X,
} from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";

import type { ActivityRecord } from "@/server/pi-activity";
import { Markdown } from "./markdown";
import "./pi-activity.css";

/** True when this run's transcript already holds what Pi said. */
export function hasSpokenActivity(records: ActivityRecord[], runId: string) {
  return records.some(
    (record) => record.runId === runId && record.kind === "message",
  );
}

/** What a tool is doing, in the reader's words rather than its own. */
const verbs: Record<string, string> = {
  read_file: "Read",
  write_file: "Wrote",
  edit_file: "Edited",
  list_directory: "Listed",
  search_files: "Searched",
  glob: "Searched",
  grep: "Searched",
  workspace_bash: "Ran in the repository workspace",
  save_information: "Saved",
  search_information: "Searched saved information",
  retire_information: "Retired",
  get_application_status: "Read the application record",
};

function words(record: ActivityRecord) {
  const verb = verbs[record.tool];
  if (verb) return verb;
  // An unknown tool is named as the runtime named it, never guessed at.
  return record.tool.replaceAll("_", " ");
}

/** The one detail worth putting on the row: a path, a pattern, a command. */
function subject(record: ActivityRecord) {
  try {
    const args = JSON.parse(record.args) as Record<string, unknown>;
    for (const key of [
      "path",
      "file",
      "filePath",
      "pattern",
      "query",
      "command",
      "title",
    ]) {
      const value = args[key];
      if (typeof value === "string" && value.trim()) return value;
    }
  } catch {
    // Arguments that are not JSON are shown only in the opened row.
  }
  return null;
}

function duration(record: ActivityRecord) {
  if (!record.finishedAt) return null;
  const ms = Date.parse(record.finishedAt) - Date.parse(record.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function PiActivity({
  records,
  runId,
  renderExecution,
}: {
  records: ActivityRecord[];
  /** The assistant message these calls belong to. */
  runId: string;
  /**
   * Draws the executor card for a call that produced one. A call is matched
   * to its record by the id the runtime gave it, never by the tool's name, so
   * every executor-backed tool shows exactly one card — and that card is what
   * knows waiting, declined, running and failed.
   */
  renderExecution?: (executionId: string) => ReactNode;
}) {
  const mine = records
    .filter((record) => record.runId === runId)
    .sort((a, b) => a.sequence - b.sequence);
  if (!mine.length) return null;
  return (
    <ol className="sg-activity" aria-label="What Pi did">
      {mine.map((record) =>
        record.kind === "message" ? (
          <li className="sg-activity-said" key={record.id}>
            <Markdown source={record.text ?? ""} />
          </li>
        ) : record.executionId ? (
          <li className="sg-activity-card" key={record.id}>
            {renderExecution?.(record.executionId)}
          </li>
        ) : (
          <ActivityRow key={record.id} record={record} />
        ),
      )}
    </ol>
  );
}

function ActivityRow({ record }: { record: ActivityRecord }) {
  const [open, setOpen] = useState(false);
  const detail = subject(record);
  const took = duration(record);
  const shown = record.status === "running" ? record.preview : record.result;
  return (
    <li className="sg-activity-item" data-status={record.status}>
      <button
        type="button"
        className="sg-activity-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <CaretRight
          weight="bold"
          aria-hidden="true"
          className="sg-activity-caret"
        />
        <span className="sg-activity-what">
          {words(record)}
          {detail && <code>{detail}</code>}
        </span>
        <span className="sg-activity-state">
          {record.status === "running" ? (
            <>
              <SpinnerGap
                weight="bold"
                aria-hidden="true"
                className="sg-activity-spin"
              />
              Running
            </>
          ) : record.status === "failed" ? (
            <>
              <Warning weight="bold" aria-hidden="true" />
              Failed
            </>
          ) : record.status === "interrupted" ? (
            <>
              <Warning weight="bold" aria-hidden="true" />
              Stopped
            </>
          ) : (
            <>
              <Check weight="bold" aria-hidden="true" />
              Done
            </>
          )}
          {took && <em>{took}</em>}
        </span>
      </button>
      {open && (
        <div className="sg-activity-detail">
          <h4>What Pi passed</h4>
          <pre>{record.args || "Nothing recorded."}</pre>
          <h4>
            {record.status === "running"
              ? "What has come back so far"
              : "What came back"}
          </h4>
          <pre>
            {shown ||
              (record.status === "running"
                ? "Nothing yet."
                : "Nothing was recorded for this call.")}
          </pre>
          {record.truncated && (
            <p className="sg-activity-cut">
              <X weight="bold" aria-hidden="true" />
              This was longer than Server Guy keeps; what is shown was cut.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
