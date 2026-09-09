// The application-level operation record: one shape for every piece of agent
// work, projected from durable records. Chat receipts, view activity cards,
// navigation marks and Overview all read it; none keeps its own copy.
// Pure over the records, so the browser and the server derive the same
// operations from the same data.
import type { ApplicationSection } from "@/components/server-guy/application-sections";
import type { DeploymentRecord } from "./deployment-types";

/**
 * An inspection goes working → inspected. A change goes proposed → queued
 * (when another change owns the slot) → working → verified or failed.
 * Views show confirmed facts; the operation carries the rest.
 */
export type OperationState =
  | "proposed"
  | "queued"
  | "working"
  | "inspected"
  | "verified"
  | "failed"
  | "cancelled";

export interface OperationStep {
  label: string;
  state: "done" | "active" | "pending" | "failed";
  at?: string;
}

/**
 * What the user is asked to do while an operation waits. An approval may
 * need protected inputs; a failure offers recovery. Generic, so any
 * capability's record can carry one; the deployment keeps its own form.
 */
export type OperationDecision =
  | {
      kind: "approval";
      note: string;
      /** A cost or scope line shown beside the action. */
      cost?: string | null;
      inputs: { name: string; hint?: string; secret?: boolean }[];
      action: string;
    }
  | {
      kind: "recovery";
      note?: string | null;
      retry?: string | null;
      cancel?: string | null;
      inputs?: { name: string; hint?: string; secret?: boolean }[];
    };

export interface ApplicationOperation {
  id: string;
  /** The durable record this operation is projected from. */
  source: {
    type:
      | "deployment"
      | "logs"
      | "backup"
      | "restore"
      | "job"
      | "release"
      | "domain"
      | "variables"
      | "check"
      | "inspection"
      | "issue"
      | "preparation";
    id: string;
  };
  kind: "inspection" | "change";
  title: string;
  state: OperationState;
  /** The stable views this operation reads or changes; the first is primary. */
  destinations: ApplicationSection[];
  /**
   * The conversation and reply that started the work. Null for work that no
   * conversation started, such as a snapshot taken from a view.
   */
  origin: { chatId: string; messageId: string | null } | null;
  /** Replies elsewhere that referred to this operation instead of repeating. */
  mentions: { chatId: string; messageId: string; at: string }[];
  startedAt: string;
  updatedAt: string;
  summary: string;
  steps?: OperationStep[];
  /** What the user is asked to decide while the operation is proposed. */
  approval?: { note: string; action: string };
  /** Decision controls for the generic card; absent for the deployment. */
  decision?: OperationDecision | null;
  evidence?: string;
  /** What has to happen next after a failure. */
  next?: string;
  /** A later operation that addressed this failure. */
  resolvedById?: string;
  waitingForId?: string | null;
  waitingForTitle?: string | null;
  preconditions?: Record<string, string | null>;
}

function revision(record: DeploymentRecord) {
  return record.revision
    ? record.revision.slice(0, 12)
    : "the selected revision";
}

/** The latest recorded events as steps; the newest is the one happening now. */
function eventSteps(
  record: DeploymentRecord,
  last: OperationStep["state"],
  count = 4,
): OperationStep[] {
  const events = record.events.slice(-count);
  return events.map((event, index) => ({
    label: event.message,
    at: event.at,
    state: index === events.length - 1 ? last : "done",
  }));
}

function offerLine(record: DeploymentRecord) {
  const offer = record.offer;
  if (!offer) return "";
  return `${offer.serverType.toUpperCase()} in ${offer.location} · ${offer.currency} ${offer.monthly.toFixed(2)}/month`;
}

