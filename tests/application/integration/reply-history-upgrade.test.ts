import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import { pushTestDatabase } from "../../test-database";

let root: string, path: string;
const time = "2026-09-06T00:00:00.000Z";
const finished = "2026-09-06T00:00:02.000Z";
const statuses = [
  "succeeded",
  "cancelled",
  "interrupted",
  "running",
  "queued",
  "no-history",
];
const payload = JSON.stringify(
  {
    steps: [
      {
        id: "model:1",
        label: "Generate response",
        startedAt: time,
        finishedAt: finished,
        outcome: "completed",
        metadata: { inputTokens: 42 },
        spanId: "b".repeat(16),
      },
    ],
    omitted: 3,
    decisionIds: ["decision"],
    traceId: "a".repeat(32),
    traceUrl: `https://cloud.langfuse.com/project/synthetic/traces/${"a".repeat(32)}`,
  },
  null,
  2,
);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-history-upgrade-"));
  path = join(root, "v6.db");
  vi.stubEnv("SERVER_GUY_DB_PATH", path);
  const old = new Database(path);
  try {
    old.exec(readFileSync("tests/fixtures/schema-v6.sql", "utf8"));
    old.pragma("foreign_keys = ON");
    old
      .prepare("INSERT INTO applications VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "app",
        "Synthetic",
        "https://github.com/qa/synthetic",
        "qa",
        "synthetic",
        "production",
        "pi-decides",
        "test",
        time,
        time,
      );
    old
      .prepare("INSERT INTO phase_workspaces VALUES (?, ?, ?, ?)")
      .run("workspace", "app", "start", time);
    old
      .prepare(
        "INSERT INTO chats (id, workspace_id, title, created_at) VALUES (?, ?, ?, ?)",
      )
      .run("chat", "workspace", "Main", time);
    for (const id of statuses) {
      const status = id === "no-history" ? "running" : id;
      for (const role of ["user", "assistant"]) {
        old
          .prepare(
            "INSERT INTO messages (id, chat_id, role, body, source, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            `${id}-${role}`,
            "chat",
            role,
            "Synthetic text",
            role === "user" ? "user" : "pi",
            role === "user" || status === "succeeded" ? "completed" : status,
            time,
          );
      }
      old
        .prepare(
          `INSERT INTO pi_runs (id, application_id, workspace_id, chat_id, user_message_id, assistant_message_id,
        request_key, retry_of_id, status, created_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          "app",
          "workspace",
          "chat",
          `${id}-user`,
          `${id}-assistant`,
          id,
          id === "interrupted" ? "cancelled" : null,
          status,
          time,
          status === "queued" ? null : time,
          ["running", "queued"].includes(status) ? null : finished,
        );
      if (id !== "no-history") {
        const detail =
          id === "running"
            ? JSON.stringify({
                steps: [
                  {
                    id: "model:1",
                    label: "Generate response",
                    startedAt: time,
                    outcome: "running",
                    metadata: {},
                  },
                ],
                omitted: 0,
              })
            : id === "queued"
              ? '{"steps":[],"omitted":0}'
              : payload;
        old
          .prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?)")
          .run(
            id,
            "workspace",
            "chat-execution",
            "Assistant reply",
            detail,
            time,
          );
      }
    }
    old
      .prepare("INSERT INTO decisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        "decision",
        "app",
        "succeeded-user",
        "launch-priority",
        "Requirement",
        "Keep synthetic data",
        null,
        time,
      );
    for (const kind of ["decision-recorded", "chat-created", "chat-archived"])
      old
        .prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?)")
        .run(kind, "workspace", kind, kind, "Historical detail", time);
  } finally {
    old.close();
  }
});
afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function sourceRows(db: Database.Database) {
  return db.prepare("SELECT * FROM activity_events ORDER BY id").all();
}
function historyRows(db: Database.Database) {
  return db
    .prepare("SELECT * FROM reply_execution_history ORDER BY run_id")
    .all();
}

it("upgrades an actual v6 schema losslessly, reopens and repeats without duplicating history", () => {
  expect(() => store.db()).toThrow("prototype schema version 6; expected 7");
  const old = new Database(path);
  const beforeRuns = old.prepare("SELECT * FROM pi_runs ORDER BY id").all();
  const beforeActivity = sourceRows(old) as {
    id: string;
    kind: string;
    detail: string;
  }[];
  const beforeDecisions = old.prepare("SELECT * FROM decisions").all();
  old.close();
  pushTestDatabase(path);
  pushTestDatabase(path);
  const db = store.db().$client;
  expect(db.pragma("user_version", { simple: true })).toBe(7);
  expect(db.pragma("foreign_key_check")).toEqual([]);
  expect(db.prepare("SELECT * FROM pi_runs ORDER BY id").all()).toEqual(
    beforeRuns,
  );
  expect(db.prepare("SELECT * FROM decisions").all()).toEqual(beforeDecisions);
  expect(sourceRows(db)).toEqual(
    beforeActivity.filter((row) => row.kind !== "chat-execution"),
  );
  expect(historyRows(db)).toEqual(
    beforeActivity
      .filter((row) => row.kind === "chat-execution")
      .map((row) => ({ run_id: row.id, detail: row.detail })),
  );
  const snapshot = runs.chatRunSnapshot("app", "chat");
  expect(snapshot.executions.succeeded).toEqual(JSON.parse(payload));
  expect(snapshot.executions["no-history"]).toBeUndefined();
  expect(snapshot.activity.map((event) => event.kind)).toEqual([
    "decision-recorded",
  ]);
  db.close();
  delete globalThis.__serverGuyDb;
  expect(runs.chatRunSnapshot("app", "chat")).toEqual(snapshot);

  // The startup recovery policy still belongs to pi_runs. Close real saved
  // steps, but never manufacture missing diagnostic history for an old Run.
  runs.interruptRunningPiRuns();
  expect(runs.getPiRun("running")?.status).toBe("interrupted");
  expect(runs.getPiRun("no-history")?.status).toBe("interrupted");
  expect(runs.getPiRun("queued")?.status).toBe("queued");
  const recovered = runs.chatRunSnapshot("app", "chat");
  expect(recovered.executions.running.steps[0]).toMatchObject({
    outcome: "incomplete",
    startedAt: time,
  });
  expect(recovered.executions["no-history"]).toBeUndefined();
  expect(recovered.executions.succeeded).toEqual(snapshot.executions.succeeded);
  const retry = runs.retryPiRun("app", "chat", "running");
  expect(retry.run.retryOfId).toBe("running");
  expect(runs.chatRunSnapshot("app", "chat").executions[retry.run.id]).toEqual({
    steps: [],
    omitted: 0,
  });
  runs.cancelPiRun("app", "chat", "queued");
  expect(runs.getPiRun("queued")?.status).toBe("cancelled");
}, 20_000);

it.each(["copy", "delete"])(
  "rolls back the whole data move on %s failure, retaining a retryable v6 database",
  (stage) => {
    const old = new Database(path);
    if (stage === "copy") {
      old
        .prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?)")
        .run(
          "orphan",
          "workspace",
          "chat-execution",
          "Assistant reply",
          payload,
          time,
        );
    } else {
      old.exec(
        "CREATE TRIGGER reject_history_delete BEFORE DELETE ON activity_events BEGIN SELECT RAISE(ABORT, 'synthetic migration failure'); END;",
      );
    }
    const before = sourceRows(old);
    old.close();
    expect(() => pushTestDatabase(path)).toThrow();
    const failed = new Database(path);
    expect(failed.pragma("user_version", { simple: true })).toBe(6);
    expect(sourceRows(failed)).toEqual(before);
    expect(historyRows(failed)).toEqual([]);
    if (stage === "copy")
      failed.exec("DELETE FROM activity_events WHERE id = 'orphan'");
    else failed.exec("DROP TRIGGER reject_history_delete");
    failed.close();
    pushTestDatabase(path);
    expect(
      Object.keys(runs.chatRunSnapshot("app", "chat").executions),
    ).toHaveLength(5);
  },
  20_000,
);

it("does not overwrite a conflicting destination row when retrying an incomplete upgrade", () => {
  pushTestDatabase(path);
  const db = new Database(path);
  db.pragma("user_version = 6");
  db.prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?)").run(
    "succeeded",
    "workspace",
    "chat-execution",
    "Assistant reply",
    "different source payload",
    time,
  );
  const before = historyRows(db);
  db.close();
  expect(() => pushTestDatabase(path)).toThrow();
  const failed = new Database(path);
  try {
    expect(failed.pragma("user_version", { simple: true })).toBe(6);
    expect(historyRows(failed)).toEqual(before);
    expect(
      failed
        .prepare("SELECT detail FROM activity_events WHERE id = 'succeeded'")
        .get(),
    ).toEqual({ detail: "different source payload" });
  } finally {
    failed.close();
  }
}, 20_000);

it("cascades migrated history with its Run and application, and rolls deletions back atomically", () => {
  pushTestDatabase(path);
  const db = store.db().$client;
  expect(() =>
    store.withTransaction(() => {
      db.prepare("DELETE FROM pi_runs WHERE id = 'succeeded'").run();
      expect(
        db
          .prepare(
            "SELECT * FROM reply_execution_history WHERE run_id = 'succeeded'",
          )
          .get(),
      ).toBeUndefined();
      throw new Error("synthetic rollback");
    }),
  ).toThrow("synthetic rollback");
  expect(runs.chatRunSnapshot("app", "chat").executions.succeeded).toEqual(
    JSON.parse(payload),
  );
  db.prepare("DELETE FROM pi_runs WHERE id = 'cancelled'").run();
  expect(historyRows(db)).toHaveLength(4);
  expect(store.listActivity("workspace")).toHaveLength(1);
  store.deleteApplication("app");
  expect(historyRows(db)).toEqual([]);
  expect(sourceRows(db)).toEqual([]);
  expect(db.pragma("foreign_key_check")).toEqual([]);
}, 20_000);
