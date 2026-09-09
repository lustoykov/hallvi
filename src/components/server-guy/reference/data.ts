// Prototype data for the reference screens. Everything here is invented and
// labelled as such in the shell; nothing reads a host, a provider or the
// product database. The shapes are the product's own records, so the
// components render them exactly as they will render real ones.
import type { ApplicationFacts } from "@/server/application-facts";
import type { DeploymentRecord } from "@/server/deployment-types";
import type {
  ApplicationOperation,
  OperationDecision,
  OperationState,
  OperationStep,
} from "@/server/operation-record";
import type {
  ApplicationRecord,
  ChatMessage,
  ChatSummary,
} from "@/server/types";

import type { ApplicationSection } from "../application-sections";

export interface ReferenceState {
  application: ApplicationRecord;
  deployment: DeploymentRecord | null;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  chats: ChatSummary[];
  messages: ChatMessage[];
  clock: string;
}

let serial = 0;
export const nextId = (prefix: string) => `${prefix}-${++serial}`;
/** Replaying a scenario restarts ids so server and client render alike. */
export const resetIds = () => {
  serial = 0;
};

/** Minutes and hours relative to a base time, as ISO strings. */
export const at = (base: string, minutes: number) =>
  new Date(new Date(base).getTime() + minutes * 60_000).toISOString();

export function message(
  state: ReferenceState,
  chatId: string,
  role: "user" | "assistant",
  body: string,
  options: { source?: ChatMessage["source"]; at?: string; id?: string } = {},
) {
  const created: ChatMessage = {
    id: options.id ?? nextId("msg"),
    chatId,
    role,
    body,
    source: options.source ?? (role === "user" ? "user" : "pi"),
    createdAt: options.at ?? state.clock,
    status: "completed",
    revision: 0,
  };
  state.messages.push(created);
  const chat = state.chats.find((item) => item.id === chatId);
  if (chat && created.createdAt > chat.lastActivityAt)
    chat.lastActivityAt = created.createdAt;
  return created;
}

export function chat(
  state: ReferenceState,
  id: string,
  title: string,
  options: { primary?: boolean; at?: string } = {},
) {
  const created: ChatSummary = {
    id,
    applicationId: state.application.id,
    workspaceId: "reference",
    title,
    isPrimary: options.primary ?? false,
    createdAt: options.at ?? state.clock,
    archivedAt: null,
    lastActivityAt: options.at ?? state.clock,
  };
  state.chats.push(created);
  return created;
}

export function operation(
  state: ReferenceState,
  input: {
    id: string;
    source: ApplicationOperation["source"]["type"];
    kind: ApplicationOperation["kind"];
    title: string;
    state: OperationState;
    destinations: ApplicationSection[];
    origin: { chatId: string; messageId: string | null } | null;
    summary: string;
    steps?: OperationStep[];
    approval?: { note: string; action: string };
    decision?: OperationDecision | null;
    evidence?: string;
    next?: string;
    startedAt?: string;
  },
) {
  const created: ApplicationOperation = {
    id: input.id,
    source: { type: input.source, id: input.id },
    kind: input.kind,
    title: input.title,
    state: input.state,
    destinations: input.destinations,
    origin: input.origin,
    mentions: [],
    startedAt: input.startedAt ?? state.clock,
    updatedAt: state.clock,
    summary: input.summary,
    steps: input.steps,
    approval: input.approval,
    decision: input.decision ?? null,
    evidence: input.evidence,
    next: input.next,
  };
  state.operations.push(created);
  return created;
}

export function find(state: ReferenceState, id: string) {
  const found = state.operations.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown operation ${id}`);
  return found;
}

/** Moves an operation to a new state at the current clock. */
export function update(
  state: ReferenceState,
  id: string,
  changes: Partial<ApplicationOperation>,
) {
  const found = find(state, id);
  Object.assign(found, changes, { updatedAt: state.clock });
  return found;
}

export function steps(
  labels: string[],
  active: number,
  failedAt?: number,
): OperationStep[] {
  return labels.map((label, index) => ({
    label,
    state:
      failedAt === index
        ? "failed"
        : index < active
          ? "done"
          : index === active
            ? "active"
            : "pending",
  }));
}

export function mention(
  state: ReferenceState,
  operationId: string,
  chatId: string,
  messageId: string,
) {
  find(state, operationId).mentions.push({
    chatId,
    messageId,
    at: state.clock,
  });
}

/** A deployment record the executor would have written, with a live stack. */
export function liveDeployment(input: {
  id: string;
  applicationId: string;
  chatId: string;
  repository: string;
  revision: string;
  port: number;
  command: string[] | null;
  postgres: DeploymentRecord["plan"] extends infer P
    ? P extends { postgres: infer Q }
      ? Q
      : never
    : never;
  environment: { name: string; value: string }[];
  missingInputs: { name: string; reason: string }[];
  healthPath: string;
  checks: { name: string; path: string; contains: string }[];
  offer: { serverType: string; monthly: number; cores: number; memory: number };
  address: string;
  serverId: number;
  createdAt: string;
  verifiedAt: string;
  originMessageId: string;
  stack?: DeploymentRecord["stack"];
  summary: string;
  events: string[];
}): DeploymentRecord {
  return {
    id: input.id,
    applicationId: input.applicationId,
    chatId: input.chatId,
    status: "live",
    repository: input.repository,
    repositoryId: 4120,
    recommendationId: `${input.id}-recommendation`,
    revision: input.revision,
    inspectedRevision: input.revision,
    plan: {
      summary: input.summary,
      dockerfile: "Dockerfile",
      generatedDockerfile: null,
      context: ".",
      port: input.port,
      command: input.command,
      environment: input.environment,
      postgres: input.postgres,
      missingInputs: input.missingInputs,
      healthPath: input.healthPath,
      checks: input.checks.map((check) => ({
        name: check.name,
        method: "GET" as const,
        path: check.path,
        body: null,
        expectedStatus: 200,
        contains: check.contains,
        captureId: null,
      })),
    },
    offer: {
      serverType: input.offer.serverType,
      location: "fsn1",
      cores: input.offer.cores,
      memory: input.offer.memory,
      monthly: input.offer.monthly,
      hourly: Math.round((input.offer.monthly / 730) * 10000) / 10000,
      currency: "EUR",
    },
    authority: {
      acceptedAt: input.createdAt,
      connectionId: "hetzner-reference",
      maxMonthly: input.offer.monthly,
    },
    serverId: input.serverId,
    serverCreateAttempted: true,
    address: input.address,
    imageId: `server-guy-${input.id.slice(0, 8)}:${input.revision.slice(0, 12)}`,
    url: `http://${input.address}`,
    verifiedAt: input.verifiedAt,
    error: null,
    events: input.events.map((message, index) => ({
      at: at(input.createdAt, index * 2),
      message,
    })),
    logs: "",
    createdAt: input.createdAt,
    updatedAt: input.verifiedAt,
    originMessageId: input.originMessageId,
    mentions: [],
    logsCollectedAt: null,
    stack: input.stack,
  };
}
