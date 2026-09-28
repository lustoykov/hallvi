// What a caller outside Hallvi's page reads back: the `hallvi` command today,
// an adapter for another agent later. The applications, what became of a
// request sent into a main conversation, and an application's recorded state.
//
// Everything here is read from records that already exist — Pi's conversation
// and Hallvi's execution evidence — so nothing is stored, nothing calls a
// model and nothing looks at a server. Pi's words and the recorded facts stay
// apart: `answer` is what Pi said, `evidence` is what the executor recorded,
// and nothing here decides whether the work achieved what was asked.
import {
  applicationListCondition,
  listApplicationItems,
} from "./application-list";
import { listSecrets, redactHeldSecrets } from "./application-secrets";
import { loadApplication, NotFoundError } from "./applications";
import { listConnectionRequests } from "./connection-requests";
import { listApplicationChats } from "./db";
import { deploymentStatus } from "./deployment-automation";
import {
  awaitingDecision,
  listExecutions,
  readExecution,
  type ExecutionRecord,
} from "./operator-execution";
import type { ActivityRecord } from "./pi-activity";
import { readConversation } from "./pi-conversation";
import { listInformation } from "./saved-information";
import { redactSecrets } from "./secrets";
import { WorkerUnavailableError } from "./worker-link";

/** How much one answer carries; the whole of an execution is one read away. */
const LIMITS = { calls: 40, input: 2_000, output: 2_000, answer: 20_000 };
/** The executor keeps the last 100,000 characters of a command's output. */
const RECORDED_OUTPUT = 100_000;

export type RequestStatus =
  | "queued"
  | "working"
  | "waiting-for-approval"
  | "waiting-for-input"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

/** One tool call as recorded: bounded, redacted, and never interpreted. */
export interface Evidence {
  toolCallId: string | null;
  executionId: string | null;
  tool: string;
  target: string | null;
  input: string;
  inputTruncated: boolean;
  status: ExecutionRecord["status"];
  /** Only where a command reported one. */
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
  /** The end of the output, where the result of a command usually is. */
  output: string;
  outputTruncated: boolean;
}

/** Why a caller has to hand over to a person, and where that person goes. */
export interface Attention {
  kind: "approval" | "input" | "interrupted";
  reason: string;
  /** The Hallvi page, as a path on the controller. */
  page: string;
  executionId?: string;
}

const cleaner = (applicationId: string) => (text: string) =>
  redactSecrets(redactHeldSecrets(applicationId, text)).text;

function cut(text: string, limit: number, keep: "head" | "tail") {
  if (text.length <= limit) return { text, truncated: false };
  return {
    text: keep === "head" ? text.slice(0, limit) : text.slice(-limit),
    truncated: true,
  };
}

function evidence(
  clean: (text: string) => string,
  execution: ExecutionRecord | undefined,
  call?: ActivityRecord,
): Evidence {
  const input = cut(
    clean(execution?.input ?? call?.args ?? ""),
    LIMITS.input,
    "head",
  );
  const said = execution?.output ?? (call?.result || call?.preview || "");
  const output = cut(clean(said), LIMITS.output, "tail");
  // An activity record says only that something of it was cut.
  const partial = !execution && Boolean(call?.truncated);
  return {
    toolCallId: execution?.toolCallId ?? call?.id ?? null,
    executionId: execution?.id ?? null,
    tool: execution?.tool ?? call?.tool ?? "",
    target: execution?.target ?? null,
    input: input.text,
    inputTruncated: input.truncated || partial,
    status: execution?.status ?? call!.status,
    exitCode: execution?.exitCode ?? null,
    startedAt: execution?.createdAt ?? call!.startedAt,
    finishedAt: execution?.finishedAt ?? call?.finishedAt ?? null,
    output: output.text,
    outputTruncated:
      output.truncated ||
      partial ||
      (execution?.output.length ?? 0) >= RECORDED_OUTPUT,
  };
}

