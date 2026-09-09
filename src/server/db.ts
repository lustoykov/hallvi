import Database from "better-sqlite3";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  acceptanceChecks,
  activityEvents,
  applicationContracts,
  applicationPreviews,
  preparationBranches,
  applications,
  chats,
  conformanceProposals,
  conformanceRuns,
  decisions,
  messages,
  observations,
  phaseWorkspaces,
  piRuns,
  publicationGrants,
  chatSummaries,
} from "./db-schema";
import schemaVersion from "./schema-version.json";
import { assertOutsideRecoveryQuarantine } from "./recovery-quarantine.mjs";
import type {
  AcceptanceChecksRecord,
  ActivityEvent,
  ApplicationContractBody,
  ApplicationContractRecord,
  ApplicationRecord,
  ApplicationPreview,
  Chat,
  ChatMessage,
  ConformanceProposalRecord,
  ConformanceRunRecord,
  Decision,
  Observation,
  PhaseKey,
  PhaseWorkspaceRecord,
  PublicationGrantRecord,
  PreparationBranch,
} from "./types";

const schema = {
  activityEvents,
  applicationContracts,
  applications,
  chats,
  decisions,
  messages,
  observations,
  phaseWorkspaces,
  piRuns,
  chatSummaries,
};
type ServerGuyDatabase = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __serverGuyDb: ServerGuyDatabase | undefined;
}

export function databasePath() {
  const path =
    process.env.SERVER_GUY_DB_PATH ??
    join(process.cwd(), ".server-guy", "server-guy.db");
  assertOutsideRecoveryQuarantine(
    path,
    process.env.SERVER_GUY_CONFIG_DIR ?? join(process.cwd(), ".server-guy"),
  );
  return path;
}

export function db(): ServerGuyDatabase {
  return (globalThis.__serverGuyDb ??= createDatabase());
}

function createDatabase(): ServerGuyDatabase {
  const path = databasePath();
  mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  try {
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
    // SQLite's built-in lower() folds ASCII only. Decision text can be Unicode.
    client.function("unicode_lower", { deterministic: true }, (value) =>
      typeof value === "string" ? value.toLowerCase() : null,
    );
    assertCurrentSchema(client, path);
    return drizzle({ client, schema });
  } catch (error) {
    client.close();
    throw error;
  }
}

function assertCurrentSchema(
  client: InstanceType<typeof Database>,
  databasePath: string,
) {
  const version = client.pragma("user_version", { simple: true }) as number;
  const initialized = Boolean(
    client
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'applications'",
      )
      .get(),
  );
  if (!initialized) {
    throw new Error(`${databasePath} is not initialized. Run npm run db:push.`);
  }
  if (version !== schemaVersion.version) {
    throw new Error(
      `${databasePath} has prototype schema version ${version}; expected ${schemaVersion.version}. Stop the app and worker, then run npm run db:push. Other prototype versions require an explicit fresh database.`,
    );
  }
}

function now() {
  return new Date().toISOString();
}

const rowId = sql<number>`rowid`;

// Applications

export function listApplications() {
  return db()
    .select()
    .from(applications)
    .orderBy(desc(applications.createdAt), desc(rowId))
    .all();
}

export function getApplication(id: string) {
  return (
    db().select().from(applications).where(eq(applications.id, id)).get() ??
    null
  );
}

export function deleteApplication(id: string) {
  // Foreign keys remove only this application's workspace and dependent
  // records.
  db().delete(applications).where(eq(applications.id, id)).run();
}

export function getApplicationByRepository(repositoryUrl: string) {
  return (
    db()
      .select()
      .from(applications)
      .where(eq(applications.repositoryUrl, repositoryUrl))
      .get() ?? null
  );
}

