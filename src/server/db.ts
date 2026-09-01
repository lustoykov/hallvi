import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  ActivityEvent,
  ApplicationRecord,
  BlockerRecord,
  DecisionRecord,
  ObservationRecord,
  OperatorMessage,
  OperatorSession,
  PhaseWorkspace,
} from "./types";

type Sqlite = InstanceType<typeof Database>;
type Row = Record<string, unknown>;

declare global {
  var __serverGuyDb: Sqlite | undefined;
}

const SCHEMA_VERSION = 2;
const defaultDbPath = join(process.cwd(), ".server-guy", "server-guy.db");

export function db(): Sqlite {
  return (globalThis.__serverGuyDb ??= createDatabase());
}

function createDatabase(): Sqlite {
  const databasePath = process.env.SERVER_GUY_DB_PATH ?? defaultDbPath;
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new Database(databasePath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    migrate(database, databasePath);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function migrate(database: Sqlite, databasePath: string) {
  const version = database.pragma("user_version", { simple: true }) as number;
  const initialized = Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'applications'")
      .get(),
  );
  if (initialized && version !== SCHEMA_VERSION) {
    throw new Error(
      `${databasePath} was created by an older Server Guy schema. Delete it to start with a fresh Operator Record.`,
    );
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repository_url TEXT NOT NULL UNIQUE,
      repository_owner TEXT NOT NULL,
      repository_name TEXT NOT NULL,
      environment TEXT NOT NULL,
      approval_mode TEXT NOT NULL,
      approval_scope TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS operator_sessions (
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
      operator_session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(operator_session_id) REFERENCES operator_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS decision_records (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      operator_session_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY(operator_session_id) REFERENCES operator_sessions(id) ON DELETE RESTRICT
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

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(operator_session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_decision_records_workspace ON decision_records(workspace_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_observations_workspace ON observations(workspace_id, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_workspace ON activity_events(workspace_id, created_at DESC);
  `);
  database.pragma(`user_version = ${SCHEMA_VERSION}`);
}

// Rows are snake_case columns; records are the camelCase types in ./types.
function fromRow<T>(row: Row): T {
  const record: Row = {};
  for (const [column, value] of Object.entries(row)) {
    record[column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] = value;
  }
  return record as T;
}

const toSession = (row: Row) =>
  fromRow<OperatorSession>({ ...row, is_primary: Boolean(row.is_primary) });

const toObservation = ({ raw_json, ...row }: Row) =>
  fromRow<ObservationRecord>({ ...row, raw: JSON.parse(raw_json as string) });

function one<T>(sql: string, params: unknown[], map: (row: Row) => T = fromRow): T | null {
  const row = db().prepare(sql).get(...params) as Row | undefined;
  return row ? map(row) : null;
}

function many<T>(sql: string, params: unknown[], map: (row: Row) => T = fromRow): T[] {
  return (db().prepare(sql).all(...params) as Row[]).map(map);
}

function now() {
  return new Date().toISOString();
}

// Applications

export function getLatestApplication() {
  return one<ApplicationRecord>("SELECT * FROM applications ORDER BY created_at DESC LIMIT 1", []);
}

export function getApplication(id: string) {
  return one<ApplicationRecord>("SELECT * FROM applications WHERE id = ?", [id]);
}

export function getApplicationByRepository(repositoryUrl: string) {
  return one<ApplicationRecord>("SELECT * FROM applications WHERE repository_url = ?", [
    repositoryUrl,
  ]);
}

export function insertApplication(input: Omit<ApplicationRecord, "id" | "createdAt" | "updatedAt">) {
  const id = randomUUID();
  const timestamp = now();
  db().prepare(
    `INSERT INTO applications
      (id, name, repository_url, repository_owner, repository_name, environment,
       approval_mode, approval_scope, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.repositoryUrl,
    input.repositoryOwner,
    input.repositoryName,
    input.environment,
    input.approvalMode,
    input.approvalScope,
    timestamp,
    timestamp,
  );
  return getApplication(id)!;
}

// Phase workspaces

export function insertWorkspace(applicationId: string) {
  const timestamp = now();
  db().prepare(
    `INSERT INTO phase_workspaces
      (id, application_id, phase_number, deliverable, status, created_at, updated_at)
     VALUES (?, ?, 1, 'Launch Brief', 'in-progress', ?, ?)`,
  ).run(randomUUID(), applicationId, timestamp, timestamp);
  return getWorkspace(applicationId)!;
}

export function getWorkspace(applicationId: string) {
  return one<PhaseWorkspace>(
    "SELECT * FROM phase_workspaces WHERE application_id = ? AND phase_number = 1",
    [applicationId],
  );
}

export function updateWorkspaceStatus(id: string, status: PhaseWorkspace["status"]) {
  db().prepare(
    "UPDATE phase_workspaces SET status = ?, updated_at = ? WHERE id = ? AND status <> ?",
  ).run(status, now(), id, status);
}

// Operator sessions and messages

export function insertOperatorSession(workspaceId: string, title: string, isPrimary = false) {
  const id = randomUUID();
  db().prepare(
    `INSERT INTO operator_sessions (id, workspace_id, title, is_primary, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
  ).run(id, workspaceId, title, isPrimary ? 1 : 0, now());
  return getOperatorSession(id)!;
}

export function getOperatorSession(id: string) {
  return one("SELECT * FROM operator_sessions WHERE id = ?", [id], toSession);
}

export function listOperatorSessions(workspaceId: string) {
  return many(
    "SELECT * FROM operator_sessions WHERE workspace_id = ? ORDER BY created_at ASC",
    [workspaceId],
    toSession,
  );
}

export function resolveOperatorSession(id: string) {
  db().prepare("UPDATE operator_sessions SET status = 'resolved', resolved_at = ? WHERE id = ?").run(
    now(),
    id,
  );
}

export function insertMessage(
  operatorSessionId: string,
  role: OperatorMessage["role"],
  body: string,
  source: OperatorMessage["source"],
) {
  const id = randomUUID();
  db().prepare(
    "INSERT INTO messages (id, operator_session_id, role, body, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, operatorSessionId, role, body, source, now());
  return one<OperatorMessage>("SELECT * FROM messages WHERE id = ?", [id])!;
}

export function listMessages(operatorSessionId: string) {
  return many<OperatorMessage>(
    "SELECT * FROM messages WHERE operator_session_id = ? ORDER BY created_at ASC, rowid ASC",
    [operatorSessionId],
  );
}

// Decisions

export function insertDecision(input: {
  workspaceId: string;
  operatorSessionId: string;
  kind: DecisionRecord["kind"];
  label: string;
  value: string;
}) {
  const id = randomUUID();
  const timestamp = now();
  db().prepare(
    `INSERT INTO decision_records
      (id, workspace_id, operator_session_id, kind, label, value, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.workspaceId,
    input.operatorSessionId,
    input.kind,
    input.label,
    input.value,
    timestamp,
    timestamp,
  );
  return getDecision(id)!;
}

export function getDecision(id: string) {
  return one<DecisionRecord>("SELECT * FROM decision_records WHERE id = ?", [id]);
}

export function listDecisions(workspaceId: string) {
  return many<DecisionRecord>(
    "SELECT * FROM decision_records WHERE workspace_id = ? ORDER BY created_at ASC, rowid ASC",
    [workspaceId],
  );
}

// Observations

export function insertObservation(input: Omit<ObservationRecord, "id" | "observedAt">) {
  const id = randomUUID();
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
    now(),
  );
  return getObservation(id)!;
}

export function getObservation(id: string) {
  return one("SELECT * FROM observations WHERE id = ?", [id], toObservation);
}

export function latestObservation(workspaceId: string, kind: string) {
  return one(
    "SELECT * FROM observations WHERE workspace_id = ? AND kind = ? ORDER BY observed_at DESC, rowid DESC LIMIT 1",
    [workspaceId, kind],
    toObservation,
  );
}

export function listObservations(workspaceId: string) {
  return many(
    "SELECT * FROM observations WHERE workspace_id = ? ORDER BY observed_at DESC, rowid DESC",
    [workspaceId],
    toObservation,
  );
}

// Blockers and activity

export function upsertBlocker(input: Omit<BlockerRecord, "id" | "createdAt" | "resolvedAt">) {
  const timestamp = now();
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
    timestamp,
    timestamp,
  );
}

export function listBlockers(workspaceId: string) {
  return many<BlockerRecord>(
    "SELECT * FROM blockers WHERE workspace_id = ? ORDER BY required_before_phase, created_at",
    [workspaceId],
  );
}

export function insertActivity(workspaceId: string, kind: string, summary: string, detail: string) {
  db().prepare(
    "INSERT INTO activity_events (id, workspace_id, kind, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, kind, summary, detail, now());
}

export function listActivity(workspaceId: string) {
  return many<ActivityEvent>(
    "SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC",
    [workspaceId],
  );
}

export function withTransaction<T>(work: () => T): T {
  return db().transaction(work)();
}