const firstLine = (text: string) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 200 ? `${line.slice(0, 200)}…` : line;
};

/**
 * The applications, as the home page lists them, with where work is sent and
 * which permission mode it will meet.
 */
export function applicationSummaries() {
  return listApplicationItems().map((item) => ({
    ...item,
    permissionMode: loadApplication(item.id).permissionMode ?? null,
    mainChatId:
      listApplicationChats(item.id).find((chat) => chat.kind === "main")?.id ??
      null,
  }));
}

/**
 * What the owner has been asked for and has not answered yet, read from the
 * records the asking tools wrote. The card is the structured form of the
 * question, so nothing here reads Pi's prose. With `asked`, only what those
 * calls asked for.
 */
function openInputs(
  applicationId: string,
  asked?: { tools: Set<string>; secrets: Set<string> },
) {
  const wanted = (tool: string) => !asked || asked.tools.has(tool);
  const clean = cleaner(applicationId);
  const open: string[] = [];
  const connections = listConnectionRequests(applicationId).filter(
    (request) => !request.settledAt,
  );
  for (const request of connections) {
    if (request.kind === "host" && wanted("request_connection"))
      open.push(`Where it should run: ${clean(request.needs)}`);
    if (request.kind === "domain" && wanted("request_domain_access"))
      open.push(
        `How to reach the DNS of ${request.progress.name || "the domain"}.`,
      );
  }
  const deployment = deploymentStatus(applicationId);
  if (
    deployment.askedAt &&
    !deployment.mode &&
    wanted("request_deployment_choice")
  )
    open.push("How it should deploy.");
  for (const secret of listSecrets(applicationId))
    if (!secret.establishedAt && (!asked || asked.secrets.has(secret.name)))
      open.push(`A value for ${secret.name}: ${clean(secret.why)}`);
  return open;
}

/**
 * Pi holds no message under this key. Distinct from a missing application or
 * conversation: a caller that saw the request waiting learns it was dropped.
 */
export class RequestNotFoundError extends NotFoundError {}

const INTERRUPTED =
  "The worker stopped while Pi was working on this, so nothing runs until someone chooses Continue or Stop in Hallvi. Whether the last command finished is not known.";
const QUEUED_INTERRUPTED =
  "Pi holds this request unread, and the conversation was interrupted: nothing runs until someone chooses Continue or Stop in Hallvi.";

/**
 * What became of one request: the Pi operation that took it, how that ended,
 * what Pi said at the end of it and what its tools recorded.
 *
 * The operation is Pi's own. When Pi read several waiting messages in one go,
 * each of them gets that operation's result; nothing is split between them.
 * A conversation's later work, or another application's, is never read into
 * this one.
 */