export function deploymentOperation(
  record: DeploymentRecord,
): ApplicationOperation {
  const destinations: ApplicationSection[] = ["deployment", "architecture"];
  if (record.plan) destinations.push("processes");
  if (record.plan?.postgres) destinations.push("database", "storage");
  if (record.status === "live") destinations.push("domains", "logs");
  if (
    record.plan &&
    (record.plan.environment.length ||
      record.plan.missingInputs.length ||
      record.plan.postgres)
  )
    destinations.push("variables");
  const base = {
    id: record.operationId ?? `deployment:${record.id}`,
    source: { type: "deployment" as const, id: record.id },
    kind: (["queued", "planning"].includes(record.status) ||
    (record.status === "failed" &&
      !record.authority &&
      !record.serverCreateAttempted)
      ? "inspection"
      : "change") as ApplicationOperation["kind"],
    title: `Deploy ${record.repository}`,
    destinations,
    origin: {
      chatId: record.chatId,
      messageId: record.originMessageId ?? null,
    },
    mentions: record.mentions ?? [],
    startedAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
  switch (record.status) {
    case "queued":
      return {
        ...base,
        state: "working",
        summary:
          "Inspecting the exact repository revision and preparing a priced recommendation. Read-only: nothing is purchased or changed until you approve.",
        steps: [
          { label: "Inspect the repository", state: "active" },
          { label: "Prepare deployment configuration", state: "pending" },
          { label: "Recommend a server", state: "pending" },
        ],
      };
    case "planning":
      return {
        ...base,
        state: "working",
        summary: `Inspecting revision ${revision(record)} and preparing its deployment configuration. Read-only: nothing is purchased or changed until you approve.`,
        steps: eventSteps(record, "active"),
      };
    case "awaiting-approval":
      return {
        ...base,
        state: "proposed",
        summary: `Recommendation ready: ${offerLine(record)} for revision ${revision(record)}. Nothing is purchased or changed until you approve.`,
        approval: {
          note: "Creates one Hetzner server at the shown price and deploys this exact revision.",
          action: "Create server and deploy",
        },
      };
    case "deploy-queued":
      return {
        ...base,
        state: "working",
        summary: `Approved. Waiting for the deployment worker to create the server and deploy revision ${revision(record)}.`,
        steps: [
          ...eventSteps(record, "done", 3),
          { label: "Waiting for the deployment worker", state: "active" },
        ],
      };
    case "deploying":
      return {
        ...base,
        state: "working",
        summary: `Creating the host, preparing Docker and Compose and deploying revision ${revision(record)}.`,
        steps: eventSteps(record, "active"),
      };
    case "live":
      return {
        ...base,
        state: "verified",
        summary: `Revision ${revision(record)} is running at ${record.url ?? record.address ?? "the host"}.`,
        evidence: `Verified ${record.verifiedAt ? new Date(record.verifiedAt).toISOString() : "at deployment"} · public HTTP checks passed${record.plan ? `: ${record.plan.checks.map((check) => check.name).join(", ")}` : ""}.`,
      };
    case "failed":
      return {
        ...base,
        state: "failed",
        summary:
          "Stopped before claiming success. The last verified state, if any, is unchanged.",
        steps: [
          ...eventSteps(record, "done", 3),
          { label: "Stopped", state: "failed" },
        ],
        next:
          record.error ??
          "Retry to reconcile this deployment, or cancel the setup.",
      };
  }
}

/** A log snapshot taken from the Logs view: read-only, no conversation. */
export function logsOperation(record: DeploymentRecord): ApplicationOperation {
  const at = record.logsCollectedAt!;
  return {
    id: `logs:${record.id}:${at}`,
    source: { type: "logs", id: record.id },
    kind: "inspection",
    title: "Collected application logs",
    state: "inspected",
    destinations: ["logs"],
    origin: null,
    mentions: [],
    startedAt: at,
    updatedAt: at,
    summary:
      "Read the latest output from the application host. Nothing on the host was changed.",
    evidence: `Snapshot collected ${new Date(at).toISOString()} · latest 100 lines per service.`,
  };
}

/** Every operation recorded for an application, oldest first. */
export function applicationOperations(
  deployment: DeploymentRecord | null,
): ApplicationOperation[] {
  if (!deployment) return [];
  const operations = [deploymentOperation(deployment)];
  if (deployment.logsCollectedAt) operations.push(logsOperation(deployment));
  return operations;
}