export function insertApplication(
  input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">,
  id: string = randomUUID(),
) {
  const timestamp = now();
  const application: ApplicationRecord = {
    ...input,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  db().insert(applications).values(application).run();
  return application;
}

// Phase workspaces

export function insertWorkspace(
  applicationId: string,
  phaseKey: PhaseKey = "start",
) {
  const workspace: PhaseWorkspaceRecord = {
    id: randomUUID(),
    applicationId,
    phaseKey,
    createdAt: now(),
    completedAt: null,
    deliverableEvidence: null,
  };
  db().insert(phaseWorkspaces).values(workspace).run();
  return workspace;
}

export function getWorkspace(
  applicationId: string,
  phaseKey: PhaseKey = "start",
) {
  return (
    db()
      .select()
      .from(phaseWorkspaces)
      .where(
        and(
          eq(phaseWorkspaces.applicationId, applicationId),
          eq(phaseWorkspaces.phaseKey, phaseKey),
        ),
      )
      .get() ?? null
  );
}

export function getWorkspaceById(id: string) {
  return (
    db()
      .select()
      .from(phaseWorkspaces)
      .where(eq(phaseWorkspaces.id, id))
      .get() ?? null
  );
}

// Workspaces are created in phase order, so creation order is phase order.
export function listWorkspaces(applicationId: string) {
  return db()
    .select()
    .from(phaseWorkspaces)
    .where(eq(phaseWorkspaces.applicationId, applicationId))
    .orderBy(asc(phaseWorkspaces.createdAt), asc(rowId))
    .all();
}

/** Marks a workspace complete exactly once, retaining its deliverable
 * evidence. Returns false when it was already completed. */
export function completeWorkspace(id: string, evidence: unknown) {
  const completedAt = now();
  return (
    db()
      .update(phaseWorkspaces)
      .set({ completedAt, deliverableEvidence: evidence })
      .where(
        and(eq(phaseWorkspaces.id, id), isNull(phaseWorkspaces.completedAt)),
      )
      .run().changes > 0
  );
}

/** Reopening retains the old deliverable as a historical Observation. */
export function reopenWorkspace(id: string) {
  const workspace = getWorkspaceById(id);
  if (!workspace) throw new Error("Workspace not found.");
  if (workspace.completedAt)
    insertObservation({
      applicationId: workspace.applicationId,
      kind: "phase-completion-history",
      status: "passed",
      summary: `Retained ${workspace.phaseKey} completion before correction.`,
      sourceLabel: "Earlier phase completion",
      sourceUrl: null,
      raw: {
        workspaceId: id,
        completedAt: workspace.completedAt,
        evidence: workspace.deliverableEvidence,
      },
    });
  db()
    .update(phaseWorkspaces)
    .set({ completedAt: null, deliverableEvidence: null })
    .where(eq(phaseWorkspaces.id, id))
    .run();
}

// Chats and messages

export function insertChat(
  workspaceId: string,
  title: string,
  isPrimary = false,
) {
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");
  const chat: Chat = {
    id: randomUUID(),
    applicationId: workspace.applicationId,
    workspaceId,
    title,
    isPrimary,
    createdAt: now(),
    archivedAt: null,
  };
  db().insert(chats).values(chat).run();
  return chat;
}

export function getChat(id: string) {
  return db().select().from(chats).where(eq(chats.id, id)).get() ?? null;
}

export function listChats(workspaceId: string) {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.workspaceId, workspaceId))
    .orderBy(asc(chats.createdAt), asc(rowId))
    .all();
}

export function listApplicationChats(applicationId: string) {
  return db()
    .select()
    .from(chats)
    .where(eq(chats.applicationId, applicationId))
    .orderBy(asc(chats.createdAt), asc(rowId))
    .all();
}

// The chat list shows when each chat was last active: its newest message, or
// its creation when nothing has been sent yet.
export function listChatSummaries(workspaceId: string) {
  return listChats(workspaceId).map((chat) => ({
    ...chat,
    lastActivityAt:
      db()
        .select({ at: sql<string | null>`max(${messages.createdAt})` })
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .get()?.at ?? chat.createdAt,
  }));
}

