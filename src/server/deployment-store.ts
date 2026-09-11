import type { DeploymentRelease } from "./deployment-release";
import {
  beginDeploymentAttempt,
  finishDeploymentAttempt,
  syncDeploymentHost,
} from "./deployment-lifecycle";
import { redactSecrets } from "./secrets";
import {
  syncDeploymentOperation,
  operation,
  cancelOperation,
  retryOperation,
} from "./operation-store";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, getApplication, getChat, insertMessage } from "./db";
import { deployments } from "./db-schema";
import type { DeploymentRecord } from "./deployment-types";
import { removeCancelledDeploymentFiles } from "./deployment-files";

const snapshots = new WeakMap<DeploymentRecord, DeploymentRecord>();
function remember(record: DeploymentRecord | null) {
  if (record) snapshots.set(record, structuredClone(record));
  return record;
}
export class DeploymentConflictError extends Error {
  constructor() {
    super(
      "Deployment changed while this action was running. Refresh and try again.",
    );
  }
}
export function getDeployment(id: string): DeploymentRecord | null {
  return remember(
    db().select().from(deployments).where(eq(deployments.id, id)).get()?.body ??
      null,
  );
}
export function applicationDeployment(applicationId: string) {
  return remember(
    db()
      .select()
      .from(deployments)
      .where(eq(deployments.applicationId, applicationId))
      .get()?.body ?? null,
  );
}
export function deploymentExecutionState(value: DeploymentRecord) {
  return JSON.stringify({
    ...value,
    mentions: undefined,
    updatedAt: undefined,
  });
}
export function saveDeployment(record: DeploymentRecord) {
  const previous = snapshots.get(record);
  if (!previous) throw new DeploymentConflictError();
  db().transaction(
    () => {
      const latest = getDeployment(record.id);
      // Conversation references are presentation metadata. Adding one must
      // not strand a worker holding the same execution state between effects.
      if (
        !latest ||
        deploymentExecutionState(latest) !== deploymentExecutionState(previous)
      )
        throw new DeploymentConflictError();
      const mentions = new Map(
        [...(latest.mentions ?? []), ...(record.mentions ?? [])].map(
          (mention) => [mention.messageId, mention],
        ),
      );
      if (mentions.size) record.mentions = [...mentions.values()];
      // Completed outcomes and selected releases are retained, not rewritten
      // by a retry or an unrelated save of the legacy executor workspace.
      for (const key of [
        "releases",
        "attempts",
        "reconciliations",
        "verifiedImages",
      ] as const) {
        for (const [index, entry] of (
          latest.lifecycle?.[key] ?? []
        ).entries()) {
          if (
            key === "attempts" &&
            "outcome" in entry &&
            entry.outcome === "working"
          )
            continue;
          if (
            JSON.stringify(record.lifecycle?.[key]?.[index]) !==
            JSON.stringify(entry)
          )
            throw new Error(
              "Recorded releases and completed attempts cannot be rewritten.",
            );
        }
      }
      syncDeploymentHost(record);
      record.updatedAt = new Date().toISOString();
      const result = db()
        .update(deployments)
        .set({ status: record.status, body: record })
        .where(and(eq(deployments.id, record.id), eq(deployments.body, latest)))
        .run();
      if (result.changes !== 1) throw new DeploymentConflictError();
      remember(record);
      syncDeploymentOperation(record);
    },
    { behavior: "immediate" },
  );
}
// Called only when no create attempt remains and no server was recorded. A
// failed or expired connection cannot strand a definitively uncreated setup.
export function cancelDeployment(record: DeploymentRecord) {
  if (
    record.serverId ||
    record.serverCreateAttempted ||
    !["queued", "awaiting-approval", "deploy-queued", "failed"].includes(
      record.status,
    )
  )
    throw new Error(
      "Only definitively uncreated, stopped or queued deployment setup can be cancelled.",
    );
  const previous = snapshots.get(record);
  if (!previous) throw new DeploymentConflictError();
  db().transaction(
    () => {
      const result = db()
        .delete(deployments)
        .where(
          and(eq(deployments.id, record.id), eq(deployments.body, previous)),
        )
        .run();
      if (result.changes !== 1) throw new DeploymentConflictError();
      const tracked = operation(
        record.operationId ?? `deployment:${record.id}`,
      );
      if (tracked) cancelOperation(tracked.id, tracked.updatedAt);
      deploymentMessage(
        record,
        `Deployment setup ${record.id} was cancelled by the user after confirming that no server was created. Revision: ${record.revision ?? "not yet selected"}. No running application was removed.`,
      );
    },
    { behavior: "immediate" },
  );
  if (!db().$client.inTransaction) removeCancelledDeploymentFiles(record.id);
}
export function deploymentEvent(record: DeploymentRecord, message: string) {
  record.events.push({ at: new Date().toISOString(), message });
  saveDeployment(record);
}
export function deploymentMessage(record: DeploymentRecord, text: string) {
  return insertMessage(record.chatId, "assistant", text, "server-guy");
}
function describeStatus(record: DeploymentRecord) {
  switch (record.status) {
    case "awaiting-approval":
      return "with a recommendation waiting for approval";
    case "live":
      return "that is verified and running";
    case "failed":
      return "that stopped and needs attention";
    default:
      return "in progress";
  }
}
// A request from another conversation refers to the existing deployment
// instead of starting a second one; the reply carries a link to its receipt.
function mentionDeployment(record: DeploymentRecord, chatId: string) {
  return db().transaction(
    () => {
      const latest = applicationDeployment(record.applicationId);
      if (!latest) return record;
      const message = insertMessage(
        chatId,
        "assistant",
        `This application already has a deployment ${describeStatus(latest)}. It was started in another conversation, so I haven’t started a second one; follow it there.`,
        "server-guy",
      );
      latest.mentions = [
        ...(latest.mentions ?? []),
        { chatId, messageId: message.id, at: message.createdAt },
      ];
      saveDeployment(latest);
      return latest;
    },
    { behavior: "immediate" },
  );
}
export function requestDeployment(
  applicationId: string,
  chatId: string,
  origin: "user" | "server-guy" = "user",
  requirements?: string,
  requestedRef?: string,
) {
  const app = getApplication(applicationId);
  const chat = getChat(chatId);
  if (!app || chat?.applicationId !== applicationId || chat.archivedAt)
    throw new Error("Choose an active conversation in this application.");
  // One initial deployment per application. Repeated clicks reuse its intent.
  // Later releases get distinct records. A retry is not a new release.
  const existing = applicationDeployment(applicationId);
  if (existing)
    return existing.chatId === chatId
      ? existing
      : mentionDeployment(existing, chatId);
  const at = new Date().toISOString();
  const record: DeploymentRecord = {
    id: randomUUID(),
    applicationId,
    chatId,
    status: "queued",
    repository: `${app.repositoryOwner}/${app.repositoryName}`,
    requirements: requirements?.slice(0, 5000),
    requestedRef,
    revision: null,
    offer: null,
    authority: null,
    serverId: null,
    serverCreateAttempted: false,
    address: null,
    imageId: null,
    url: null,
    verifiedAt: null,
    error: null,
    logs: "",
    events: [],
    createdAt: at,
    updatedAt: at,
  };
  return db().transaction(
    () => {
      const raced = applicationDeployment(applicationId);
      if (raced)
        return raced.chatId === chatId
          ? raced
          : mentionDeployment(raced, chatId);
      insertMessage(
        chatId,
        origin === "user" ? "user" : "assistant",
        origin === "user"
          ? "Deploy this repository. Inspect it and recommend the smallest suitable Hetzner setup."
          : "I requested a deployment recommendation. No purchase has been authorised.",
        origin,
      );
      // The receipt for this deployment sits under this reply.
      record.originMessageId = deploymentMessage(
        record,
        "I’ll inspect the exact repository revision and prepare its deployment configuration. I’ll show the server cost and any missing inputs before creating anything.",
      ).id;
      db()
        .insert(deployments)
        .values({
          id: record.id,
          applicationId,
          status: record.status,
          body: record,
        })
        .run();
      remember(record);
      syncDeploymentOperation(record);
      return record;
    },
    { behavior: "immediate" },
  );
}
/**
 * Continue a stopped first deployment under its existing approval: the
 * owner's Retry, or a correction Pi found in a conversation. The retried
 * operation carries the approval; nothing widens it, and a new server is
 * never bought blindly.
 */
