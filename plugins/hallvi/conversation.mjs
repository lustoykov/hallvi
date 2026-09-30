// The main conversation, small enough for a panel. The controller's snapshot
// is the page's whole transcript (often megabytes); this keeps the latest
// turns, what each reply did and said, and nothing the page would not show.
// It reads what Pi and the executor recorded. It never judges success.
import { createHash } from "node:crypto";
import {
  clip,
  commandOf,
  essence,
  hostOf,
  intentOf,
  placeOf,
} from "../../src/components/hallvi/execution-text.ts";

const STEPS = 30;
// Excerpts only: a step opens in full through hallvi_inspect's execution_id.
const OUTPUT = 600;
const LIVE_OUTPUT = 1_500;
const COMMAND = 400;
const BODY = 12_000;
const REQUEST = 2_000;

/** Keep the end of a long text, where commands put their result. */
const tail = (text, limit) =>
  text.length > limit ? `…${text.slice(-limit)}` : text;
const head = (text, limit) =>
  text.length > limit ? `${text.slice(0, limit)}…` : text;

/** What a call printed or returned, without its JSON envelope. */
function outputOf(text) {
  const trimmed = (text ?? "").trim();
  if (trimmed[0] !== "{") return trimmed;
  try {
    const value = JSON.parse(trimmed);
    for (const key of ["output", "stdout", "result", "error"])
      if (typeof value?.[key] === "string" && value[key].trim())
        return value[key].trim();
  } catch {
    // Output cut at a storage limit; show it as recorded.
  }
  return trimmed;
}

/** One call Pi made, as a row a person can scan and open. */
function step(record, execution) {
  if (record.kind === "message")
    return {
      id: record.id,
      kind: "said",
      text: head(record.text ?? "", 3_000),
      at: record.startedAt,
    };
  const input = execution?.input ?? record.args ?? "";
  const intent = intentOf(input);
  const command = commandOf(input);
  const status =
    execution?.status === "awaiting-approval"
      ? "awaiting-approval"
      : record.status;
  const running = status === "running";
  const output = outputOf(
    running ? record.preview || execution?.output : record.result,
  );
  return {
    id: record.id,
    kind: "tool",
    tool: record.tool,
    title: intent
      ? clip(intent, 120)
      : clip(essence(command), 120) || record.tool.replaceAll("_", " "),
    place: placeOf(record.tool),
    host: execution ? hostOf(execution.target) : null,
    command: tail(command, COMMAND),
    status,
    exitCode: execution?.exitCode ?? null,
    executionId: record.executionId ?? execution?.id ?? null,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt ?? null,
    outputAt: execution?.outputAt ?? null,
    output: tail(output, running ? LIVE_OUTPUT : OUTPUT),
  };
}

function record(information) {
  const presentation = information.presentation ?? {};
  const checks = presentation.checks ?? [];
  const count = (status) =>
    checks.filter((check) => check.status === status).length;
  return {
    id: information.id,
    title: information.title,
    status: presentation.status ?? null,
    role: presentation.role ?? null,
    establishedAt: information.establishedAt ?? null,
    retired: Boolean(information.retiredAt),
    checks: {
      passed: count("passed"),
      failed: count("failed"),
      total: checks.length,
    },
    nextStep: presentation.nextStep ?? null,
  };
}

