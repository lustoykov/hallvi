import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import { executePiRun } from "../../../src/server/pi-worker";
import {
  diagnosticMetadata,
  MAX_EXECUTION_STEPS,
  startHistoryStep,
} from "../../../src/server/run-history";
import {
  beginRunTrace,
  langfuseTraceUrl,
  shutdownTracing,
} from "../../../src/server/tracing";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  spans: [] as unknown[],
  unavailable: false,
}));
vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.ask,
}));
vi.mock("@langfuse/otel", async () => {
  const { SimpleSpanProcessor } = await import("@opentelemetry/sdk-trace-base");
  return {
    LangfuseSpanProcessor: class extends SimpleSpanProcessor {
      constructor() {
        super({
          export(spans, callback) {
            mocks.spans.push(...spans);
            callback({ code: mocks.unavailable ? 1 : 0 });
          },
          shutdown: async () => {},
        });
      }
    },
  };
});
let root: string, app: string, chat: string, workspace: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-history-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(async () => {
  await shutdownTracing();
  vi.stubEnv("SERVER_GUY_TRACING", "0");
  store.db().$client.exec("DELETE FROM applications");
  app = store.insertApplication({
    name: "audit",
    repositoryUrl: "https://github.com/qa/audit",
    repositoryOwner: "qa",
    repositoryName: "audit",
    environment: "production",
    approvalMode: "pi-decides",
    approvalScope: "test",
  }).id;
  workspace = store.insertWorkspace(app).id;
  chat = store.insertChat(workspace, "Main", true).id;
  mocks.spans.length = 0;
  mocks.unavailable = false;
  mocks.ask.mockReset().mockImplementation(async (_input, options) => {
    options.onActivity({ type: "start", key: "model:1", kind: "model" });
    options.onActivity({
      type: "end",
      key: "model:1",
      metadata: {
        model: "fixture",
        inputTokens: 12,
        outputTokens: 4,
        password: "secret-canary",
        output: "secret-canary",
      },
    });
    options.onActivity({
      type: "start",
      key: "tool:1",
      kind: "propose_decision",
    });
    options.onActivity({ type: "end", key: "tool:1" });
    return {
      message: "Saved: secret-canary",
      decisionProposals: [
        { kind: "launch-priority", value: "Keep data in the EU" },
      ],
    };
  });
});
afterAll(async () => {
  await shutdownTracing();
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
function queued() {
  return runs.sendChatMessage(app, chat, "secret-canary", randomUUID()).run;
}
// Execution history travels with the Chat's Runs, never through the feed.
function execution(id: string) {
  return runs.chatRunSnapshot(app, chat).executions[id];
}
function status(id: string) {
  return runs.getPiRun(id)?.status;
}

it("persists ordered steps and committed requirement links, deduplicates submissions and reconstructs after reopening SQLite", async () => {
  const run = queued();
  expect(
    runs.sendChatMessage(app, chat, "secret-canary", run.requestKey).run.id,
  ).toBe(run.id);
  expect(status(run.id)).toBe("queued");
  expect(execution(run.id)).toEqual({ steps: [], omitted: 0 });
  await executePiRun(runs.claimNextPiRun()!);
  expect(status(run.id)).toBe("succeeded");
  expect(execution(run.id).steps.map((s) => s.id)).toEqual([
    "context",
    "model:1",
    "tool:1",
    "save",
  ]);
  expect(execution(run.id).steps.every((s) => s.outcome === "completed")).toBe(
    true,
  );
  expect(execution(run.id).decisionIds).toEqual(
    store.listActiveDecisions(app).map((d) => d.id),
  );
  expect(JSON.stringify(execution(run.id))).not.toContain("secret-canary");
  // The application feed records the committed requirement once; the reply
  // itself is not an application event.
  expect(
    store
      .listActivity(workspace)
      .map((event) => [event.kind, event.summary, event.detail]),
  ).toEqual([
    ["decision-recorded", "Requirement saved", "Keep data in the EU"],
  ]);
  const before = execution(run.id);
  store.db().$client.close();
  delete globalThis.__serverGuyDb;
  expect(execution(run.id)).toEqual(before);
  const other = store.insertApplication({
    name: "other",
    repositoryUrl: "https://github.com/qa/other",
    repositoryOwner: "qa",
    repositoryName: "other",
    environment: "production",
    approvalMode: "pi-decides",
    approvalScope: "test",
  });
  expect(() => runs.chatRunSnapshot(other.id, chat)).toThrow();
});

it("records no application event for an ordinary reply or lookup while keeping its execution inspectable", async () => {
  mocks.ask.mockImplementation(async (_input, options) => {
    options.onActivity({
      type: "start",
      key: "tool:1",
      kind: "search_decisions",
    });
    options.onActivity({ type: "end", key: "tool:1" });
    return { message: "No saved requirements yet.", decisionProposals: [] };
  });
  const run = queued();
  await executePiRun(runs.claimNextPiRun()!);
  expect(status(run.id)).toBe("succeeded");
  expect(execution(run.id).steps.map((s) => s.id)).toEqual([
    "context",
    "tool:1",
    "save",
  ]);
  expect(execution(run.id).decisionIds).toEqual([]);
  expect(store.listActivity(workspace)).toEqual([]);
});

it("keeps completed tool evidence when final validation rejects all writes, without a success event", async () => {
  mocks.ask.mockImplementation(async (_input, options) => {
    options.onActivity({
      type: "start",
      key: "tool:1",
      kind: "propose_decision",
    });
    options.onActivity({ type: "end", key: "tool:1" });
    return {
      message: "Saved",
      decisionProposals: [
        { kind: "launch-priority", value: "Budget", replaces: randomUUID() },
      ],
    };
  });
  const run = queued();
  await executePiRun(runs.claimNextPiRun()!);
  expect(status(run.id)).toBe("failed");
  expect(execution(run.id).steps.find((s) => s.id === "tool:1")?.outcome).toBe(
    "completed",
  );
  expect(execution(run.id).steps.at(-1)?.outcome).toBe("failed");
  expect(execution(run.id).decisionIds).toBeUndefined();
  expect(store.listActiveDecisions(app)).toEqual([]);
  expect(store.listActivity(workspace)).toEqual([]);
});

it.each(["cancelled", "timed-out", "interrupted"] as const)(
  "marks unfinished steps incomplete on %s and preserves retry lineage",
  (status) => {
    const run = queued();
    runs.claimNextPiRun();
    startHistoryStep(run.id, "model:1", "model");
    if (status === "interrupted") runs.interruptRunningPiRuns();
    else runs.finishPiRun(run.id, status, "Stopped");
    expect(execution(run.id).steps[0].outcome).toBe("incomplete");
    expect(startHistoryStep(run.id, "late", "model")).toBe(false);
    const retry = runs.retryPiRun(app, chat, run.id);
    expect(retry.run.retryOfId).toBe(run.id);
    expect(
      Object.keys(runs.chatRunSnapshot(app, chat).executions).sort(),
    ).toEqual([run.id, retry.run.id].sort());
    expect(store.listActivity(workspace)).toEqual([]);
  },
);

it("rolls back saved Decision links with a failed final commit, then retains failure diagnostics", async () => {
  const run = queued();
  store.db().$client.exec(`
    CREATE TRIGGER reject_final_run BEFORE UPDATE ON pi_runs
    WHEN NEW.status = 'succeeded'
    BEGIN SELECT RAISE(ABORT, 'synthetic final commit failure'); END;
  `);
  try {
    await executePiRun(runs.claimNextPiRun()!);
    expect(status(run.id)).toBe("failed");
    expect(execution(run.id).decisionIds).toBeUndefined();
    expect(
      execution(run.id).steps.find((step) => step.id === "tool:1")?.outcome,
    ).toBe("completed");
    expect(execution(run.id).steps.at(-1)?.outcome).toBe("failed");
    expect(store.listActiveDecisions(app)).toEqual([]);
    expect(store.listActivity(workspace)).toEqual([]);
    expect(store.listMessages(chat).at(-1)?.status).toBe("failed");
    expect(
      store
        .db()
        .$client.prepare(
          "SELECT count(*) AS count FROM reply_execution_history WHERE run_id = ?",
        )
        .get(run.id),
    ).toEqual({ count: 1 });
    expect(
      store
        .db()
        .$client.prepare(
          "SELECT count(*) AS count FROM activity_events WHERE kind = 'chat-execution'",
        )
        .get(),
    ).toEqual({ count: 0 });
  } finally {
    store.db().$client.exec("DROP TRIGGER reject_final_run");
  }
});

it("bounds diagnostic growth and only retains selected numeric/model metadata", () => {
  const run = queued();
  runs.claimNextPiRun();
  for (let i = 0; i < MAX_EXECUTION_STEPS + 5; i++)
    startHistoryStep(run.id, `tool:${i}`, "tool");
  expect(execution(run.id).steps).toHaveLength(MAX_EXECUTION_STEPS);
  expect(execution(run.id).omitted).toBe(5);
  expect(
    diagnosticMetadata({
      inputTokens: -1,
      outputTokens: Infinity,
      model: "sk-secret",
      provider: "authorization bearer secret",
      error: "secret",
      arguments: "secret",
    }),
  ).toEqual({});
});

it.each([false, true])(
  "exports correlated metadata without content and survives exporter failure=%s",
  async (unavailable) => {
    vi.stubEnv("SERVER_GUY_TRACING", "1");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "synthetic");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "synthetic");
    vi.stubEnv("LANGFUSE_PROJECT_ID", "test-project");
    vi.stubEnv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com");
    mocks.unavailable = unavailable;
    const run = queued();
    await executePiRun(runs.claimNextPiRun()!);
    await shutdownTracing();
    expect(status(run.id)).toBe("succeeded");
    const spans =
      mocks.spans as import("@opentelemetry/sdk-trace-base").ReadableSpan[];
    expect(spans.length).toBeGreaterThan(3);
    expect(new Set(spans.map((s) => s.spanContext().traceId)).size).toBe(1);
    expect(JSON.stringify(spans.map((s) => s.attributes))).not.toContain(
      "secret-canary",
    );
    expect(execution(run.id).traceUrl).toMatch(
      /^https:\/\/cloud.langfuse.com\/project\/test-project\/traces\/[a-f0-9]{32}$/,
    );
    // Export state never changes the product outcome or the feed.
    expect(store.listActivity(workspace).map((event) => event.kind)).toEqual([
      "decision-recorded",
    ]);
  },
);

it("does not present unsafe trace URLs", () => {
  vi.stubEnv("SERVER_GUY_TRACING", "1");
  vi.stubEnv("LANGFUSE_PROJECT_ID", "test");
  vi.stubEnv("LANGFUSE_BASE_URL", "javascript:alert(1)");
  expect(langfuseTraceUrl("a".repeat(32))).toBeUndefined();
  const run = queued();
  runs.claimNextPiRun();
  const trace = beginRunTrace(run);
  trace.finish("interrupted");
});