export function retryInitialDeployment(
  record: DeploymentRecord,
  options: {
    verificationObjectId?: string;
    correction?: { instructions: string; chatId: string };
  } = {},
) {
  if (record.status !== "failed")
    throw new Error("Only a stopped deployment can be retried.");
  return db().transaction(
    () => {
      const tracked = syncDeploymentOperation(record);
      const retried = retryOperation(tracked.id, tracked.updatedAt);
      record.operationId = retried.id;
      if (options.verificationObjectId) {
        if (!record.verificationPending || record.cleanup)
          throw new Error(
            "There is no unresolved test-object creation to recover.",
          );
        record.verificationRecoveryId = options.verificationObjectId;
      }
      const at = new Date().toISOString();
      if (options.correction) {
        record.correction = { ...options.correction, at };
        record.events.push({
          at,
          message: `Correction requested from a conversation: ${options.correction.instructions.slice(0, 600)}`,
        });
      }
      record.status = record.authority ? "deploy-queued" : "queued";
      record.error = null;
      saveDeployment(record);
      return retried;
    },
    { behavior: "immediate" },
  );
}
export function pendingDeployments() {
  return db()
    .select()
    .from(deployments)
    .all()
    .map((row) => remember(row.body)!)
    .filter((record) => ["queued", "deploy-queued"].includes(record.status));
}
export function interruptDeployments() {
  // Called only after acquiring the exclusive deployment-worker lock. A
  // crash can happen between claiming an operation and writing `deploying`.
  for (const { body } of db().select().from(deployments).all()) {
    const claimedBeforeExecution =
      body.status === "deploy-queued" &&
      operation(body.operationId ?? `deployment:${body.id}`)?.executorPid;
    if (
      !claimedBeforeExecution &&
      !["planning", "deploying"].includes(body.status)
    )
      continue;
    remember(body);
    const active = body.lifecycle?.attempts.at(-1);
    if (active?.outcome === "working")
      finishDeploymentAttempt(
        body,
        active.id,
        "interrupted",
        "The deployment worker stopped.",
      );
    body.status = "failed";
    body.error =
      "The worker stopped. Retry to reconcile this same deployment; a new server will not be purchased blindly.";
    saveDeployment(body);
  }
}

