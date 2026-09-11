import { currentFacts } from "./release-facts";
import { finishDeploymentAttempt } from "./deployment-lifecycle";
import { deploymentRuntime } from "./deployment-runtime";
import { redactSecrets } from "./secrets";
import { createHash, randomUUID } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db, getApplication, getChat, insertMessage } from "./db";
import { deployments, operationRecords } from "./db-schema";
import {
  deploymentOperation,
  logsOperation,
  type ApplicationOperation,
} from "./operation-record";
import type { DeploymentRecord } from "./deployment-types";
import type { OperationCommand, StoredOperation } from "./operation-types";

export class OperationConflictError extends Error {
  constructor(
    message = "This operation changed. Review its current record before deciding.",
  ) {
    super(message);
  }
}
const transaction = <T>(work: () => T) =>
  db().transaction(work, { behavior: "immediate" });
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function timestamp(previous?: string) {
  return new Date(
    Math.max(Date.now(), previous ? Date.parse(previous) + 1 : 0),
  ).toISOString();
}
export function operation(id: string) {
  return (
    db()
      .select()
      .from(operationRecords)
      .where(eq(operationRecords.id, id))
      .get()?.body ?? null
  );
}
function rows(applicationId: string) {
  return db()
    .select()
    .from(operationRecords)
    .where(eq(operationRecords.applicationId, applicationId))
    .orderBy(desc(sql`rowid`))
    .all()
    .map((row) => row.body);
}
function put(value: StoredOperation, touch = true) {
  if (touch) value.updatedAt = timestamp(value.updatedAt);
  db()
    .insert(operationRecords)
    .values({
      id: value.id,
      applicationId: value.applicationId,
      kind: value.kind,
      state: value.state,
      body: value,
    })
    .onConflictDoUpdate({
      target: operationRecords.id,
      set: { kind: value.kind, state: value.state, body: value },
    })
    .run();
  return value;
}
export function currentOperationFacts(
  applicationId: string,
): StoredOperation["preconditions"] {
  const app = getApplication(applicationId);
  if (!app) throw new Error("Application not found.");
  const deployment = db()
    .select()
    .from(deployments)
    .where(eq(deployments.applicationId, applicationId))
    .get()?.body;
  const runtime = deploymentRuntime(deployment ?? null);
  const configuration = currentFacts(deployment ?? null);
  return {
    repository: app.repositoryUrl,
    sourceRevision: deployment?.revision ?? null,
    servingRevision:
      runtime.state === "verified"
        ? (runtime.lastVerified?.revision ?? deployment?.revision ?? null)
        : runtime.state === "observed"
          ? (runtime.observed?.revision ?? null)
          : null,
    stack: deployment?.native ? hash(deployment.native) : null,
    inputNames: configuration ? hash([...configuration.inputs].sort()) : null,
  };
}
function changedFacts(record: StoredOperation) {
  const current = currentOperationFacts(record.applicationId);
  return Object.keys(record.preconditions).filter(
    (key) => record.preconditions[key] !== current[key],
  );
}
function defaults(
  value: ApplicationOperation,
  applicationId: string,
  command: OperationCommand | null,
): StoredOperation {
  return {
    ...value,
    applicationId,
    target: value.source.id,
    command,
    preconditions: {},
    approvedAt: null,
    executorPid: null,
    executionId: null,
    blocksQueue: false,
    queuedAt: null,
  };
}

