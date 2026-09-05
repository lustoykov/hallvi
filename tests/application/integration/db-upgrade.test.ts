import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";
import schemaVersion from "../../../src/server/schema-version.json";

it("the additive v4 → v6 push preserves legacy records and defaults existing messages to completed", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-upgrade-"));
  const path = join(root, "old.db");
  try {
    pushTestDatabase(path);
    const old = new Database(path);
    // v4 has these same seven domain tables, without execution records or
    // status/revision columns. Seed data before applying the upgrade.
    old.exec(
      "DROP TABLE chat_summaries; DROP TABLE pi_runs; ALTER TABLE messages DROP COLUMN status; ALTER TABLE messages DROP COLUMN revision; ALTER TABLE chats DROP COLUMN native_session_id; PRAGMA user_version = 4;",
    );
    old
      .prepare("INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "app",
        "Example",
        "https://github.com/qa/example",
        "qa",
        "example",
        "production",
        "pi-decides",
        "launch",
        "2026-09-01",
        "2026-09-01",
      );
    old
      .prepare("INSERT INTO phase_workspaces VALUES (?, ?, ?, ?)")
      .run("workspace", "app", "start", "2026-09-01");
    old
      .prepare("INSERT INTO chats VALUES (?, ?, ?, ?, ?, ?)")
      .run("chat", "workspace", "Main", 1, "2026-09-01", null);
    old
      .prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?)")
      .run("message", "chat", "user", "Retain this", "user", "2026-09-01");
    old
      .prepare("INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "decision",
        "app",
        "message",
        "launch-priority",
        "Priority",
        "Retain this",
        null,
        "2026-09-01",
      );
    const snapshot = old.prepare("SELECT * FROM decisions").all();
    old.close();
    pushTestDatabase(path);
    const upgraded = new Database(path);
    try {
      expect(upgraded.prepare("SELECT * FROM decisions").all()).toEqual(
        snapshot,
      );
      expect(upgraded.prepare("SELECT * FROM messages").get()).toMatchObject({
        id: "message",
        body: "Retain this",
        status: "completed",
        revision: 0,
      });
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
      expect(upgraded.pragma("user_version", { simple: true })).toBe(
        schemaVersion.version,
      );
      expect(
        upgraded.prepare("SELECT native_session_id FROM chats").get(),
      ).toEqual({ native_session_id: null });
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);

it("the additive v5 → v6 push retains chat, run, summary and Decision records with a private backup", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-upgrade-"));
  const path = join(root, "old.db");
  try {
    pushTestDatabase(path);
    const old = new Database(path);
    old.exec(`
      ALTER TABLE chats DROP COLUMN native_session_id;
      PRAGMA user_version = 5;
      INSERT INTO applications VALUES ('app', 'Example', 'https://github.com/qa/example', 'qa', 'example', 'production', 'pi-decides', 'launch', '2026-09-01', '2026-09-01');
      INSERT INTO phase_workspaces VALUES ('workspace', 'app', 'start', '2026-09-01');
      INSERT INTO chats VALUES ('chat', 'workspace', 'Main', 1, '2026-09-01', NULL);
      INSERT INTO messages VALUES ('user', 'chat', 'user', 'Retain this', 'user', 'completed', 0, '2026-09-01');
      INSERT INTO messages VALUES ('assistant', 'chat', 'assistant', 'Saved', 'pi', 'completed', 0, '2026-09-01');
      INSERT INTO decisions VALUES ('decision', 'app', 'assistant', 'launch-priority', 'Priority', 'Retain this', NULL, '2026-09-01');
      INSERT INTO chat_summaries VALUES ('chat', 'Preserve summary', 'assistant', '2026-09-01');
      INSERT INTO pi_runs VALUES ('run', 'app', 'workspace', 'chat', 'user', 'assistant', 'request', NULL, 'succeeded', 1, NULL, 1, '2026-09-01', '2026-09-01', '2026-09-01');
    `);
    const names = ["messages", "decisions", "chat_summaries", "pi_runs"];
    const snapshots = names.map((name) =>
      old.prepare(`SELECT * FROM ${name}`).all(),
    );
    old.close();
    pushTestDatabase(path);
    const upgraded = new Database(path);
    try {
      names.forEach((name, index) =>
        expect(upgraded.prepare(`SELECT * FROM ${name}`).all()).toEqual(
          snapshots[index],
        ),
      );
      expect(upgraded.prepare("SELECT * FROM chats").get()).toMatchObject({
        id: "chat",
        native_session_id: null,
      });
      expect(upgraded.pragma("foreign_key_check")).toEqual([]);
      expect(upgraded.pragma("user_version", { simple: true })).toBe(6);
      const backups = readdirSync(root).filter(
        (file) => file.includes(".pre-v6-") && file.endsWith(".backup"),
      );
      expect(backups).toHaveLength(1);
      const backupPath = join(root, backups[0]);
      expect(statSync(backupPath).mode & 0o777).toBe(0o600);
      const backup = new Database(backupPath, { readonly: true });
      try {
        expect(backup.pragma("user_version", { simple: true })).toBe(5);
        expect(backup.prepare("SELECT * FROM decisions").all()).toEqual(
          snapshots[1],
        );
      } finally {
        backup.close();
      }
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