export async function requestOutcome(
  applicationId: string,
  chatId: string,
  requestKey: string,
) {
  const { transcript, piActivity, executions } = await readConversation(
    applicationId,
    chatId,
  );
  const unreadable = transcript.messages.find((message) =>
    message.id.startsWith("unavailable:"),
  );
  if (unreadable)
    throw new Error(unreadable.error ?? "Conversation history unavailable.");
  const message = transcript.messages.find(
    (each) => each.role === "user" && each.requestKey === requestKey,
  );
  if (!message)
    throw new RequestNotFoundError(
      "Pi holds no message with this request key in this conversation. It was never accepted, or Stop removed it before Pi read it: Pi keeps no record of a message it dropped.",
    );
  const page = `/applications/${applicationId}?chat=${chatId}`;
  const identity = { applicationId, chatId, requestKey };
  if (message.status === "waiting") {
    const interrupted = transcript.status === "interrupted";
    return {
      ...identity,
      status: (interrupted ? "interrupted" : "queued") as RequestStatus,
      operation: null,
      answer: null,
      answerTruncated: false,
      failure: null,
      attention: interrupted
        ? ({
            kind: "interrupted",
            reason: QUEUED_INTERRUPTED,
            page,
          } as Attention)
        : null,
      evidence: [] as Evidence[],
      evidenceOmitted: 0,
    };
  }

  const operationId = message.operationId;
  const operation = operationId
    ? transcript.operations?.[operationId]
    : undefined;
  if (!operationId || !operation)
    throw new Error(
      "Pi kept no record of the operation that read this message, so what became of it cannot be said.",
    );
  const taken = (each: { operationId?: string | null }) =>
    each.operationId === operationId;
  const replies = transcript.messages.filter(
    (each) => each.role === "assistant" && taken(each),
  );
  const replyIds = new Set(replies.map((reply) => reply.id));
  const recorded = new Map(executions.map((record) => [record.id, record]));
  const calls = piActivity.filter(
    (record) => record.kind === "tool" && replyIds.has(record.runId),
  );
  const clean = cleaner(applicationId);
  const found = calls.map((call) =>
    evidence(
      clean,
      call.executionId ? recorded.get(call.executionId) : undefined,
      call,
    ),
  );

  let status: RequestStatus;
  let attention: Attention | null = null;
  if (operation.status === "open" && transcript.status !== "working") {
    status = "interrupted";
    attention = { kind: "interrupted", reason: INTERRUPTED, page };
  } else if (operation.status === "open") {
    const asking = found.find((each) => {
      const record = each.executionId && recorded.get(each.executionId);
      return record && awaitingDecision(record);
    });
    status = asking ? "waiting-for-approval" : "working";
    if (asking)
      attention = {
        kind: "approval",
        reason: `${asking.tool}${asking.target ? ` on ${asking.target}` : ""}: ${firstLine(asking.input)}`,
        page,
        executionId: asking.executionId ?? undefined,
      };
  } else if (operation.status === "completed") {
    const open = openInputs(applicationId, {
      tools: new Set(calls.map((call) => call.tool)),
      secrets: new Set(
        calls.flatMap((call) => {
          const name = (
            transcript.calls[call.id]?.args as { name?: unknown } | undefined
          )?.name;
          return call.tool === "request_secret" && typeof name === "string"
            ? [name]
            : [];
        }),
      ),
    });
    status = open.length ? "waiting-for-input" : "completed";
    if (open.length)
      attention = { kind: "input", reason: open.join(" "), page };
  } else status = operation.status === "aborted" ? "cancelled" : "failed";

  const ended = operation.status !== "open";
  const last = replies.at(-1);
  const answer = ended
    ? cut(
        replies.findLast((reply) => reply.body.trim())?.body ?? "",
        LIMITS.answer,
        "head",
      )
    : null;
  return {
    ...identity,
    status,
    operation: {
      id: operationId,
      status: operation.status,
      startedAt: operation.startedAt,
      endedAt: operation.endedAt,
      /** Every request this operation took, this one among them. */
      requestKeys: transcript.messages
        .filter((each) => each.role === "user" && taken(each))
        .map((each) => each.requestKey ?? each.id),
    },
    answer: answer?.text ? clean(answer.text) : null,
    answerTruncated: answer?.truncated ?? false,
    /** Why Pi could not finish, as advice: never the provider's own words. */
    failure:
      status === "failed"
        ? (last?.error ??
          "Pi could not finish this. Check the evidence for any effects.")
        : null,
    attention,
    evidence: found.slice(-LIMITS.calls),
    evidenceOmitted: Math.max(0, found.length - LIMITS.calls),
  };
}
export type RequestOutcome = Awaited<ReturnType<typeof requestOutcome>>;

/**
 * An application's recorded state, bounded: what the home page says about it,
 * its main conversation, what waits on a person, how it deploys, the records
 * Pi presented and the latest executions.
 */
