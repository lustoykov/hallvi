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

const OWNERS = `
    INSERT INTO applications VALUES ('app', 'App', 'https://github.com/fixture/app', 'fixture', 'app', 'production', 'always-ask', 'Existing authority', '2026-09-08', '2026-09-08');
    INSERT INTO phase_workspaces VALUES ('ws', 'app', 'start', '2026-09-08', NULL, NULL);
`;
const HISTORY = `
    INSERT INTO messages (id, chat_id, role, body, source, status, created_at) VALUES
      ('user', 'chat', 'user', 'Keep this instruction', 'user', 'completed', '2026-09-08'),
      ('reply', 'chat', 'assistant', '', 'pi', 'queued', '2026-09-08');
    INSERT INTO pi_runs (id, application_id, workspace_id, chat_id, user_message_id, assistant_message_id, request_key, status, created_at)
      VALUES ('run', 'app', 'ws', 'chat', 'user', 'reply', 'request-key', 'queued', '2026-09-08');
    INSERT INTO chat_summaries (chat_id, body, covered_message_id, updated_at)
      VALUES ('chat', 'Retained summary', 'user', '2026-09-08');
`;

function database(fixture: "schema-v10.sql" | "schema-v13.sql", chat: string) {
  const root = mkdtempSync(join(tmpdir(), "server-guy-chat-upgrade-"));
  roots.push(root);
  const path = join(root, "old.db");
  const db = new Database(path);
  db.exec(readFileSync(`tests/application/fixtures/${fixture}`, "utf8"));
  db.exec(OWNERS);
  db.exec(chat);
  db.exec(HISTORY);
  db.pragma("foreign_keys = ON");
  expect(db.pragma("foreign_key_check")).toEqual([]);
  db.close();
  return { root, path };
}
const v10 = () =>
  database(
    "schema-v10.sql",
    "INSERT INTO chats VALUES ('chat', 'ws', 'Conversation', 1, '2026-09-08', NULL, 'native-session-kept');",
  );
const v13 = () =>
  database(
    "schema-v13.sql",
    "INSERT INTO chats VALUES ('chat', 'app', 'ws', 'Conversation', 1, '2026-09-08', NULL, 'native-session-kept');",
  );

/** The retained records, in their current shape. */
function retained(db: Database.Database) {
  return {
    applications: db.prepare("SELECT * FROM applications").all(),
    chats: db.prepare("SELECT * FROM chats").all(),
    messages: db.prepare("SELECT * FROM messages ORDER BY id").all(),
    runs: db.prepare("SELECT * FROM pi_runs").all(),
    summaries: db.prepare("SELECT * FROM chat_summaries").all(),
  };
}
const expected = {
  applications: [
    {
      id: "app",
      name: "App",
      repository_url: "https://github.com/fixture/app",
      repository_owner: "fixture",
      repository_name: "app",
      created_at: "2026-09-08",
      updated_at: "2026-09-08",
    },
  ],
  chats: [
    {
      id: "chat",
      application_id: "app",
      title: "Conversation",
      created_at: "2026-09-08",
      archived_at: null,
      native_session_id: "native-session-kept",
    },
  ],
  messages: [
    expect.objectContaining({ id: "reply", status: "queued" }),
    expect.objectContaining({ id: "user", body: "Keep this instruction" }),
  ],
  runs: [
    expect.objectContaining({
      id: "run",
      application_id: "app",
      chat_id: "chat",
      status: "queued",
      request_key: "request-key",
    }),
  ],
  summaries: [
    expect.objectContaining({ chat_id: "chat", body: "Retained summary" }),
  ],
};

it("migrates populated v10 chats to application ownership without losing native identity, messages or a queued run", () => {
  const { root, path } = v10();
  pushTestDatabase(path);
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(retained(upgraded)).toEqual(expected);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    upgraded.pragma("foreign_keys = ON");
    expect(() =>
      upgraded
        .prepare(
          "INSERT INTO chats (id, title, created_at) VALUES ('invalid', 'No owner', 'now')",
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
    expect(backup.pragma("user_version", { simple: true })).toBe(10);
    expect(backup.prepare("SELECT workspace_id FROM chats").get()).toEqual({
      workspace_id: "ws",
    });
  } finally {
    backup.close();
  }
}, 20_000);

it("resumes when preparation finished but the schema push/stamp was interrupted", () => {
  const { path } = v10();
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
    expect(retained(resumed)).toEqual(expected);
    expect(resumed.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(resumed.pragma("foreign_key_check")).toEqual([]);
  } finally {
    resumed.close();
  }
}, 20_000);

it("refuses an orphaned conversation and leaves its original history recoverable", () => {
  const { path } = v10();
  const invalid = new Database(path);
  invalid.pragma("foreign_keys = OFF");
  invalid
    .prepare("UPDATE chats SET workspace_id = 'missing' WHERE id = 'chat'")
    .run();
  const records = invalid.prepare("SELECT * FROM messages").all();
  invalid.close();
  expect(() => pushTestDatabase(path)).toThrow();
  const unchanged = new Database(path, { readonly: true });
  try {
    expect(unchanged.prepare("SELECT * FROM messages").all()).toEqual(records);
    expect(unchanged.pragma("user_version", { simple: true })).toBe(10);
    expect(unchanged.prepare("SELECT workspace_id FROM chats").get()).toEqual({
      workspace_id: "missing",
    });
    expect(
      unchanged
        .prepare("SELECT name FROM sqlite_master WHERE name = ?")
        .get("phase_workspaces"),
    ).toBeTruthy();
  } finally {
    unchanged.close();
  }
}, 20_000);

it("upgrades a v11 conversation database to the current schema without rewriting its history", () => {
  const { path } = v13();
  const v11 = new Database(path);
  // v11 already owns chats directly; deployment storage arrives in v12.
  v11.exec("DROP TABLE deployments; PRAGMA user_version = 11");
  v11.close();
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(retained(upgraded)).toEqual(expected);
    expect(upgraded.prepare("SELECT * FROM deployments").all()).toEqual([]);
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
  } finally {
    upgraded.close();
  }
}, 20_000);

it("retires v12 process guards into evidence without dropping history", () => {
  const { root, path } = v13();
  const v12 = new Database(path);
  v12.exec(
    "DROP TABLE application_operations; ALTER TABLE application_operation_processes RENAME TO application_operations; INSERT INTO application_operations VALUES ('guard', 'app', 2147483000); PRAGMA user_version = 12",
  );
  v12.close();
  pushTestDatabase(path);
  const upgraded = new Database(path);
  try {
    expect(retained(upgraded)).toEqual(expected);
    // The guard's process is gone: its record is kept, no hold is created.
    expect(
      upgraded.prepare("SELECT * FROM application_operations").all(),
    ).toEqual([]);
    expect(
      upgraded
        .prepare(
          "SELECT id, kind, json_extract(raw_json, '$.record.pid') AS pid FROM observations WHERE id = 'guard'",
        )
        .get(),
    ).toEqual({ id: "guard", kind: "retired-record", pid: 2147483000 });
    expect(
      upgraded
        .prepare(
          "SELECT name FROM sqlite_master WHERE name = 'application_operation_processes'",
        )
        .get(),
    ).toBeUndefined();
    expect(upgraded.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(upgraded.pragma("foreign_key_check")).toEqual([]);
    expect(
      readdirSync(root).filter((name) => name.endsWith(".backup")),
    ).toHaveLength(1);
  } finally {
    upgraded.close();
  }
}, 20_000);
