import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  ActivityEvent,
  ApplicationRecord,
  BlockerRecord,
  ChatMessage,
  ChatSession,
  DecisionRecord,
  ObservationRecord,
  PhaseWorkspace,
} from "./types";

type Sqlite = InstanceType<typeof Database>;

declare global {
  var __serverGuyDb: Sqlite | undefined;
}

const defaultDbPath = join(process.cwd(), ".server-guy", "server-guy.db");

function createDatabase(): Sqlite {
  const databasePath = process.env.SERVER_GUY_DB_PATH ?? defaultDbPath;
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  migrate(database);
  return database;
}

export function db(): Sqlite {
  if (process.env.NODE_ENV === "production") {
    return (globalThis.__serverGuyDb ??= createDatabase());
  }
  return (globalThis.__serverGuyDb ??= createDatabase());
}

function migrate(database: Sqlite) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      repository_url TEXT NOT NULL UNIQUE,
      repository_owner TEXT NOT NULL,
      repository_name TEXT NOT NULL,
      environment TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      approval_scope TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS phase_workspaces (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      phase_number INTEGER NOT NULL,
      deliverable TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(application_id, phase_number),
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      session_id TEXT,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace_id, key),
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_label TEXT NOT NULL,
      source_url TEXT,
      raw_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS blockers (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL,
      owner TEXT NOT NULL,
      resolution_path TEXT NOT NULL,
      required_before_phase INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      UNIQUE(workspace_id, key),
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_observations_workspace ON observations(workspace_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity_events(workspace_id, created_at DESC);
  `);
}

function mapApplication(row: Record<string, unknown>): ApplicationRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    repositoryUrl: row.repository_url as string,
    repositoryOwner: row.repository_owner as string,
    repositoryName: row.repository_name as string,
    environment: row.environment as "production",
    approvalMode: row.approval_mode as ApplicationRecord["approvalMode"],
    approvalScope: row.approval_scope as string,
    status: row.status as ApplicationRecord["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapWorkspace(row: Record<string, unknown>): PhaseWorkspace {
  return {
    id: row.id as string,
    applicationId: row.application_id as string,
    phaseNumber: 1,
    deliverable: "Launch Brief",
    status: row.status as PhaseWorkspace["status"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapSession(row: Record<string, unknown>): ChatSession {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    title: row.title as string,
    isPrimary: Boolean(row.is_primary),
    status: row.status as ChatSession["status"],
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  };
}

function mapMessage(row: Record<string, unknown>): ChatMessage {
  return {
    id: row.id as string,
    sessionId: row.session_id as string,
    role: row.role as ChatMessage["role"],
    body: row.body as string,
    source: row.source as ChatMessage["source"],
    createdAt: row.created_at as string,
  };
}

function mapDecision(row: Record<string, unknown>): DecisionRecord {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    sessionId: (row.session_id as string | null) ?? null,
    key: row.key as string,
    label: row.label as string,
    value: row.value as string,
    source: row.source as DecisionRecord["source"],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapObservation(row: Record<string, unknown>): ObservationRecord {
  return {
    id: row.id as string,
    applicationId: row.application_id as string,
    workspaceId: row.workspace_id as string,
    kind: row.kind as string,
    status: row.status as ObservationRecord["status"],
    summary: row.summary as string,
    sourceLabel: row.source_label as string,
    sourceUrl: (row.source_url as string | null) ?? null,
    raw: JSON.parse(row.raw_json as string),
    observedAt: row.observed_at as string,
  };
}

function mapBlocker(row: Record<string, unknown>): BlockerRecord {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    key: row.key as string,
    label: row.label as string,
    status: row.status as BlockerRecord["status"],
    owner: row.owner as BlockerRecord["owner"],
    resolutionPath: row.resolution_path as string,
    requiredBeforePhase: row.required_before_phase as number,
    createdAt: row.created_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
  };
}

function mapActivity(row: Record<string, unknown>): ActivityEvent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    kind: row.kind as string,
    summary: row.summary as string,
    detail: row.detail as string,
    createdAt: row.created_at as string,
  };
}

export function getLatestApplication(): ApplicationRecord | null {
  const row = db().prepare("SELECT * FROM applications ORDER BY created_at DESC LIMIT 1").get() as
    | Record<string, unknown>
    | undefined;
  return row ? mapApplication(row) : null;
}

export function getApplication(id: string): ApplicationRecord | null {
  const row = db().prepare("SELECT * FROM applications WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapApplication(row) : null;
}

export function getApplicationByRepository(repositoryUrl: string): ApplicationRecord | null {
  const row = db().prepare("SELECT * FROM applications WHERE repository_url = ?").get(repositoryUrl) as
    | Record<string, unknown>
    | undefined;
  return row ? mapApplication(row) : null;
}

export function insertApplication(input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(
    `INSERT INTO applications
      (id, name, slug, repository_url, repository_owner, repository_name, environment,
       approval_mode, approval_scope, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.slug,
    input.repositoryUrl,
    input.repositoryOwner,
    input.repositoryName,
    input.environment,
    input.approvalMode,
    input.approvalScope,
    input.status,
    now,
    now,
  );
  return getApplication(id)!;
}

export function updateApplicationStatus(id: string, status: ApplicationRecord["status"]) {
  db().prepare("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    id,
  );
}

export function updateApprovalMode(id: string, approvalMode: ApplicationRecord["approvalMode"]) {
  db().prepare("UPDATE applications SET approval_mode = ?, updated_at = ? WHERE id = ?").run(
    approvalMode,
    new Date().toISOString(),
    id,
  );
}

export function insertWorkspace(applicationId: string): PhaseWorkspace {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(
    `INSERT INTO phase_workspaces
      (id, application_id, phase_number, deliverable, status, created_at, updated_at)
     VALUES (?, ?, 1, 'Launch Brief', 'in-progress', ?, ?)`,
  ).run(id, applicationId, now, now);
  return getWorkspace(applicationId)!;
}

export function getWorkspace(applicationId: string): PhaseWorkspace | null {
  const row = db()
    .prepare("SELECT * FROM phase_workspaces WHERE application_id = ? AND phase_number = 1")
    .get(applicationId) as Record<string, unknown> | undefined;
  return row ? mapWorkspace(row) : null;
}

export function getWorkspaceById(id: string): PhaseWorkspace | null {
  const row = db().prepare("SELECT * FROM phase_workspaces WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapWorkspace(row) : null;
}

export function updateWorkspaceStatus(id: string, status: PhaseWorkspace["status"]) {
  db().prepare("UPDATE phase_workspaces SET status = ?, updated_at = ? WHERE id = ?").run(
    status,
    new Date().toISOString(),
    id,
  );
}

export function insertSession(
  workspaceId: string,
  title: string,
  isPrimary = false,
): ChatSession {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(
    `INSERT INTO sessions (id, workspace_id, title, is_primary, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  ).run(id, workspaceId, title, isPrimary ? 1 : 0, now);
  return getSession(id)!;
}

export function getSession(id: string): ChatSession | null {
  const row = db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSession(row) : null;
}

export function listSessions(workspaceId: string): ChatSession[] {
  return (
    db()
      .prepare("SELECT * FROM sessions WHERE workspace_id = ? ORDER BY created_at ASC")
      .all(workspaceId) as Record<string, unknown>[]
  ).map(mapSession);
}

export function resolveSession(id: string) {
  db().prepare("UPDATE sessions SET status = 'resolved', resolved_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

export function insertMessage(
  sessionId: string,
  role: ChatMessage["role"],
  body: string,
  source: ChatMessage["source"],
): ChatMessage {
  const id = randomUUID();
  const now = new Date().toISOString();
  db().prepare(
    "INSERT INTO messages (id, session_id, role, body, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, sessionId, role, body, source, now);
  return mapMessage(
    db().prepare("SELECT * FROM messages WHERE id = ?").get(id) as Record<string, unknown>,
  );
}

export function listMessages(sessionId: string): ChatMessage[] {
  return (
    db()
      .prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC")
      .all(sessionId) as Record<string, unknown>[]
  ).map(mapMessage);
}

export function upsertDecision(input: {
  workspaceId: string;
  sessionId?: string | null;
  key: string;
  label: string;
  value: string;
  source: DecisionRecord["source"];
}) {
  const existing = db()
    .prepare("SELECT id, created_at FROM decisions WHERE workspace_id = ? AND key = ?")
    .get(input.workspaceId, input.key) as { id: string; created_at: string } | undefined;
  const now = new Date().toISOString();
  if (existing) {
    db().prepare(
      `UPDATE decisions SET session_id = ?, label = ?, value = ?, source = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.sessionId ?? null, input.label, input.value, input.source, now, existing.id);
    return;
  }
  db().prepare(
    `INSERT INTO decisions
      (id, workspace_id, session_id, key, label, value, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    input.workspaceId,
    input.sessionId ?? null,
    input.key,
    input.label,
    input.value,
    input.source,
    now,
    now,
  );
}

export function listDecisions(workspaceId: string): DecisionRecord[] {
  return (
    db()
      .prepare("SELECT * FROM decisions WHERE workspace_id = ? ORDER BY created_at ASC")
      .all(workspaceId) as Record<string, unknown>[]
  ).map(mapDecision);
}

export function getDecision(id: string): DecisionRecord | null {
  const row = db().prepare("SELECT * FROM decisions WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapDecision(row) : null;
}

export function insertObservation(input: Omit<ObservationRecord, "id" | "observedAt">) {
  const id = randomUUID();
  const observedAt = new Date().toISOString();
  db().prepare(
    `INSERT INTO observations
      (id, application_id, workspace_id, kind, status, summary, source_label, source_url, raw_json, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.applicationId,
    input.workspaceId,
    input.kind,
    input.status,
    input.summary,
    input.sourceLabel,
    input.sourceUrl,
    JSON.stringify(input.raw),
    observedAt,
  );
  return getObservation(id)!;
}

export function getObservation(id: string): ObservationRecord | null {
  const row = db().prepare("SELECT * FROM observations WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapObservation(row) : null;
}

export function latestObservation(workspaceId: string, kind: string): ObservationRecord | null {
  const row = db()
    .prepare(
      "SELECT * FROM observations WHERE workspace_id = ? AND kind = ? ORDER BY observed_at DESC LIMIT 1",
    )
    .get(workspaceId, kind) as Record<string, unknown> | undefined;
  return row ? mapObservation(row) : null;
}

export function listObservations(workspaceId: string): ObservationRecord[] {
  return (
    db()
      .prepare("SELECT * FROM observations WHERE workspace_id = ? ORDER BY observed_at DESC")
      .all(workspaceId) as Record<string, unknown>[]
  ).map(mapObservation);
}

export function upsertBlocker(input: Omit<BlockerRecord, "id" | "createdAt" | "resolvedAt">) {
  const now = new Date().toISOString();
  db().prepare(
    `INSERT INTO blockers
      (id, workspace_id, key, label, status, owner, resolution_path, required_before_phase, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(workspace_id, key) DO UPDATE SET
       label = excluded.label,
       status = excluded.status,
       owner = excluded.owner,
       resolution_path = excluded.resolution_path,
       required_before_phase = excluded.required_before_phase,
       resolved_at = CASE WHEN excluded.status = 'resolved' THEN ? ELSE NULL END`,
  ).run(
    randomUUID(),
    input.workspaceId,
    input.key,
    input.label,
    input.status,
    input.owner,
    input.resolutionPath,
    input.requiredBeforePhase,
    now,
    now,
  );
}

export function listBlockers(workspaceId: string): BlockerRecord[] {
  return (
    db()
      .prepare("SELECT * FROM blockers WHERE workspace_id = ? ORDER BY required_before_phase, created_at")
      .all(workspaceId) as Record<string, unknown>[]
  ).map(mapBlocker);
}

export function resolveBlocker(workspaceId: string, key: string) {
  db().prepare(
    "UPDATE blockers SET status = 'resolved', resolved_at = ? WHERE workspace_id = ? AND key = ?",
  ).run(new Date().toISOString(), workspaceId, key);
}

export function insertActivity(
  workspaceId: string,
  kind: string,
  summary: string,
  detail: string,
) {
  db().prepare(
    "INSERT INTO activity_events (id, workspace_id, kind, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, kind, summary, detail, new Date().toISOString());
}

export function listActivity(workspaceId: string): ActivityEvent[] {
  return (
    db()
      .prepare("SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC")
      .all(workspaceId) as Record<string, unknown>[]
  ).map(mapActivity);
}

export function withTransaction<T>(work: () => T): T {
  return db().transaction(work)();
}