/** Project deployment rows without deleting their source evidence. */
export function syncDeploymentOperation(record: DeploymentRecord) {
  return transaction(() => {
    const projected = deploymentOperation(record);
    const previous = operation(projected.id);
    // Recreation has its own operation. Do not rewrite the initial deployment
    // receipt with the recreation's verification date or mutable workspace.
    if (
      previous &&
      (record.releaseOperationId ||
        ["recreate", "release"].includes(
          record.lifecycle?.attempts.at(-1)?.kind ?? "",
        ))
    ) {
      syncDeploymentLogs(record);
      return previous;
    }
    const next = {
      ...(previous ??
        defaults(projected, record.applicationId, {
          type: "deployment",
          deploymentId: record.id,
        })),
      ...projected,
    };
    // Old approved intents also join the queue when first imported. They must
    // not bypass another operation merely because they predate this table.
    if (!previous && record.status === "deploy-queued") {
      next.preconditions = currentOperationFacts(record.applicationId);
      next.approvedAt = record.authority?.acceptedAt ?? null;
      start(next);
      return operation(next.id)!;
    }
    // Planning is read-only and must never occupy the application change slot.
    if (["queued", "planning"].includes(record.status))
      next.kind = "inspection";
    if (previous?.state === "queued" && record.status === "deploy-queued") {
      next.state = "queued";
      next.summary = previous.summary;
      next.steps = previous.steps;
      next.waitingForId = previous.waitingForId;
      next.waitingForTitle = previous.waitingForTitle;
    }
    if (record.status === "awaiting-approval")
      next.preconditions = currentOperationFacts(record.applicationId);
    if (record.status === "live") {
      next.blocksQueue = false;
      next.executorPid = null;
      next.executionId = null;
    }
    if (record.status === "failed") {
      // A dead SSH/API client is not evidence its remote effects stopped.
      next.blocksQueue = Boolean(
        record.serverCreateAttempted || record.serverId,
      );
      next.executorPid = null;
      next.executionId = null;
    }
    // Keep CAS identity stable when only reading the same source snapshot.
    if (
      !previous ||
      hash({ ...next, updatedAt: null }) !==
        hash({ ...previous, updatedAt: null })
    )
      put(next, Boolean(previous));
    syncDeploymentLogs(record);
    if (["live", "failed"].includes(record.status))
      advanceQueue(record.applicationId);
    return operation(projected.id)!;
  });
}
export function operationsFor(applicationId: string): ApplicationOperation[] {
  const record = db()
    .select()
    .from(deployments)
    .where(eq(deployments.applicationId, applicationId))
    .get()?.body;
  if (record) syncDeploymentOperation(record);
  return rows(applicationId)
    .map(publicOperation)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function publicOperation(record: StoredOperation): ApplicationOperation {
  // Explicit public fields keep commands, saved results and ownership private.
  return {
    id: record.id,
    source: record.source,
    kind: record.kind,
    title: record.title,
    state: record.state,
    destinations: record.destinations,
    origin: record.origin,
    mentions: record.mentions,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    summary: record.summary,
    steps: record.steps,
    approval: record.approval,
    decision: record.decision,
    evidence: record.evidence,
    next: record.next,
    resolvedById: record.resolvedById,
    waitingForId: record.waitingForId,
    waitingForTitle: record.waitingForTitle,
    preconditions: record.preconditions,
  };
}
function blockedBy(applicationId: string, except?: string) {
  return rows(applicationId).find(
    (row) =>
      row.id !== except &&
      row.kind === "change" &&
      (row.state === "working" || row.blocksQueue),
  );
}
export function applicationChangeActive(applicationId: string) {
  return Boolean(blockedBy(applicationId));
}
export function findUnresolved(
  applicationId: string,
  sourceType: ApplicationOperation["source"]["type"],
  target: string,
) {
  return (
    rows(applicationId).find(
      (row) =>
        row.source.type === sourceType &&
        row.target === target &&
        (["proposed", "queued", "working"].includes(row.state) ||
          (row.state === "failed" && !row.resolvedById)),
    ) ?? null
  );
}
export function mentionOperation(id: string, chatId: string) {
  return transaction(() => {
    const record = operation(id);
    if (!record) throw new Error("Operation not found.");
    const chat = getChat(chatId);
    if (chat?.applicationId !== record.applicationId || chat.archivedAt)
      throw new Error("Choose an active conversation in this application.");
    if (record.origin?.chatId === chatId) return record;
    const message = insertMessage(
      chatId,
      "assistant",
      `I’m referring to the existing operation: ${record.title}. It is ${record.state}; I have not started another one.`,
      "server-guy",
    );
    record.mentions.push({
      chatId,
      messageId: message.id,
      at: message.createdAt,
    });
    return put(record);
  });
}
export function proposeOperation(input: {
  applicationId: string;
  source: ApplicationOperation["source"];
  target: string;
  kind: ApplicationOperation["kind"];
  title: string;
  summary: string;
  destinations: ApplicationOperation["destinations"];
  command: OperationCommand | null;
  chatId?: string | null;
  preconditions?: StoredOperation["preconditions"];
}) {
  return transaction(() => {
    const deployment = db()
      .select()
      .from(deployments)
      .where(eq(deployments.applicationId, input.applicationId))
      .get()?.body;
    if (deployment) syncDeploymentOperation(deployment);
    const existing = findUnresolved(
      input.applicationId,
      input.source.type,
      input.target,
    );
    if (existing)
      return input.chatId
        ? mentionOperation(existing.id, input.chatId)
        : existing;
    const app = getApplication(input.applicationId);
    if (!app) throw new Error("Application not found.");
    if (input.chatId) {
      const chat = getChat(input.chatId);
      if (chat?.applicationId !== input.applicationId || chat.archivedAt)
        throw new Error("Choose an active conversation in this application.");
    }
    const id = randomUUID();
    const at = timestamp();
    const message = input.chatId
      ? insertMessage(input.chatId, "assistant", input.summary, "server-guy")
      : null;
    return put(
      {
        ...defaults(
          {
            id,
            source: input.source,
            kind: input.kind,
            title: input.title,
            summary: input.summary,
            destinations: input.destinations,
            state: input.kind === "inspection" ? "working" : "proposed",
            origin: message
              ? { chatId: input.chatId!, messageId: message.id }
              : null,
            mentions: [],
            startedAt: at,
            updatedAt: at,
          },
          input.applicationId,
          input.command,
        ),
        target: input.target,
        preconditions:
          input.preconditions ?? currentOperationFacts(input.applicationId),
        decision:
          input.kind === "change"
            ? {
                kind: "approval",
                note: input.summary,
                inputs: [],
                action:
                  input.command?.type === "release-deployment"
                    ? "Approve release scope"
                    : "Approve change",
              }
            : null,
      },
      false,
    );
  });
}
function resetApproval(record: StoredOperation, keys: string[]) {
  record.state = "proposed";
  record.approvedAt = null;
  record.waitingForId = null;
  record.waitingForTitle = null;
  record.summary = `Facts changed while waiting: ${keys.join(", ")}. Review again before anything runs.`;
  record.next = record.summary;
  record.preconditions = currentOperationFacts(record.applicationId);
  record.decision = {
    kind: "approval",
    note: record.summary,
    inputs: [],
    action: "Review and approve again",
  };
  if (record.command?.type === "deployment") {
    const source = db()
      .select()
      .from(deployments)
      .where(eq(deployments.id, record.command.deploymentId))
      .get();
    if (source) {
      const body = {
        ...source.body,
        status: "awaiting-approval" as const,
        authority: null,
        recommendationId: randomUUID(),
        updatedAt: timestamp(source.body.updatedAt),
      };
      db()
        .update(deployments)
        .set({ status: body.status, body })
        .where(eq(deployments.id, source.id))
        .run();
    }
  }
  return put(record);
}
function start(record: StoredOperation) {
  if (record.kind === "inspection") {
    record.state = "working";
    record.decision = null;
    return put(record);
  }
  const keys = changedFacts(record);
  if (keys.length) return resetApproval(record, keys);
  const blocker = blockedBy(record.applicationId, record.id);
  if (blocker) {
    record.state = "queued";
    record.waitingForId = blocker.id;
    record.waitingForTitle = blocker.title;
    record.summary = `Queued · after ${record.waitingForTitle}`;
    record.steps = [
      {
        label: `Wait for ${record.waitingForTitle} to finish`,
        state: "pending",
      },
    ];
    record.queuedAt ??= timestamp();
  } else {
    record.state = "working";
    record.waitingForId = null;
    record.waitingForTitle = null;
    record.steps = [{ label: record.title, state: "active" }];
    record.summary = "Approved and ready for execution.";
  }
  record.decision = null;
  return put(record);
}
export function startChange(id: string, expectedUpdatedAt: string) {
  return transaction(() => {
    const record = operation(id);
    if (
      !record ||
      record.updatedAt !== expectedUpdatedAt ||
      record.state !== "proposed"
    )
      throw new OperationConflictError();
    // This approval explicitly accepts the current facts. The executor still
    // validates source-specific authority and provenance before every effect.
    record.approvedAt = timestamp();
    return start(record);
  });
}
export function advanceQueue(applicationId: string) {
  return transaction(() => {
    if (blockedBy(applicationId)) return null;
    const queue = rows(applicationId)
      .filter((row) => row.state === "queued")
      .sort(
        (a, b) =>
          (a.queuedAt ?? a.startedAt).localeCompare(
            b.queuedAt ?? b.startedAt,
          ) || a.startedAt.localeCompare(b.startedAt),
      );
    for (const record of queue) {
      const next = start(record);
      if (next.state === "working" || next.state === "queued") return next;
    }
    return null;
  });
}
export function claimOperation(id: string) {
  return transaction(() => {
    const record = operation(id);
    if (!record || record.state !== "working" || record.executorPid)
      return null;
    if (record.kind === "change") {
      const changed = changedFacts(record);
      if (changed.length) {
        resetApproval(record, changed);
        advanceQueue(record.applicationId);
        return null;
      }
    }
    record.executorPid = process.pid;
    record.executionId = randomUUID();
    return put(record);
  });
}
export function settleOperation(
  id: string,
  executionId: string,
  outcome: "verified" | "inspected" | "failed",
  evidence: string,
  uncertain = false,
  result?: unknown,
) {
  return transaction(() => {
    const record = operation(id);
    if (
      !record ||
      record.executionId !== executionId ||
      record.state !== "working"
    )
      throw new OperationConflictError();
    if (result !== undefined) {
      const encoded = redactSecrets(JSON.stringify(result)).text;
      if (encoded.length <= 1_000_000) record.result = JSON.parse(encoded);
    }
    if (
      outcome === "failed" &&
      (record.command?.type === "recreate-deployment" ||
        record.command?.type === "release-deployment")
    ) {
      const saved = db()
        .select()
        .from(deployments)
        .where(
          eq(
            deployments.id,
            record.command.type === "release-deployment"
              ? record.command.scope.deploymentId
              : record.command.deploymentId,
          ),
        )
        .get();
      const active = saved?.body.lifecycle?.attempts.at(-1);
      // Normal completion already settled the attempt. This also covers a
      // killed worker: settle both records in the same recovery transaction.
      if (saved && active?.operationId === id && active.outcome === "working") {
        finishDeploymentAttempt(
          saved.body,
          active.id,
          "interrupted",
          evidence.slice(0, 2000),
        );
        db()
          .update(deployments)
          .set({ body: saved.body })
          .where(eq(deployments.id, saved.id))
          .run();
      }
    }
    record.state = outcome;
    record.evidence = evidence.slice(0, 12000);
    record.summary = evidence.slice(0, 2000);
    record.executorPid = null;
    record.executionId = null;
    record.blocksQueue = uncertain && record.kind === "change";
    record.steps = [
      { label: record.title, state: outcome === "failed" ? "failed" : "done" },
    ];
    if (outcome === "failed") {
      record.next = uncertain
        ? "Reconcile the remote outcome before starting another change."
        : "Retry or cancel this operation.";
      record.decision = {
        kind: "recovery",
        note: record.next,
        retry: "Retry",
        cancel: uncertain ? null : "Cancel",
      };
    }
    put(record);
    advanceQueue(record.applicationId);
    return record;
  });
}
/** The recovery input an owner completes to release a retired hold. */
export const ATTESTATION_INPUT = "What you verified";
export function cancelOperation(
  id: string,
  expectedUpdatedAt: string,
  attestation?: string,
) {
  return transaction(() => {
    const record = operation(id);
    if (!record || record.updatedAt !== expectedUpdatedAt)
      throw new OperationConflictError();
    if (
      !["proposed", "queued", "failed"].includes(record.state) ||
      (record.blocksQueue && record.command)
    )
      throw new Error(
        "Only stopped, resolved or queued work can be cancelled. Reconcile uncertain effects first.",
      );
    // Retired work has no executor to reconcile it. Its hold ends only on the
    // owner's recorded statement, never on a migration or a plain cancel.
    const statement = attestation?.trim() ?? "";
    const attested = record.blocksQueue;
    if (attested) {
      if (statement.length < 10)
        throw new Error(
          "Record what you verified about this operation's outcome before releasing its hold.",
        );
      record.evidence =
        `${record.evidence ?? ""}\n\nOwner statement, ${timestamp()}: ${statement.slice(0, 1000)}\nServer Guy did not verify this statement; the change queue hold was released on it.`
          .trim()
          .slice(-12000);
      record.blocksQueue = false;
    }
    record.state = "cancelled";
    record.decision = null;
    record.waitingForId = null;
    record.waitingForTitle = null;
    record.summary = attested
      ? "Closed on the owner's recorded statement; Server Guy did not verify the outcome. Retained in application history."
      : "Cancelled by the user. Retained in application history.";
    put(record);
    if (record.origin && !getChat(record.origin.chatId)?.archivedAt)
      insertMessage(
        record.origin.chatId,
        "assistant",
        `${record.title} was cancelled. Its record remains in History.`,
        "server-guy",
      );
    advanceQueue(record.applicationId);
    return record;
  });
}
export function retryOperation(id: string, expectedUpdatedAt: string) {
  return transaction(() => {
    const previous = operation(id);
    if (
      !previous ||
      previous.updatedAt !== expectedUpdatedAt ||
      previous.state !== "failed" ||
      previous.resolvedById
    )
      throw new OperationConflictError();
    // Without a command there is no executor: its capability was retired.
    if (!previous.command)
      throw new Error(
        "This operation's capability was retired; it cannot run again. Dismiss it, or record what you verified to release its hold.",
      );
    const at = timestamp();
    const next: StoredOperation = {
      ...previous,
      id: randomUUID(),
      state: "proposed",
      startedAt: at,
      updatedAt: at,
      executorPid: null,
      executionId: null,
      // A failed reconciliation must not lose the original uncertainty.
      blocksQueue: previous.blocksQueue,
      approvedAt: null,
      queuedAt: null,
      mentions: [],
      resolvedById: undefined,
      result: undefined,
      evidence: undefined,
      next: undefined,
      waitingForTitle: null,
      waitingForId: null,
    };
    previous.resolvedById = next.id;
    // A retry is the sole reconciliation successor allowed to take a held slot.
    previous.blocksQueue = false;
    put(previous);
    put(next, false);
    next.preconditions = currentOperationFacts(next.applicationId);
    next.approvedAt = at;
    return start(next);
  });
}
export function pendingOperations() {
  return db()
    .select()
    .from(operationRecords)
    .where(eq(operationRecords.state, "working"))
    .all()
    .map((row) => row.body)
    .filter(
      (row) =>
        row.command && row.command.type !== "deployment" && !row.executorPid,
    );
}
export function recoverDeadOperations() {
  for (const row of db()
    .select()
    .from(operationRecords)
    .where(eq(operationRecords.state, "working"))
    .all()) {
    const record = row.body;
    if (
      !record.executorPid ||
      !record.executionId ||
      record.command?.type === "deployment"
    )
      continue;
    try {
      process.kill(record.executorPid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ESRCH")
        settleOperation(
          record.id,
          record.executionId,
          "failed",
          "Server Guy stopped mid-operation. Retry or cancel.",
          record.blocksQueue,
        );
    }
  }
  for (const row of db()
    .selectDistinct({ applicationId: operationRecords.applicationId })
    .from(operationRecords)
    .all())
    advanceQueue(row.applicationId);
}

export function markOperationRemoteEffect(id: string, executionId: string) {
  return transaction(() => {
    const record = operation(id);
    if (
      !record ||
      record.executionId !== executionId ||
      record.state !== "working"
    )
      throw new OperationConflictError();
    record.blocksQueue = record.kind === "change";
    put(record);
  });
}

function syncDeploymentLogs(record: DeploymentRecord) {
  if (record.logsCollectedAt) {
    const snapshot = logsOperation(record);
    if (!operation(snapshot.id))
      put(
        {
          ...defaults(snapshot, record.applicationId, null),
          result: {
            collectedAt: record.logsCollectedAt,
            logs: redactSecrets(record.logs).text.slice(-12000),
          },
        },
        false,
      );
  }
}
