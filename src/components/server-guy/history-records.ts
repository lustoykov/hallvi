"use client";

// History, from records and executions.
//
// Two kinds of thing happened: Pi established something, and the controller
// ran something. Both are events with a time, and History is those events in
// order — failures kept, not tidied away, because a page that shows only what
// worked is not a history.
//
// The accepted design reads `ApplicationOperation`, whose own comment calls it
// "the durable record this operation is projected from". So that is what this
// does: projects records and executions into it, leaving the design alone.
//
// Failure-and-repair pairing (`resolves`) stays deferred: nothing Pi writes
// says which later work addressed an earlier failure, and guessing from
// adjacency would put a claim on the page that nobody made.

import type { ApplicationOperation } from "@/server/operation-record";
import type { ExecutionRecord } from "@/server/operator-execution";
import type { SavedInformation } from "@/server/operator-data";

import type { ApplicationSection } from "./application-sections";

/** What kind of event a record is: a change to the world, or a look at it. */
function kindOf(record: SavedInformation): ApplicationOperation["kind"] {
  const content = record.presentation?.content?.kind;
  return content === "deployment" || content === "application-access"
    ? "change"
    : "inspection";
}

function stateOf(record: SavedInformation): ApplicationOperation["state"] {
  const status = record.presentation?.status;
  if (status === "failed") return "failed";
  if (status === "verified") return "verified";
  return "inspected";
}

const executionState: Record<
  ExecutionRecord["status"],
  ApplicationOperation["state"]
> = {
  "awaiting-approval": "proposed",
  running: "working",
  succeeded: "verified",
  failed: "failed",
  declined: "cancelled",
  interrupted: "cancelled",
};

/** A command's own name in a list of past work, by where it ran. */
function commandTitle(execution: ExecutionRecord) {
  const first = execution.input.split("\n")[0].trim().slice(0, 90);
  switch (execution.tool) {
    case "server_bash":
      return `On the server · ${first}`;
    case "request_approval":
      return `Your decision · ${first}`;
    case "bash":
    case "powershell":
      return `In the repository copy · ${first}`;
    case "hetzner_request":
      return `Asked the provider · ${first}`;
    default:
      return `${execution.tool.replaceAll("_", " ")} · ${first}`;
  }
}

export function historyFromRecords({
  records,
  executions,
}: {
  records: SavedInformation[];
  executions: ExecutionRecord[];
}): ApplicationOperation[] {
  const fromRecords: ApplicationOperation[] = records
    // A record that established nothing has no place on a timeline: it would
    // be dated to the moment someone wrote it rather than to an event.
    .filter((record) => record.establishedAt)
    .map((record) => {
      return {
        id: `record:${record.id}`,
        source: { type: "inspection" as const, id: record.id },
        kind: kindOf(record),
        title: record.title,
        state: stateOf(record),
        destinations: (record.presentation?.views ??
          []) as ApplicationSection[],
        // Saved information retains the source message id, but not its chat
        // id. Until the projection receives a resolvable pair, rendering a
        // conversation action would send the reader to an empty chat id.
        origin: null,
        mentions: [],
        startedAt: record.establishedAt!,
        updatedAt: record.establishedAt!,
        summary: record.body,
        // Pi's own next step, where it wrote one.
        next: record.presentation?.nextStep,
        // A withdrawn observation stays visible and says so.
        evidence: record.retiredAt
          ? "Pi withdrew this observation."
          : undefined,
      };
    });

  const fromExecutions: ApplicationOperation[] = executions.map(
    (execution) => ({
      id: `execution:${execution.id}`,
      source: { type: "check" as const, id: execution.id },
      kind:
        execution.tool === "server_bash" || execution.tool === "bash"
          ? "change"
          : "inspection",
      title: commandTitle(execution),
      state: executionState[execution.status] ?? "inspected",
      destinations: ["logs"] as ApplicationSection[],
      origin: { chatId: execution.chatId, messageId: execution.runId },
      mentions: [],
      startedAt: execution.createdAt,
      updatedAt: execution.finishedAt ?? execution.createdAt,
      summary:
        typeof execution.exitCode === "number"
          ? `Exit ${execution.exitCode}`
          : execution.target,
      approval:
        execution.status === "awaiting-approval"
          ? { note: execution.input.slice(0, 300), action: "Run it" }
          : undefined,
    }),
  );

  return [...fromRecords, ...fromExecutions].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}
