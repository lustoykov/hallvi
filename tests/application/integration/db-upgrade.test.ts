import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { pushTestDatabase } from "../../test-database";

it("the additive v4 → v5 push preserves legacy records and defaults existing messages to completed", () => {
  const root = mkdtempSync(join(tmpdir(), "server-guy-upgrade-"));
  const path = join(root, "old.db");
  try {
    pushTestDatabase(path);
    const old = new Database(path);
    // v4 has these same seven domain tables, without execution records or
    // status/revision columns. Seed data before applying the upgrade.
    old.exec(
      "DROP TABLE chat_summaries; DROP TABLE pi_runs; ALTER TABLE messages DROP COLUMN status; ALTER TABLE messages DROP COLUMN revision; PRAGMA user_version = 4;",
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
      expect(upgraded.pragma("user_version", { simple: true })).toBe(5);
    } finally {
      upgraded.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 20_000);