export function listApplicationChatSummaries(applicationId: string) {
  return listApplicationChats(applicationId).map((chat) => ({
    ...chat,
    lastActivityAt:
      db()
        .select({ at: sql<string | null>`max(${messages.createdAt})` })
        .from(messages)
        .where(eq(messages.chatId, chat.id))
        .get()?.at ?? chat.createdAt,
  }));
}

export function archiveChat(id: string) {
  db()
    .update(chats)
    .set({ archivedAt: now() })
    .where(and(eq(chats.id, id), isNull(chats.archivedAt)))
    .run();
}

export function insertMessage(
  chatId: string,
  role: ChatMessage["role"],
  body: string,
  source: ChatMessage["source"],
  status: ChatMessage["status"] = "completed",
) {
  const message: ChatMessage = {
    id: randomUUID(),
    chatId,
    role,
    body,
    source,
    createdAt: now(),
    status,
    revision: 0,
  };
  db().insert(messages).values(message).run();
  return message;
}

export function getMessage(id: string) {
  return db().select().from(messages).where(eq(messages.id, id)).get() ?? null;
}

/** A message only when it belongs to one of this application's Chats. */
export function getApplicationMessage(applicationId: string, id: string) {
  return (
    db()
      .select({ message: messages })
      .from(messages)
      .innerJoin(chats, eq(chats.id, messages.chatId))
      .innerJoin(phaseWorkspaces, eq(phaseWorkspaces.id, chats.workspaceId))
      .where(
        and(
          eq(messages.id, id),
          eq(phaseWorkspaces.applicationId, applicationId),
        ),
      )
      .get()?.message ?? null
  );
}

/** Whether any Pi Run for this application is queued or running. */
export function hasPendingRuns(applicationId: string) {
  return Boolean(
    db()
      .select({ id: piRuns.id })
      .from(piRuns)
      .where(
        and(
          eq(piRuns.applicationId, applicationId),
          inArray(piRuns.status, ["queued", "running"]),
        ),
      )
      .get(),
  );
}

export function listMessages(chatId: string) {
  return db()
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.createdAt), asc(rowId))
    .all();
}

// Decisions

export function insertDecision(input: {
  applicationId: string;
  sourceMessageId: string;
  kind: Decision["kind"];
  label: string;
  value: string;
}) {
  const decision: Decision = {
    ...input,
    id: randomUUID(),
    supersededById: null,
    createdAt: now(),
  };
  db().insert(decisions).values(decision).run();
  return decision;
}

export function getDecision(id: string) {
  return (
    db().select().from(decisions).where(eq(decisions.id, id)).get() ?? null
  );
}

export function getActiveDecision(applicationId: string, id: string) {
  return (
    db()
      .select()
      .from(decisions)
      .where(
        and(
          eq(decisions.id, id),
          eq(decisions.applicationId, applicationId),
          isNull(decisions.supersededById),
        ),
      )
      .get() ?? null
  );
}

export function listActiveDecisions(applicationId: string) {
  return db()
    .select()
    .from(decisions)
    .where(
      and(
        eq(decisions.applicationId, applicationId),
        isNull(decisions.supersededById),
      ),
    )
    .orderBy(asc(decisions.createdAt), asc(rowId))
    .all();
}

export function supersedeDecision(
  applicationId: string,
  previousId: string,
  replacementId: string,
) {
  const result = db()
    .update(decisions)
    .set({ supersededById: replacementId })
    .where(
      and(
        eq(decisions.id, previousId),
        eq(decisions.applicationId, applicationId),
        isNull(decisions.supersededById),
        sql`${decisions.id} <> ${replacementId}`,
        sql`exists (select 1 from decisions as replacement where replacement.id = ${replacementId} and replacement.application_id = ${applicationId} and replacement.superseded_by_id is null)`,
      ),
    )
    .returning()
    .get();
  if (!result) {
    throw new Error(
      "The Decision being corrected is missing, already replaced, or belongs to another application.",
    );
  }
  return result;
}

// Observations

