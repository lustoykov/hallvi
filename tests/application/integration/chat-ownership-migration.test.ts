import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";
import schemaVersion from "../../../src/server/schema-version.json";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function legacyDatabase() {
  const root = mkdtempSync(join(tmpdir(), "server-guy-chat-upgrade-"));
  roots.push(root);
  const path = join(root, "v10.db");
  const database = new Database(path);
  database.exec(
    readFileSync("tests/application/fixtures/schema-v10.sql", "utf8"),
  );
  database.pragma("foreign_keys = ON");
  database.exec(`
    INSERT INTO applications VALUES ('app', 'App', 'https://github.com/fixture/app', 'fixture', 'app', 'production', 'always-ask', 'Existing authority', '2026-09-08', '2026-09-08');
    INSERT INTO phase_workspaces VALUES ('ws', 'app', 'start', '2026-09-08', NULL, NULL);
    INSERT INTO chats VALUES ('chat', 'ws', 'Conversation', 1, '2026-09-08', NULL, 'native-session-kept');
    INSERT INTO messages (id, chat_id, role, body, source, status, created_at) VALUES
      ('user', 'chat', 'user', 'Keep this instruction', 'user', 'completed', '2026-09-08'),
      ('reply', 'chat', 'assistant', '', 'pi', 'queued', '2026-09-08');
    INSERT INTO pi_runs (id, application_id, workspace_id, chat_id, user_message_id, assistant_message_id, request_key, status, created_at)
      VALUES ('run', 'app', 'ws', 'chat', 'user', 'reply', 'request-key', 'queued', '2026-09-08');
    INSERT INTO chat_summaries (chat_id, body, covered_message_id, updated_at)
      VALUES ('chat', 'Retained summary', 'user', '2026-09-08');
  `);
  const records = snapshot(database);
  database.close();
  return { root, path, records };
}

function snapshot(database: Database.Database) {
  return Object.fromEntries(
    [
      "applications",
      "phase_workspaces",
      "messages",
      "pi_runs",
      "chat_summaries",
    ].map((name) => [name, database.prepare(`SELECT * FROM ${name}`).all()]),
  );
}

it("migrates populated v10 chats without losing authority, native identity, messages or a queued run", () => {
  const { root, path, records } = legacyDatabase();
  pushTestDatabase(path);
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(snapshot(upgraded)).toEqual(records);
    expect(upgraded.prepare("SELECT * FROM chats").get()).toEqual({
      id: "chat",
      application_id: "app",
      workspace_id: "ws",
      title: "Conversation",
      is_primary: 1,
      created_at: "2026-09-08",
      archived_at: null,
      native_session_id: "native-session-kept",
    });
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    upgraded.pragma("foreign_keys = ON");
    expect(() =>
      upgraded
        .prepare(
          "INSERT INTO chats (id, workspace_id, title, created_at) VALUES ('invalid', 'ws', 'No owner', 'now')",
        )
        .run(),
    ).toThrow();
    upgraded.prepare("DELETE FROM applications WHERE id = 'app'").run();
    expect(upgraded.prepare("SELECT * FROM chats").all()).toEqual([]);
    expect(upgraded.prepare("SELECT * FROM pi_runs").all()).toEqual([]);
  } finally {
    upgraded.close();
  }
  const backups = readdirSync(root).filter((name) => name.endsWith(".backup"));
  expect(backups).toHaveLength(1);
  expect(statSync(join(root, backups[0])).mode & 0o777).toBe(0o600);
  const backup = new Database(join(root, backups[0]), { readonly: true });
  try {
    expect(snapshot(backup)).toEqual(records);
    expect(backup.pragma("user_version", { simple: true })).toBe(10);
  } finally {
    backup.close();
  }
}, 20_000);

it("resumes when preparation finished but the schema push/stamp was interrupted", () => {
  const { path, records } = legacyDatabase();
  execFileSync(process.execPath, ["scripts/prepare-db.mjs"], {
    env: { ...process.env, SERVER_GUY_DB_PATH: path },
    stdio: "pipe",
  });
  const pending = new Database(path, { readonly: true });
  expect(pending.pragma("user_version", { simple: true })).toBe(10);
  pending.close();
  pushTestDatabase(path);
  const resumed = new Database(path, { readonly: true });
  try {
    expect(snapshot(resumed)).toEqual(records);
    expect(resumed.pragma("foreign_key_check")).toEqual([]);
  } finally {
    resumed.close();
  }
}, 20_000);

it("refuses an orphaned conversation and leaves its original history recoverable", () => {
  const { path, records } = legacyDatabase();
  const invalid = new Database(path);
  invalid.pragma("foreign_keys = OFF");
  invalid
    .prepare("UPDATE chats SET workspace_id = 'missing' WHERE id = 'chat'")
    .run();
  invalid.close();
  expect(() => pushTestDatabase(path)).toThrow();
  const unchanged = new Database(path, { readonly: true });
  try {
    expect(snapshot(unchanged)).toEqual(records);
    expect(unchanged.pragma("user_version", { simple: true })).toBe(10);
    expect(unchanged.prepare("SELECT workspace_id FROM chats").get()).toEqual({
      workspace_id: "missing",
    });
    expect(unchanged.prepare("PRAGMA table_info(chats)").all()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "application_id" }),
      ]),
    );
  } finally {
    unchanged.close();
  }
}, 20_000);

it("upgrades a v11 conversation database to the current schema without rewriting its history", () => {
  const { path } = legacyDatabase();
  pushTestDatabase(path);
  const v11 = new Database(path);
  // v11 already owns chats directly; only deployment storage arrives in v12.
  v11.exec("DROP TABLE deployments; PRAGMA user_version = 11");
  const before = snapshot(v11);
  const chats = v11.prepare("SELECT * FROM chats").all();
  v11.close();
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(snapshot(upgraded)).toEqual(before);
    expect(upgraded.prepare("SELECT * FROM chats").all()).toEqual(chats);
    expect(upgraded.prepare("SELECT * FROM deployments").all()).toEqual([]);
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
  } finally {
    upgraded.close();
  }
}, 20_000);

it("upgrades v12 process guards to durable operation storage without dropping guards or history", () => {
  const { root, path } = legacyDatabase();
  pushTestDatabase(path);
  const before = new Database(path);
  const history = snapshot(before);
  before.exec(
    "DROP TABLE application_operations; ALTER TABLE application_operation_processes RENAME TO application_operations; INSERT INTO application_operations VALUES ('guard', 'app', 12345); PRAGMA user_version = 12",
  );
  before.close();
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(snapshot(upgraded)).toEqual(history);
    expect(
      upgraded.prepare("SELECT * FROM application_operation_processes").all(),
    ).toEqual([{ id: "guard", application_id: "app", pid: 12345 }]);
    expect(
      upgraded.prepare("SELECT * FROM application_operations").all(),
    ).toEqual([]);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    const backups = readdirSync(root).filter((name) =>
      name.endsWith(".backup"),
    );
    expect(backups).toHaveLength(2);
  } finally {
    upgraded.close();
  }
}, 20000);