export async function inspectApplication(applicationId: string) {
  const application = loadApplication(applicationId);
  const records = listInformation(applicationId);
  const chats = listApplicationChats(applicationId);
  const main = chats.find((chat) => chat.kind === "main") ?? null;
  // Without a worker the conversation's state is not known, and is said so
  // rather than read as idle.
  const conversation = main
    ? await readConversation(applicationId, main.id).catch((error) => {
        if (error instanceof WorkerUnavailableError) return null;
        throw error;
      })
    : null;
  const page = main
    ? `/applications/${applicationId}?chat=${main.id}`
    : `/applications/${applicationId}`;
  const clean = cleaner(applicationId);
  const executions = listExecutions(applicationId);
  const attention: Attention[] = [
    ...executions.filter(awaitingDecision).map((record) => ({
      kind: "approval" as const,
      reason: `${record.tool} on ${record.target}: ${firstLine(clean(record.input))}`,
      page,
      executionId: record.id,
    })),
    ...openInputs(applicationId).map((reason) => ({
      kind: "input" as const,
      reason,
      page,
    })),
    ...(conversation?.transcript.status === "interrupted"
      ? [{ kind: "interrupted" as const, reason: INTERRUPTED, page }]
      : []),
  ];
  const deployment = deploymentStatus(applicationId);
  const presented = records.filter((record) => record.presentation);
  const host = application.host;
  return {
    application: {
      id: application.id,
      name: application.name,
      repositoryUrl: application.repositoryUrl,
      permissionMode: application.permissionMode ?? null,
      host: host
        ? {
            address: host.address,
            user: host.user,
            port: host.port,
            provider: host.provider ?? null,
            serverId: host.serverId ?? null,
          }
        : null,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
    },
    condition: applicationListCondition(records, applicationId, Date.now()),
    conversations: chats.map((chat) => ({
      id: chat.id,
      title: chat.title,
      kind: chat.kind,
      archivedAt: chat.archivedAt,
    })),
    main: main && {
      chatId: main.id,
      /** Null when no worker answered, so nobody knows. */
      status: conversation?.transcript.status ?? null,
      worker: { alive: Boolean(conversation) },
    },
    attention,
    deployment: {
      mode: deployment.mode,
      branch: deployment.branch,
      paused: deployment.paused,
      watching: deployment.watching,
      deployed: deployment.deployed,
      latest: deployment.latest?.commit ?? null,
      blocked: deployment.blocked,
    },
    records: presented.slice(0, 25).map((record) => ({
      id: record.id,
      title: record.title,
      status: record.presentation?.status ?? null,
      role: record.presentation?.role ?? null,
      views: record.presentation?.views ?? [],
      nextStep: record.presentation?.nextStep ?? null,
      url: record.presentation?.url ?? null,
      establishedAt: record.establishedAt,
      updatedAt: record.updatedAt,
    })),
    recordsOmitted: Math.max(0, presented.length - 25),
    executions: executions
      .slice(-20)
      .reverse()
      .map((record) => evidence(clean, record)),
    executionsOmitted: Math.max(0, executions.length - 20),
  };
}

/** One execution in full, as recorded: the executor's own output limit only. */
export function executionDetail(applicationId: string, executionId: string) {
  const record = readExecution(applicationId, executionId);
  if (!record)
    throw new NotFoundError("This application has no execution with that id.");
  const clean = cleaner(applicationId);
  return {
    id: record.id,
    applicationId: record.applicationId,
    chatId: record.chatId,
    toolCallId: record.toolCallId ?? null,
    tool: record.tool,
    target: record.target,
    mode: record.mode,
    approvalId: record.approvalId ?? null,
    input: clean(record.input),
    status: record.status,
    exitCode: record.exitCode ?? null,
    startedAt: record.createdAt,
    outputAt: record.outputAt ?? null,
    finishedAt: record.finishedAt ?? null,
    output: clean(record.output),
    /** The executor keeps only the last 100,000 characters. */
    outputTruncated: record.output.length >= RECORDED_OUTPUT,
  };
}