export function insertObservation(
  input: Omit<Observation, "id" | "observedAt">,
) {
  const observation: Observation = {
    ...input,
    id: randomUUID(),
    observedAt: now(),
  };
  db().insert(observations).values(observation).run();
  return observation;
}

export function getObservation(id: string) {
  return (
    db().select().from(observations).where(eq(observations.id, id)).get() ??
    null
  );
}

export function latestObservation(applicationId: string, kind: string) {
  return (
    db()
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.applicationId, applicationId),
          eq(observations.kind, kind),
        ),
      )
      .orderBy(desc(observations.observedAt), desc(rowId))
      .limit(1)
      .get() ?? null
  );
}

export function listObservations(applicationId: string) {
  return db()
    .select()
    .from(observations)
    .where(eq(observations.applicationId, applicationId))
    .orderBy(desc(observations.observedAt), desc(rowId))
    .all();
}

/** The saved read of one repository path at one commit, if any. Reads are
 * pinned to a commit, so a later connection cannot change their content. */
export function findRepositoryFileObservation(
  applicationId: string,
  commitSha: string,
  path: string,
) {
  return (
    db()
      .select()
      .from(observations)
      .where(
        and(
          eq(observations.applicationId, applicationId),
          eq(observations.kind, "github-repository-file"),
          sql`${observations.sourceUrl} LIKE (SELECT repository_url FROM applications WHERE id = ${applicationId}) || '/blob/%'`,
          eq(observations.status, "passed"),
          sql`json_extract(${observations.raw}, '$.commitSha') = ${commitSha}`,
          sql`json_extract(${observations.raw}, '$.path') = ${path}`,
        ),
      )
      .orderBy(desc(observations.observedAt), desc(rowId))
      .limit(1)
      .get() ?? null
  );
}

export function listRepositoryFileObservations(
  applicationId: string,
  commitSha: string,
) {
  return db()
    .select()
    .from(observations)
    .where(
      and(
        eq(observations.applicationId, applicationId),
        eq(observations.kind, "github-repository-file"),
        sql`${observations.sourceUrl} LIKE (SELECT repository_url FROM applications WHERE id = ${applicationId}) || '/blob/%'`,
        eq(observations.status, "passed"),
        sql`json_extract(${observations.raw}, '$.commitSha') = ${commitSha}`,
      ),
    )
    .orderBy(asc(observations.observedAt), asc(rowId))
    .all();
}

export function updateApplicationSetup(
  applicationId: string,
  input: Pick<
    ApplicationRecord,
    | "name"
    | "repositoryUrl"
    | "repositoryOwner"
    | "repositoryName"
    | "approvalMode"
  >,
) {
  return db()
    .update(applications)
    .set({ ...input, updatedAt: now() })
    .where(eq(applications.id, applicationId))
    .returning()
    .get()!;
}

// Application Contracts

export function insertContract(input: {
  applicationId: string;
  workspaceId: string;
  version: number;
  sourceMessageId: string;
  body: ApplicationContractBody;
}) {
  const contract: ApplicationContractRecord = {
    id: randomUUID(),
    applicationId: input.applicationId,
    workspaceId: input.workspaceId,
    version: input.version,
    profileId: input.body.profileId,
    profileVersion: input.body.profileVersion,
    commitSha: input.body.commitSha,
    sourceMessageId: input.sourceMessageId,
    body: input.body,
    supersededById: null,
    createdAt: now(),
  };
  db().insert(applicationContracts).values(contract).run();
  return contract;
}

export function getContract(id: string) {
  return (
    db()
      .select()
      .from(applicationContracts)
      .where(eq(applicationContracts.id, id))
      .get() ?? null
  );
}

/** The application's active contract: the one no revision has superseded. */
export function currentContract(applicationId: string) {
  return (
    db()
      .select()
      .from(applicationContracts)
      .where(
        and(
          eq(applicationContracts.applicationId, applicationId),
          isNull(applicationContracts.supersededById),
        ),
      )
      .orderBy(desc(applicationContracts.version))
      .limit(1)
      .get() ?? null
  );
}

