import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import type {
  ActivityEvent,
  ApplicationRecord,
  Chat,
  ChatMessage,
  Decision,
  Observation,
  PhaseWorkspaceRecord,
} from "./types";

type Sqlite = InstanceType<typeof Database>;
type Row = Record<string, unknown>;

declare global {
  var __serverGuyDb: Sqlite | undefined;
}

const SCHEMA_VERSION = 3;
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
    initializeSchema(database, databasePath);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

function initializeSchema(database: Sqlite, databasePath: string) {
  const version = database.pragma("user_version", { simple: true }) as number;
  const initialized = Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'applications'")
      .get(),
  );
  if (initialized && version !== SCHEMA_VERSION) {
    throw new Error(
      `${databasePath} uses an older prototype schema. Delete it and restart Server Guy.`,
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
      phase_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(application_id, phase_key),
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      archived_at TEXT,
      FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      source_message_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      superseded_by_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE,
      FOREIGN KEY(source_message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY(superseded_by_id) REFERENCES decisions(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS observations (
      id TEXT PRIMARY KEY,
      application_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      source_label TEXT NOT NULL,
      source_url TEXT,
      raw_json TEXT NOT NULL,
      observed_at TEXT NOT NULL,
      FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
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

    CREATE INDEX IF NOT EXISTS idx_messages_chat
      ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_decisions_application
      ON decisions(application_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_observations_application_kind
      ON observations(application_id, kind, observed_at DESC);
    CREATE INDEX IF NOT EXISTS idx_activity_workspace
      ON activity_events(workspace_id, created_at DESC);
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

const toChat = (row: Row) => fromRow<Chat>({ ...row, is_primary: Boolean(row.is_primary) });

const toObservation = ({ raw_json, ...row }: Row) =>
  fromRow<Observation>({ ...row, raw: JSON.parse(raw_json as string) });

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
  const id = randomUUID();
  db().prepare(
    "INSERT INTO phase_workspaces (id, application_id, phase_key, created_at) VALUES (?, ?, 'start', ?)",
  ).run(id, applicationId, now());
  return getWorkspace(applicationId)!;
}

export function getWorkspace(applicationId: string) {
  return one<PhaseWorkspaceRecord>(
    "SELECT * FROM phase_workspaces WHERE application_id = ? AND phase_key = 'start'",
    [applicationId],
  );
}

// Chats and messages

export function insertChat(workspaceId: string, title: string, isPrimary = false) {
  const id = randomUUID();
  db().prepare(
    "INSERT INTO chats (id, workspace_id, title, is_primary, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, workspaceId, title, isPrimary ? 1 : 0, now());
  return getChat(id)!;
}

export function getChat(id: string) {
  return one("SELECT * FROM chats WHERE id = ?", [id], toChat);
}

export function listChats(workspaceId: string) {
  return many(
    "SELECT * FROM chats WHERE workspace_id = ? ORDER BY created_at ASC, rowid ASC",
    [workspaceId],
    toChat,
  );
}

export function archiveChat(id: string) {
  db().prepare("UPDATE chats SET archived_at = ? WHERE id = ? AND archived_at IS NULL").run(now(), id);
}

export function insertMessage(
  chatId: string,
  role: ChatMessage["role"],
  body: string,
  source: ChatMessage["source"],
) {
  const id = randomUUID();
  db().prepare(
    "INSERT INTO messages (id, chat_id, role, body, source, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, chatId, role, body, source, now());
  return one<ChatMessage>("SELECT * FROM messages WHERE id = ?", [id])!;
}

export function listMessages(chatId: string) {
  return many<ChatMessage>(
    "SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC",
    [chatId],
  );
}

// Decisions

export function insertDecision(input: {
  applicationId: string;
  sourceMessageId: string;
  kind: Decision["kind"];
  label: string;
  value: string;
}) {
  const id = randomUUID();
  db().prepare(
    `INSERT INTO decisions
      (id, application_id, source_message_id, kind, label, value, superseded_by_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
  ).run(
    id,
    input.applicationId,
    input.sourceMessageId,
    input.kind,
    input.label,
    input.value,
    now(),
  );
  return getDecision(id)!;
}

export function getDecision(id: string) {
  return one<Decision>("SELECT * FROM decisions WHERE id = ?", [id]);
}

export function listActiveDecisions(applicationId: string) {
  return many<Decision>(
    `SELECT * FROM decisions
     WHERE application_id = ? AND superseded_by_id IS NULL
     ORDER BY created_at ASC, rowid ASC`,
    [applicationId],
  );
}

export function supersedeDecision(applicationId: string, previousId: string, replacementId: string) {
  const result = db().prepare(
    `UPDATE decisions SET superseded_by_id = ?
     WHERE id = ? AND application_id = ? AND superseded_by_id IS NULL`,
  ).run(replacementId, previousId, applicationId);
  if (result.changes !== 1) {
    throw new Error("The Decision being corrected is missing, already replaced, or belongs to another application.");
  }
}

// Observations

export function insertObservation(input: Omit<Observation, "id" | "observedAt">) {
  const id = randomUUID();
  db().prepare(
    `INSERT INTO observations
      (id, application_id, kind, status, summary, source_label, source_url, raw_json, observed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.applicationId,
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

export function latestObservation(applicationId: string, kind: string) {
  return one(
    `SELECT * FROM observations
     WHERE application_id = ? AND kind = ?
     ORDER BY observed_at DESC, rowid DESC LIMIT 1`,
    [applicationId, kind],
    toObservation,
  );
}

export function listObservations(applicationId: string) {
  return many(
    "SELECT * FROM observations WHERE application_id = ? ORDER BY observed_at DESC, rowid DESC",
    [applicationId],
    toObservation,
  );
}

// Activity

export function insertActivity(workspaceId: string, kind: string, summary: string, detail: string) {
  db().prepare(
    "INSERT INTO activity_events (id, workspace_id, kind, summary, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(randomUUID(), workspaceId, kind, summary, detail, now());
}

export function listActivity(workspaceId: string) {
  return many<ActivityEvent>(
    "SELECT * FROM activity_events WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC",
    [workspaceId],
  );
}

export function withTransaction<T>(work: () => T): T {
  return db().transaction(work)();
}
