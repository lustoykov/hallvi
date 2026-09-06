import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import schemaVersion from "../../../src/server/schema-version.json";
import { pushTestDatabase } from "../../test-database";

let databaseDirectory: string | null = null;

afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  delete process.env.SERVER_GUY_DB_PATH;
  if (databaseDirectory)
    rmSync(databaseDirectory, { recursive: true, force: true });
  databaseDirectory = null;
});

async function loadFreshDatabase() {
  databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
  process.env.SERVER_GUY_DB_PATH = join(databaseDirectory, "test.db");
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH);
  vi.resetModules();
  return import("../../../src/server/db");
}

function applicationInput(name: string) {
  return {
    name,
    repositoryUrl: `https://github.com/lustoykov/${name}`,
    repositoryOwner: "lustoykov",
    repositoryName: name,
    environment: "production" as const,
    approvalMode: "pi-decides" as const,
    approvalScope: "Current application launch",
  };
}

describe("Phase 1 schema", () => {
  it("requires an explicit schema push for a fresh database", async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
    process.env.SERVER_GUY_DB_PATH = join(databaseDirectory, "missing.db");
    vi.resetModules();
    const database = await import("../../../src/server/db");

    expect(() => database.db()).toThrow(
      "is not initialized. Run npm run db:push",
    );
  });

  it("refuses to open a record written by an older schema", async () => {
    databaseDirectory = mkdtempSync(join(tmpdir(), "server-guy-schema-"));
    const databasePath = join(databaseDirectory, "old.db");
    const older = new Database(databasePath);
    older.exec("CREATE TABLE applications (id TEXT PRIMARY KEY)");
    older.close();

    process.env.SERVER_GUY_DB_PATH = databasePath;
    vi.resetModules();
    const database = await import("../../../src/server/db");

    expect(() => database.db()).toThrow(
      `prototype schema version 0; expected ${schemaVersion.version}`,
    );
  });

  it("stores durable domain and Pi execution records without persisted blockers or Gate Checks", async () => {
    const database = await loadFreshDatabase();
    const client = database.db().$client;
    const tables = client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);
    const workspaceColumns = client
      .prepare("PRAGMA table_info(phase_workspaces)")
      .all()
      .map((row) => (row as { name: string }).name);
    const indexes = client
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .all()
      .map((row) => (row as { name: string }).name);

    expect(tables).toEqual([
      "activity_events",
      "applications",
      "chat_summaries",
      "chats",
      "decisions",
      "messages",
      "observations",
      "phase_workspaces",
      "pi_runs",
    ]);
    expect(workspaceColumns).toEqual([
      "id",
      "application_id",
      "phase_key",
      "created_at",
    ]);
    expect(indexes).toEqual([
      "idx_activity_workspace",
      "idx_decisions_application",
      "idx_messages_chat",
      "idx_observations_application_kind",
      "idx_pi_runs_chat",
      "idx_pi_runs_queue",
    ]);
    expect(client.pragma("user_version", { simple: true })).toBe(
      schemaVersion.version,
    );
    expect(client.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(client.pragma("journal_mode", { simple: true })).toBe("wal");
  });

  it("selects the newest Observation deterministically within one Application", async () => {
    const database = await loadFreshDatabase();
    const firstApplication = database.insertApplication(
      applicationInput("first-app"),
    );
    const secondApplication = database.insertApplication(
      applicationInput("second-app"),
    );
    const first = database.insertObservation({
      applicationId: firstApplication.id,
      kind: "github-repository-identity",
      status: "passed",
      summary: "older pass",
      sourceLabel: "GitHub",
      sourceUrl: null,
      raw: {},
    });
    const second = database.insertObservation({
      applicationId: firstApplication.id,
      kind: "github-repository-identity",
      status: "failed",
      summary: "newer failure",
      sourceLabel: "GitHub",
      sourceUrl: null,
      raw: { attempt: 2, reason: "private" },
    });
    database.insertObservation({
      applicationId: secondApplication.id,
      kind: "github-repository-identity",
      status: "passed",
      summary: "other application",
      sourceLabel: "GitHub",
      sourceUrl: null,
      raw: {},
    });
    database
      .db()
      .$client.prepare(
        "UPDATE observations SET observed_at = ? WHERE id IN (?, ?)",
      )
      .run("2026-09-03T00:00:00.000Z", first.id, second.id);

    expect(
      database.latestObservation(
        firstApplication.id,
        "github-repository-identity",
      )?.id,
    ).toBe(second.id);
    expect(
      database.latestObservation(
        firstApplication.id,
        "github-repository-identity",
      )?.raw,
    ).toEqual({ attempt: 2, reason: "private" });
  });

  it("preserves superseded Decision history until its Application is deleted", async () => {
    const database = await loadFreshDatabase();
    const application = database.insertApplication(
      applicationInput("decision-history"),
    );
    const workspace = database.insertWorkspace(application.id);
    const chat = database.insertChat(workspace.id, "Decision history", true);
    const sourceMessage = database.insertMessage(
      chat.id,
      "user",
      "Reliability comes first.",
      "user",
    );
    const previous = database.insertDecision({
      applicationId: application.id,
      sourceMessageId: sourceMessage.id,
      kind: "launch-priority",
      label: "Launch priority",
      value: "Ship quickly",
    });
    const replacement = database.insertDecision({
      applicationId: application.id,
      sourceMessageId: sourceMessage.id,
      kind: "launch-priority",
      label: "Launch priority",
      value: "Prioritize reliability",
    });
    database.supersedeDecision(application.id, previous.id, replacement.id);

    expect(() =>
      database
        .db()
        .$client.prepare("DELETE FROM decisions WHERE id = ?")
        .run(replacement.id),
    ).toThrow("FOREIGN KEY constraint failed");
    expect(database.listActiveDecisions(application.id)).toEqual([replacement]);

    database
      .db()
      .$client.prepare("DELETE FROM applications WHERE id = ?")
      .run(application.id);
    expect(
      database.db().$client.prepare("SELECT id FROM decisions").all(),
    ).toEqual([]);
  });
});
