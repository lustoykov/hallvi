import Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import { pushTestDatabase } from "../../test-database";

let root: string;
afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it.each([6, 7])(
  "opens prior v%s data without deleting or reconstructing historical diagnostics",
  (version) => {
    root = mkdtempSync(join(tmpdir(), "server-guy-compatibility-"));
    const path = join(root, "synthetic.db");
    vi.stubEnv("SERVER_GUY_DB_PATH", path);
    const old = new Database(path);
    old.exec(readFileSync("tests/fixtures/schema-v6.sql", "utf8"));
    old.close();
    const app = store.insertApplication({
      name: "Synthetic",
      repositoryUrl: "https://github.com/qa/test",
      repositoryOwner: "qa",
      repositoryName: "test",
      environment: "production",
      approvalMode: "pi-decides",
      approvalScope: "test",
    });
    const workspace = store.insertWorkspace(app.id);
    const chat = store.insertChat(workspace.id, "Main", true);
    const run = runs.sendChatMessage(
      app.id,
      chat.id,
      "Synthetic message",
      crypto.randomUUID(),
    ).run;
    runs.claimNextPiRun();
    const payload =
      '{"steps": [{"outcome":"running"}], "omitted": 3, "traceId":"synthetic"}';
    store
      .db()
      .$client.prepare("INSERT INTO activity_events VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        run.id,
        workspace.id,
        "chat-execution",
        "Assistant reply",
        payload,
        run.createdAt,
      );
    if (version === 7) {
      store.db().$client
        .exec(`CREATE TABLE reply_execution_history (run_id text PRIMARY KEY NOT NULL REFERENCES pi_runs(id) ON DELETE CASCADE, detail text NOT NULL);
      INSERT INTO reply_execution_history SELECT id, detail FROM activity_events WHERE kind='chat-execution';
      DELETE FROM activity_events WHERE kind='chat-execution'; PRAGMA user_version=7;`);
    }
    store.db().$client.close();
    delete globalThis.__serverGuyDb;
    if (version === 6) {
      pushTestDatabase(path);
      pushTestDatabase(path);
    } else expect(() => pushTestDatabase(path)).toThrow();
    const db = store.db().$client;
    expect(db.pragma("user_version", { simple: true })).toBe(version);
    const retained = () =>
      version === 7
        ? db
            .prepare(
              "SELECT detail FROM reply_execution_history WHERE run_id=?",
            )
            .get(run.id)
        : db
            .prepare("SELECT detail FROM activity_events WHERE id=?")
            .get(run.id);
    expect(retained()).toEqual({ detail: payload });
    expect(runs.chatRunSnapshot(app.id, chat.id)).not.toHaveProperty(
      "executions",
    );
    expect(store.listActivity(workspace.id)).toEqual([]);
    runs.interruptRunningPiRuns();
    expect(runs.getPiRun(run.id)?.status).toBe("interrupted");
    expect(retained()).toEqual({ detail: payload });
    const retry = runs.retryPiRun(app.id, chat.id, run.id);
    expect(retry.run.retryOfId).toBe(run.id);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(store.listMessages(chat.id)).toHaveLength(3);
  },
  20_000,
);