/** The existing CAS save makes attempt, host and runtime transitions atomic. */
export async function runDeploymentAttempt<T>(
  record: DeploymentRecord,
  kind: "deploy" | "recreate" | "release" | "reconcile",
  operationId: string,
  work: () => Promise<T>,
  selectedRelease?: DeploymentRelease,
): Promise<T> {
  const attempt = beginDeploymentAttempt(
    record,
    kind,
    operationId,
    selectedRelease,
  );
  saveDeployment(record);
  try {
    const result = await work();
    // Without a behavior criterion, execution establishes only what runs.
    const unverified =
      typeof result === "object" &&
      result !== null &&
      (result as { behavior?: string }).behavior === "unverified";
    finishDeploymentAttempt(
      record,
      attempt.id,
      unverified ? "observed" : "verified",
    );
    if (kind === "deploy") record.status = "live";
    saveDeployment(record);
    return result;
  } catch (error) {
    if (error instanceof DeploymentConflictError) throw error;
    finishDeploymentAttempt(
      record,
      attempt.id,
      "failed",
      redactSecrets(
        error instanceof Error ? error.message : "Deployment attempt failed.",
      ).text.slice(0, 2000),
      (error as { established?: boolean } | null)?.established === true,
    );
    saveDeployment(record);
    throw error;
  }
}
