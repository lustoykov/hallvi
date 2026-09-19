"use client";

// History, from records and executions.
//
// What happened to the application — not what ran.
//
// This listed every execution as its own top-level event, so one deployment
// filled the page with a dozen rows that each said a command had been run,
// and the owner's actual question — what happened to my application — was
// somewhere underneath them. The commands are still here; they are evidence
// on the event they produced rather than events of their own.
//
// The events that earn a row are the consequential ones: a release, a change
// in how the application can be reached, a backup or restore result, a
// credential change, and any failure. An inspection that found everything
// normal is not a thing that happened; it is Hallvi doing its job, and
// the destination pages already carry what it found.
//
// Failures are kept, not tidied away, because a page that shows only what
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
import { executionLine, plainText } from "./execution-text";
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
  // Two different facts. Declined means nothing ran; interrupted means
  // something was running and may have got part of the way, which is the
  // more important of the two to say out loud.
  declined: "declined",
  interrupted: "stopped",
};

/** A command's own name in a list of past work, by where it ran. */
function commandTitle(execution: ExecutionRecord) {
  return executionLine(execution, 90);
}

/**
 * Whether a record is a thing that happened, or a look at the world.
 *
 * Deliberately generous about failure: a failed inspection is a thing that
 * happened, because somebody has to know the check did not pass.
 */
function consequential(record: SavedInformation) {
  const content = record.presentation?.content?.kind;
  if (content === "deployment" || content === "application-access") return true;
  const status = record.presentation?.status;
  if (status === "failed" || status === "warning") return true;
  const subject = record.presentation?.states?.ref?.kind ?? "";
  return (
    subject === "backup-copy" ||
    subject === "restore-test" ||
    subject === "access" ||
    subject === "variable" ||
    subject === "domain" ||
    subject === "certificate"
  );
}

/**
 * The commands that ran in the ten minutes before a record was established.
 *
 * Adjacency, and the page says so. Nothing Pi writes links a command to the
 * record it produced, and a guess presented as a link would be a claim nobody
 * made. A minimal explicit association written at save time is the real
 * answer; until there is one, this is offered as "what ran around this".
 */
const NEAR_MS = 10 * 60_000;
function ranAround(at: string, executions: ExecutionRecord[]) {
  const when = Date.parse(at);
  if (!Number.isFinite(when)) return [];
  return executions
    .filter((execution) => (execution.output ?? "").trim())
    .filter((execution) => {
      const ran = Date.parse(execution.finishedAt ?? execution.createdAt);
      return Number.isFinite(ran) && ran <= when && when - ran < NEAR_MS;
    })
    .sort(
      (a, b) =>
        Date.parse(a.finishedAt ?? a.createdAt) -
        Date.parse(b.finishedAt ?? b.createdAt),
    );
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
    .filter(consequential)
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
        startedAt: record.establishedAt!,
        updatedAt: record.establishedAt!,
        summary: record.body,
        // Pi's own next step, where it wrote one.
        next: record.presentation?.nextStep,
        // A withdrawn observation stays visible and says so.
        evidence: record.retiredAt
          ? "Pi withdrew this observation."
          : undefined,
        // What ran around it, as its own steps rather than as its own rows.
        steps: ranAround(record.establishedAt!, executions).map(
          (execution) => ({
            label: commandTitle(execution),
            state:
              execution.status === "failed"
                ? ("failed" as const)
                : ("done" as const),
            at: execution.finishedAt ?? execution.createdAt,
          }),
        ),
      };
    });

  // The executions that still earn a row of their own. A command that
  // succeeded is evidence on the thing it produced; these four are not.
  // Waiting is something the reader has to do. Failed and interrupted went
  // wrong and may belong to no record at all — nothing gets written when
  // nothing was established. Declined is the owner's own decision, and a
  // history that drops those is a history of what Hallvi chose.
  const fromExecutions: ApplicationOperation[] = executions
    .filter(
      (execution) =>
        execution.status === "awaiting-approval" ||
        execution.status === "failed" ||
        execution.status === "interrupted" ||
        execution.status === "declined",
    )
    .map((execution) => ({
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
      startedAt: execution.createdAt,
      updatedAt: execution.finishedAt ?? execution.createdAt,
      summary:
        typeof execution.exitCode === "number"
          ? `Exit ${execution.exitCode}`
          : execution.target,
      approval:
        execution.status === "awaiting-approval"
          ? { note: plainText(execution.input).slice(0, 300), action: "Run it" }
          : undefined,
    }));

  return [...fromRecords, ...fromExecutions].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt),
  );
}