export function listContracts(applicationId: string) {
  return db()
    .select()
    .from(applicationContracts)
    .where(eq(applicationContracts.applicationId, applicationId))
    .orderBy(asc(applicationContracts.version))
    .all();
}

/** Guarded like supersedeDecision: the previous contract must still be the
 * active one of this application. */
export function supersedeContract(
  applicationId: string,
  previousId: string,
  replacementId: string,
) {
  const result = db()
    .update(applicationContracts)
    .set({ supersededById: replacementId })
    .where(
      and(
        eq(applicationContracts.id, previousId),
        eq(applicationContracts.applicationId, applicationId),
        isNull(applicationContracts.supersededById),
        sql`${applicationContracts.id} <> ${replacementId}`,
        sql`exists (select 1 from application_contracts as replacement where replacement.id = ${replacementId} and replacement.application_id = ${applicationId} and replacement.superseded_by_id is null)`,
      ),
    )
    .returning()
    .get();
  if (!result) {
    throw new Error(
      "The Application Contract being revised is missing, already revised, or belongs to another application.",
    );
  }
  return result;
}

// Conformance proposals (Phase 3)

export function insertConformanceProposal(
  input: Omit<ConformanceProposalRecord, "id" | "createdAt">,
) {
  const proposal: ConformanceProposalRecord = {
    ...input,
    id: randomUUID(),
    createdAt: now(),
  };
  db().insert(conformanceProposals).values(proposal).run();
  return proposal;
}

export function getConformanceProposal(id: string) {
  return (
    db()
      .select()
      .from(conformanceProposals)
      .where(eq(conformanceProposals.id, id))
      .get() ?? null
  );
}

/** The workspace's active proposal: neither superseded nor withdrawn. */
export function activeConformanceProposal(workspaceId: string) {
  return (
    db()
      .select()
      .from(conformanceProposals)
      .where(
        and(
          eq(conformanceProposals.workspaceId, workspaceId),
          isNull(conformanceProposals.supersededById),
          notInArray(conformanceProposals.status, ["withdrawn", "superseded"]),
        ),
      )
      .orderBy(desc(conformanceProposals.createdAt), desc(rowId))
      .limit(1)
      .get() ?? null
  );
}

export function listConformanceProposals(applicationId: string) {
  return db()
    .select()
    .from(conformanceProposals)
    .where(eq(conformanceProposals.applicationId, applicationId))
    .orderBy(asc(conformanceProposals.createdAt), asc(rowId))
    .all();
}

/**
 * Guarded update of one proposal: the row must still be in one of the
 * expected states, so a lost receipt or a concurrent action cannot overwrite
 * a later outcome. Returns the updated row or null when the guard failed.
 */
export function updateConformanceProposal(
  id: string,
  expectedStatuses: ConformanceProposalRecord["status"][],
  patch: Partial<
    Pick<
      ConformanceProposalRecord,
      | "status"
      | "approval"
      | "publication"
      | "publicationError"
      | "external"
      | "candidate"
      | "verification"
      | "supersededById"
    >
  >,
) {
  return (
    db()
      .update(conformanceProposals)
      .set(patch)
      .where(
        and(
          eq(conformanceProposals.id, id),
          inArray(conformanceProposals.status, expectedStatuses),
        ),
      )
      .returning()
      .get() ?? null
  );
}

// Conformance runs (Phase 3)

export function insertConformanceRun(
  input: Omit<ConformanceRunRecord, "id" | "createdAt">,
) {
  const run: ConformanceRunRecord = {
    ...input,
    id: randomUUID(),
    createdAt: now(),
  };
  db().insert(conformanceRuns).values(run).run();
  return run;
}

export function getConformanceRun(id: string) {
  return (
    db()
      .select()
      .from(conformanceRuns)
      .where(eq(conformanceRuns.id, id))
      .get() ?? null
  );
}

