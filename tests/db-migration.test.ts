import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

let databaseDirectory: string | null = null;

afterEach(() => {
  globalThis.__serverGuyDb?.close();
  delete globalThis.__serverGuyDb;
  delete process.env.SERVER_GUY_DB_PATH;
  if (databaseDirectory) rmSync(databaseDirectory, { recursive: true, force: true });
  databaseDirectory = null;
});

describe("database migration", () => {
  it("renames legacy chat storage and keeps only genuine Decision Records", async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-migration-"));
    const databasePath = join(databaseDirectory, "legacy.db");
    const legacy = new Database(databasePath);
    legacy.exec(`
      CREATE TABLE applications (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
        repository_url TEXT NOT NULL UNIQUE, repository_owner TEXT NOT NULL,
        repository_name TEXT NOT NULL, environment TEXT NOT NULL,
        approval_mode TEXT NOT NULL, approval_scope TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE phase_workspaces (
        id TEXT PRIMARY KEY, application_id TEXT NOT NULL, phase_number INTEGER NOT NULL,
        deliverable TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL, UNIQUE(application_id, phase_number),
        FOREIGN KEY(application_id) REFERENCES applications(id) ON DELETE CASCADE
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, title TEXT NOT NULL,
        is_primary INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE
      );
      CREATE TABLE messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL,
        body TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );
      CREATE TABLE decisions (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, session_id TEXT, key TEXT NOT NULL,
        label TEXT NOT NULL, value TEXT NOT NULL, source TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(workspace_id, key),
        FOREIGN KEY(workspace_id) REFERENCES phase_workspaces(id) ON DELETE CASCADE,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
      );

      INSERT INTO applications VALUES
        ('app', 'todo-fastapi', 'todo-fastapi', 'https://github.com/lustoykov/todo-fastapi',
         'lustoykov', 'todo-fastapi', 'production', 'pi-decides',
         'Current application launch', 'phase-1', '2026-08-31T00:00:00Z', '2026-08-31T00:00:00Z');
      INSERT INTO phase_workspaces VALUES
        ('workspace', 'app', 1, 'Launch Brief', 'in-progress',
         '2026-08-31T00:00:00Z', '2026-08-31T00:00:00Z');
      INSERT INTO sessions VALUES
        ('session', 'workspace', 'Launch Brief', 1, 'active', '2026-08-31T00:00:00Z', NULL);
      INSERT INTO messages VALUES
        ('message', 'session', 'user', 'Recovery matters.', 'user', '2026-08-31T00:00:01Z');
      INSERT INTO decisions VALUES
        ('priority', 'workspace', 'session', 'launch_priority:priority',
         'Additional launch priority', 'Recover quickly', 'chat',
         '2026-08-31T00:00:02Z', '2026-08-31T00:00:02Z');
      INSERT INTO decisions VALUES
        ('default', 'workspace', NULL, 'protect_database', 'Protect database data',
         'Required for every production launch', 'product-default',
         '2026-08-31T00:00:03Z', '2026-08-31T00:00:03Z');
    `);
    legacy.close();

    process.env.SERVER_GUY_DB_PATH = databasePath;
    delete globalThis.__serverGuyDb;
    vi.resetModules();
    const database = await import("../src/server/db");

    expect(database.getOperatorSession("session")?.title).toBe("Launch Brief");
    expect(database.listMessages("session")[0]?.operatorSessionId).toBe("session");
    expect(database.listDecisions("workspace")).toMatchObject([
      {
        id: "priority",
        operatorSessionId: "session",
        kind: "launch-priority",
        value: "Recover quickly",
      },
    ]);
  });
});