function reply(message, activity, executions, information) {
  const records = activity.filter((item) => item.runId === message.id);
  const said = records.at(-1);
  // The final words are the reply's body; they are not a step as well.
  const steps = (
    said?.kind === "message" && said.text?.trim() === message.body?.trim()
      ? records.slice(0, -1)
      : records
  ).map((item) =>
    step(item, item.executionId && executions.get(item.executionId)),
  );
  // Commands waiting on the owner that Pi's history has not written yet.
  for (const execution of executions.values())
    if (
      execution.runId === message.id &&
      execution.status === "awaiting-approval" &&
      !records.some((item) => item.executionId === execution.id)
    )
      steps.push(
        step(
          {
            id: execution.toolCallId ?? execution.id,
            kind: "tool",
            tool: execution.tool,
            status: "running",
            startedAt: execution.createdAt,
            executionId: execution.id,
          },
          execution,
        ),
      );
  const body = message.body ?? "";
  return {
    id: message.id,
    status: message.status,
    startedAt: message.startedAt ?? message.createdAt,
    finishedAt: message.finishedAt ?? null,
    body: head(body, BODY),
    bodyTruncated: body.length > BODY,
    error: message.error ? head(String(message.error), 2_000) : null,
    steps: steps.slice(-STEPS),
    stepsOmitted: Math.max(0, steps.length - STEPS),
    records: [
      ...new Set(
        (message.blocks ?? [])
          .filter((block) => block.type === "saved-information")
          .map((block) => block.id),
      ),
    ]
      .map((id) => information.get(id))
      .filter(Boolean)
      .map(record),
  };
}

/**
 * The latest turns of a chat snapshot: each of the owner's messages with the
 * reply that answered it. A revision lets a follower skip what it has seen.
 */
export function projectConversation(snapshot, { turns: limit = 6 } = {}) {
  const information = new Map(
    (snapshot.information ?? []).map((item) => [item.id, item]),
  );
  const executions = new Map(
    (snapshot.executions ?? []).map((item) => [item.id, item]),
  );
  const activity = snapshot.piActivity ?? [];
  const turns = [];
  for (const message of snapshot.messages ?? []) {
    // Hallvi's own greeting is the page's, not the operator's.
    if (message.source === "hallvi") continue;
    if (message.role === "user") {
      turns.push({
        request: {
          id: message.id,
          requestKey: message.requestKey ?? message.id,
          body: head(message.body ?? "", REQUEST),
          status: message.status,
          delivery: message.delivery ?? null,
          origin: message.origin ?? null,
          createdAt: message.createdAt,
          images: message.images?.length ?? 0,
        },
        reply: null,
      });
      continue;
    }
    const answered = message.responseTo
      ? turns.findLast((turn) => turn.request?.id === message.responseTo)
      : null;
    const projected = reply(message, activity, executions, information);
    if (answered && !answered.reply) answered.reply = projected;
    else turns.push({ request: null, reply: projected });
  }
  // Older turns keep what each step was; the rest is one read away.
  const shown = turns.slice(-limit).map((turn, index, all) =>
    index >= all.length - 2 || !turn.reply
      ? turn
      : {
          ...turn,
          reply: {
            ...turn.reply,
            steps: turn.reply.steps.map((item) =>
              item.kind === "tool"
                ? { ...item, command: "", output: "", excerpted: true }
                : { ...item, text: head(item.text, 600) },
            ),
          },
        },
  );
  const conversation = {
    status: snapshot.worker?.alive ? (snapshot.status ?? null) : null,
    worker: { alive: Boolean(snapshot.worker?.alive) },
    turns: shown,
    turnsOmitted: turns.length - shown.length,
  };
  return {
    ...conversation,
    revision: createHash("sha256")
      .update(JSON.stringify(conversation))
      .digest("hex")
      .slice(0, 16),
  };
}

/** Last day's traffic as the panel draws it; null fields stay unknown. */
export function projectTraffic(history) {
  const collection = history.collection ?? {};
  return {
    state: collection.state ?? null,
    detail: collection.detail ?? null,
    lastLineAt: collection.lastLineAt ?? null,
    storedFrom: collection.storedFrom ?? null,
    timeZone: history.timeZone ?? null,
    totals: history.totals ?? null,
    previous: history.previous ?? null,
    series: (history.series ?? []).map((point) => ({
      at: point.at,
      views: point.views,
      requests: point.requests,
      errors: point.errors,
      covered: point.covered,
    })),
    errors: (history.errors ?? []).slice(0, 5),
    coverage: history.coverage ?? null,
  };
}