export function listConformanceRuns(applicationId: string) {
  return db()
    .select()
    .from(conformanceRuns)
    .where(eq(conformanceRuns.applicationId, applicationId))
    .orderBy(desc(conformanceRuns.createdAt), desc(rowId))
    .all();
}

export function listPendingConformanceRuns() {
  return db()
    .select()
    .from(conformanceRuns)
    .where(inArray(conformanceRuns.status, ["queued", "running"]))
    .orderBy(asc(conformanceRuns.createdAt), asc(rowId))
    .all();
}

/** Guarded status change; returns null when the run left the expected
 * states. */
export function updateConformanceRun(
  id: string,
  expectedStatuses: ConformanceRunRecord["status"][],
  patch: Partial<
    Pick<
      ConformanceRunRecord,
      | "status"
      | "results"
      | "summary"
      | "error"
      | "imageDigest"
      | "configuration"
      | "startedAt"
      | "finishedAt"
      | "source"
    >
  >,
) {
  return (
    db()
      .update(conformanceRuns)
      .set(patch)
      .where(
        and(
          eq(conformanceRuns.id, id),
          inArray(conformanceRuns.status, expectedStatuses),
        ),
      )
      .returning()
      .get() ?? null
  );
}

// Acceptance checks (Phase 3)

export function insertAcceptanceChecks(
  input: Omit<AcceptanceChecksRecord, "id" | "createdAt">,
) {
  const record: AcceptanceChecksRecord = {
    ...input,
    id: randomUUID(),
    createdAt: now(),
  };
  db().insert(acceptanceChecks).values(record).run();
  return record;
}

export function getAcceptanceChecks(id: string) {
  return (
    db()
      .select()
      .from(acceptanceChecks)
      .where(eq(acceptanceChecks.id, id))
      .get() ?? null
  );
}

export function listAcceptanceChecks(applicationId: string) {
  return db()
    .select()
    .from(acceptanceChecks)
    .where(eq(acceptanceChecks.applicationId, applicationId))
    .orderBy(asc(acceptanceChecks.version))
    .all();
}

/** The accepted definition the runner executes, if any. */
export function acceptedAcceptanceChecks(applicationId: string) {
  return (
    db()
      .select()
      .from(acceptanceChecks)
      .where(
        and(
          eq(acceptanceChecks.applicationId, applicationId),
          eq(acceptanceChecks.status, "accepted"),
          isNull(acceptanceChecks.supersededById),
        ),
      )
      .orderBy(desc(acceptanceChecks.version))
      .limit(1)
      .get() ?? null
  );
}

/** The newest proposed definition awaiting acceptance, if any. */
export function proposedAcceptanceChecks(applicationId: string) {
  return (
    db()
      .select()
      .from(acceptanceChecks)
      .where(
        and(
          eq(acceptanceChecks.applicationId, applicationId),
          eq(acceptanceChecks.status, "proposed"),
          isNull(acceptanceChecks.supersededById),
        ),
      )
      .orderBy(desc(acceptanceChecks.version))
      .limit(1)
      .get() ?? null
  );
}

export function updateAcceptanceChecks(
  id: string,
  expectedStatuses: AcceptanceChecksRecord["status"][],
  patch: Partial<
    Pick<
      AcceptanceChecksRecord,
      "status" | "acceptedAt" | "acceptedBy" | "supersededById"
    >
  >,
) {
  return (
    db()
      .update(acceptanceChecks)
      .set(patch)
      .where(
        and(
          eq(acceptanceChecks.id, id),
          inArray(acceptanceChecks.status, expectedStatuses),
        ),
      )
      .returning()
      .get() ?? null
  );
}

// Publication grants (Phase 3)

export function insertPublicationGrant(
  input: Omit<PublicationGrantRecord, "id" | "grantedAt" | "revokedAt">,
) {
  const grant: PublicationGrantRecord = {
    ...input,
    id: randomUUID(),
    grantedAt: now(),
    revokedAt: null,
  };
  db().insert(publicationGrants).values(grant).run();
  return grant;
}

