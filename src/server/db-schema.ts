import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

import type {
  AcceptanceChecksRecord,
  AcceptanceStep,
  ActivityEvent,
  ApplicationContractBody,
  ApplicationContractRecord,
  ApplicationRecord,
  CandidateResolution,
  CandidateVerification,
  Chat,
  ChatMessage,
  ConformanceCheckResult,
  ConformanceMappingEntry,
  ConformanceProposalRecord,
  ConformanceRunConfiguration,
  ConformanceRunRecord,
  ConformanceRunSource,
  Decision,
  ExternalReturn,
  Observation,
  PhaseWorkspaceRecord,
  PiRun,
  ProposalApproval,
  ProposalPublication,
  ProposedFileChange,
  PublicationGrantRecord,
  RepositoryCitation,
} from "./types";

export const applications = sqliteTable("applications", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repositoryUrl: text("repository_url").notNull().unique(),
  repositoryOwner: text("repository_owner").notNull(),
  repositoryName: text("repository_name").notNull(),
  environment: text("environment")
    .$type<ApplicationRecord["environment"]>()
    .notNull(),
  approvalMode: text("approval_mode")
    .$type<ApplicationRecord["approvalMode"]>()
    .notNull(),
  approvalScope: text("approval_scope").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const phaseWorkspaces = sqliteTable(
  "phase_workspaces",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    phaseKey: text("phase_key")
      .$type<PhaseWorkspaceRecord["phaseKey"]>()
      .notNull(),
    createdAt: text("created_at").notNull(),
    completedAt: text("completed_at"),
    deliverableEvidence: text("deliverable_evidence", { mode: "json" }),
  },
  (table) => [unique().on(table.applicationId, table.phaseKey)],
);

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  isPrimary: integer("is_primary", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull(),
  archivedAt: text("archived_at"),
  nativeSessionId: text("native_session_id"),
});

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    role: text("role").$type<ChatMessage["role"]>().notNull(),
    body: text("body").notNull(),
    source: text("source").$type<ChatMessage["source"]>().notNull(),
    status: text("status")
      .$type<ChatMessage["status"]>()
      .notNull()
      .default("completed"),
    revision: integer("revision").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_messages_chat").on(table.chatId, table.createdAt)],
);

export const piRuns = sqliteTable(
  "pi_runs",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    userMessageId: text("user_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    assistantMessageId: text("assistant_message_id")
      .notNull()
      .unique()
      .references(() => messages.id, { onDelete: "cascade" }),
    requestKey: text("request_key").notNull(),
    // Retain lineage without a self-FK interfering with application cascades.
    retryOfId: text("retry_of_id").unique(),
    status: text("status").$type<PiRun["status"]>().notNull(),
    revision: integer("revision").notNull().default(0),
    error: text("error"),
    piCalls: integer("pi_calls").notNull().default(0),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (table) => [
    unique().on(table.chatId, table.requestKey),
    index("idx_pi_runs_queue").on(table.status, table.createdAt),
    index("idx_pi_runs_chat").on(table.chatId),
  ],
);

export const chatSummaries = sqliteTable("chat_summaries", {
  chatId: text("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  coveredMessageId: text("covered_message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  updatedAt: text("updated_at").notNull(),
});

export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    kind: text("kind").$type<Decision["kind"]>().notNull(),
    label: text("label").notNull(),
    value: text("value").notNull(),
    supersededById: text("superseded_by_id").references(
      (): AnySQLiteColumn => decisions.id,
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_decisions_application").on(table.applicationId, table.createdAt),
  ],
);

export const observations = sqliteTable(
  "observations",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    status: text("status").$type<Observation["status"]>().notNull(),
    summary: text("summary").notNull(),
    sourceLabel: text("source_label").notNull(),
    sourceUrl: text("source_url"),
    raw: text("raw_json", { mode: "json" }).notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (table) => [
    index("idx_observations_application_kind").on(
      table.applicationId,
      table.kind,
      sql`${table.observedAt} desc`,
    ),
  ],
);

/**
 * Versioned Application Contracts. A revision is a new full row that
 * supersedes the previous one, like a replaced Decision; nothing is edited in
 * place. Rows are written only inside the worker's final Run transaction.
 */
export const applicationContracts = sqliteTable(
  "application_contracts",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    profileId: text("profile_id").notNull(),
    profileVersion: integer("profile_version").notNull(),
    commitSha: text("commit_sha").notNull(),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    body: text("body_json", { mode: "json" })
      .$type<ApplicationContractBody>()
      .notNull(),
    supersededById: text("superseded_by_id").references(
      (): AnySQLiteColumn => applicationContracts.id,
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.applicationId, table.version)],
);

/**
 * Phase 3 source-change proposals: Pi's staged changes, an external return or
 * the explicit no-change selection, with their approval, publication receipts
 * and the resolved candidate. One active row per workspace; a replacement
 * supersedes the previous one, like a Decision.
 */
export const conformanceProposals = sqliteTable(
  "conformance_proposals",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    origin: text("origin")
      .$type<ConformanceProposalRecord["origin"]>()
      .notNull(),
    status: text("status")
      .$type<ConformanceProposalRecord["status"]>()
      .notNull(),
    baseSha: text("base_sha").notNull(),
    contractId: text("contract_id").notNull(),
    contractVersion: integer("contract_version").notNull(),
    summary: text("summary").notNull(),
    changes: text("changes_json", { mode: "json" })
      .$type<ProposedFileChange[]>()
      .notNull(),
    filesDigest: text("files_digest").notNull(),
    mapping: text("mapping_json", { mode: "json" })
      .$type<ConformanceMappingEntry[]>()
      .notNull(),
    requestApproval: integer("request_approval", { mode: "boolean" })
      .notNull()
      .default(true),
    sourceMessageId: text("source_message_id"),
    piRunId: text("pi_run_id"),
    approval: text("approval_json", { mode: "json" }).$type<ProposalApproval>(),
    publication: text("publication_json", {
      mode: "json",
    }).$type<ProposalPublication>(),
    publicationError: text("publication_error"),
    external: text("external_json", { mode: "json" }).$type<ExternalReturn>(),
    candidate: text("candidate_json", {
      mode: "json",
    }).$type<CandidateResolution>(),
    verification: text("verification_json", {
      mode: "json",
    }).$type<CandidateVerification>(),
    supersededById: text("superseded_by_id").references(
      (): AnySQLiteColumn => conformanceProposals.id,
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_conformance_proposals_application").on(
      table.applicationId,
      table.createdAt,
    ),
  ],
);