export function activePublicationGrant(applicationId: string) {
  return (
    db()
      .select()
      .from(publicationGrants)
      .where(
        and(
          eq(publicationGrants.applicationId, applicationId),
          isNull(publicationGrants.revokedAt),
        ),
      )
      .orderBy(desc(publicationGrants.grantedAt), desc(rowId))
      .limit(1)
      .get() ?? null
  );
}

export function revokePublicationGrants(applicationId: string) {
  return db()
    .update(publicationGrants)
    .set({ revokedAt: now() })
    .where(
      and(
        eq(publicationGrants.applicationId, applicationId),
        isNull(publicationGrants.revokedAt),
      ),
    )
    .run().changes;
}

// Activity

export function insertActivity(
  workspaceId: string,
  kind: string,
  summary: string,
  detail: string,
) {
  const activity: ActivityEvent = {
    id: randomUUID(),
    workspaceId,
    kind,
    summary,
    detail,
    createdAt: now(),
  };
  db().insert(activityEvents).values(activity).run();
}

/**
 * Records one event per deterministic ID. Retried or concurrent requests for
 * the same transition therefore cannot add a second feed item. Returns whether
 * this call recorded it.
 */
export function recordActivityOnce(
  id: string,
  workspaceId: string,
  kind: string,
  summary: string,
  detail: string,
) {
  const activity: ActivityEvent = {
    id,
    workspaceId,
    kind,
    summary,
    detail,
    createdAt: now(),
  };
  return (
    db().insert(activityEvents).values(activity).onConflictDoNothing().run()
      .changes > 0
  );
}

// Legacy reply/Chat administration rows remain stored, but are not domain
// Activity. New rich diagnostics go only to local logs and optional traces.
const EXCLUDED_ACTIVITY_KINDS = [
  "chat-execution",
  "chat-created",
  "chat-archived",
];

export function listActivity(workspaceId: string): ActivityEvent[] {
  return db()
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.workspaceId, workspaceId),
        notInArray(activityEvents.kind, EXCLUDED_ACTIVITY_KINDS),
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(rowId))
    .all();
}

let committedCallbacks: (() => void)[] | undefined;

// Diagnostic callbacks wait for the outermost commit. Nested rollback discards
// only its callbacks; a later outer rollback discards all queued claims.
export function withTransaction<T>(
  work: () => T,
  onCommit?: (value: T) => void,
): T {
  const parent = committedCallbacks;
  const callbacks: (() => void)[] = [];
  committedCallbacks = callbacks;
  try {
    const result = db().transaction(() => work(), { behavior: "immediate" });
    committedCallbacks = parent;
    if (onCommit) callbacks.push(() => onCommit(result));
    if (parent) parent.push(...callbacks);
    else
      for (const callback of callbacks) {
        try {
          callback();
        } catch {
          /* Diagnostics never alter committed state. */
        }
      }
    return result;
  } finally {
    committedCallbacks = parent;
  }
}

export function saveApplicationPreview(record: ApplicationPreview) {
  db()
    .insert(applicationPreviews)
    .values({ id: record.id, applicationId: record.applicationId, record })
    .onConflictDoUpdate({ target: applicationPreviews.id, set: { record } })
    .run();
  return record;
}
export function listApplicationPreviews(applicationId?: string) {
  const query = db().select().from(applicationPreviews);
  const rows = applicationId
    ? query.where(eq(applicationPreviews.applicationId, applicationId)).all()
    : query.all();
  return rows
    .map((row) => row.record)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function savePreparationBranch(record: PreparationBranch) {
  db()
    .insert(preparationBranches)
    .values({ id: record.id, applicationId: record.applicationId, record })
    .onConflictDoUpdate({ target: preparationBranches.id, set: { record } })
    .run();
  return record;
}
export function latestPreparationBranch(applicationId: string) {
  return (
    db()
      .select()
      .from(preparationBranches)
      .where(eq(preparationBranches.applicationId, applicationId))
      .all()
      .map((row) => row.record)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  );
}