/**
 * Executions over an exact tree: previews and commands inside a Pi Run, and
 * candidate runs the worker performs on request. Results are appended; the
 * gate reads the latest candidate run whose bindings are still current.
 */
export const conformanceRuns = sqliteTable(
  "conformance_runs",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ConformanceRunRecord["kind"]>().notNull(),
    status: text("status").$type<ConformanceRunRecord["status"]>().notNull(),
    source: text("source_json", { mode: "json" })
      .$type<ConformanceRunSource>()
      .notNull(),
    proposalId: text("proposal_id"),
    contractId: text("contract_id").notNull(),
    contractVersion: integer("contract_version").notNull(),
    profileId: text("profile_id").notNull(),
    profileVersion: integer("profile_version").notNull(),
    definitionVersion: integer("definition_version").notNull(),
    acceptanceChecksId: text("acceptance_checks_id"),
    acceptanceChecksVersion: integer("acceptance_checks_version"),
    imageDigest: text("image_digest"),
    configuration: text("configuration_json", {
      mode: "json",
    }).$type<ConformanceRunConfiguration>(),
    results: text("results_json", { mode: "json" })
      .$type<ConformanceCheckResult[]>()
      .notNull(),
    summary: text("summary").notNull(),
    error: text("error"),
    piRunId: text("pi_run_id"),
    createdAt: text("created_at").notNull(),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (table) => [
    index("idx_conformance_runs_application").on(
      table.applicationId,
      table.createdAt,
    ),
    index("idx_conformance_runs_queue").on(table.status, table.createdAt),
  ],
);

/** Versioned application-behavior checks; accepted rows are executed. */
export const acceptanceChecks = sqliteTable(
  "acceptance_checks",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").$type<AcceptanceChecksRecord["status"]>().notNull(),
    rationale: text("rationale").notNull(),
    steps: text("steps_json", { mode: "json" })
      .$type<AcceptanceStep[]>()
      .notNull(),
    evidence: text("evidence_json", { mode: "json" })
      .$type<RepositoryCitation[]>()
      .notNull(),
    digest: text("digest").notNull(),
    contractId: text("contract_id").notNull(),
    contractVersion: integer("contract_version").notNull(),
    sourceMessageId: text("source_message_id"),
    piRunId: text("pi_run_id"),
    acceptedAt: text("accepted_at"),
    acceptedBy:
      text("accepted_by").$type<AcceptanceChecksRecord["acceptedBy"]>(),
    supersededById: text("superseded_by_id").references(
      (): AnySQLiteColumn => acceptanceChecks.id,
    ),
    createdAt: text("created_at").notNull(),
  },
  (table) => [unique().on(table.applicationId, table.version)],
);

/** Explicit, verified permission to publish to one repository. */
export const publicationGrants = sqliteTable(
  "publication_grants",
  {
    id: text("id").primaryKey(),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    connectionId: text("connection_id").notNull(),
    mechanism: text("mechanism")
      .$type<PublicationGrantRecord["mechanism"]>()
      .notNull(),
    verifiedPermissions: text("verified_permissions_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    grantedAt: text("granted_at").notNull(),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    index("idx_publication_grants_application").on(table.applicationId),
  ],
);

export const activityEvents = sqliteTable(
  "activity_events",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => phaseWorkspaces.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    detail: text("detail").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_activity_workspace").on(
      table.workspaceId,
      sql`${table.createdAt} desc`,
    ),
  ],
);

type AssertExtends<Expected, Actual extends Expected> = Actual;

// This type fails compilation if any selected row drifts from its domain
// record.
export type DatabaseRowTypes = {
  application: AssertExtends<
    ApplicationRecord,
    typeof applications.$inferSelect
  >;
  workspace: AssertExtends<
    PhaseWorkspaceRecord,
    typeof phaseWorkspaces.$inferSelect
  >;
  chat: AssertExtends<Chat, typeof chats.$inferSelect>;
  message: AssertExtends<ChatMessage, typeof messages.$inferSelect>;
  run: AssertExtends<PiRun, typeof piRuns.$inferSelect>;
  decision: AssertExtends<Decision, typeof decisions.$inferSelect>;
  observation: AssertExtends<Observation, typeof observations.$inferSelect>;
  contract: AssertExtends<
    ApplicationContractRecord,
    typeof applicationContracts.$inferSelect
  >;
  conformanceProposal: AssertExtends<
    ConformanceProposalRecord,
    typeof conformanceProposals.$inferSelect
  >;
  conformanceRun: AssertExtends<
    ConformanceRunRecord,
    typeof conformanceRuns.$inferSelect
  >;
  acceptanceChecks: AssertExtends<
    AcceptanceChecksRecord,
    typeof acceptanceChecks.$inferSelect
  >;
  publicationGrant: AssertExtends<
    PublicationGrantRecord,
    typeof publicationGrants.$inferSelect
  >;
  activity: AssertExtends<ActivityEvent, typeof activityEvents.$inferSelect>;
};
