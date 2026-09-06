import { createServer } from "node:http";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import { executePiRun } from "../../../src/server/pi-worker";
import {
  diagnosticLogPath,
  MAX_DIAGNOSTIC_STEPS,
} from "../../../src/server/diagnostics";
import { beginRunTrace, shutdownTracing } from "../../../src/server/tracing";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({
  ask: vi.fn(),
  spans: [] as unknown[],
  unavailable: false,
  langfuseCreated: 0,
  failSetup: false,
  onExport: undefined as
    | ((spans: import("@opentelemetry/sdk-trace-base").ReadableSpan[]) => void)
    | undefined,
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
        if (mocks.failSetup)
          throw new Error("synthetic exporter setup failure");
        super({
          export(spans, callback) {
            mocks.spans.push(...spans);
            mocks.onExport?.(spans);
            callback({ code: mocks.unavailable ? 1 : 0 });
          },
          shutdown: async () => {},
        });
        mocks.langfuseCreated++;
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
  rmSync(diagnosticLogPath(), { force: true });
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
  mocks.langfuseCreated = 0;
  mocks.failSetup = false;
  mocks.onExport = undefined;
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
function logs(id?: string): Record<string, unknown>[] {
  try {
    return readFileSync(diagnosticLogPath(), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((row) => !id || row.runId === id);
  } catch {
    return [];
  }
}
function status(id: string) {
  return runs.getPiRun(id)?.status;
}

it("logs bounded correlated steps with export disabled and preserves only authoritative state on reload", async () => {
  const run = queued();
  expect(
    runs.sendChatMessage(app, chat, "secret-canary", run.requestKey).run.id,
  ).toBe(run.id);
  expect(
    logs(run.id).filter((row) => row.event === "reply.accepted"),
  ).toHaveLength(1);
  await executePiRun(runs.claimNextPiRun()!);
  expect(status(run.id)).toBe("succeeded");
  const output = logs(run.id);
  expect(
    output
      .filter((row) => row.event === "step.finished")
      .map((row) => row.stepId),
  ).toEqual(["context", "model:1", "tool:1", "save"]);
  expect(output.find((row) => row.event === "reply.succeeded")).toMatchObject({
    outcome: "succeeded",
    metadata: { requirements: 1 },
  });
  expect(
    output.every(
      (row) =>
        row.runId === run.id &&
        row.chatId === chat &&
        row.applicationId === app &&
        typeof row.timestamp === "string",
    ),
  ).toBe(true);
  expect(JSON.stringify(output)).not.toContain("secret-canary");
  expect(output.some((row) => row.traceId)).toBe(false);
  expect(store.listActivity(workspace).map((event) => event.kind)).toEqual([
    "decision-recorded",
  ]);
  const snapshot = runs.chatRunSnapshot(app, chat);
  expect(snapshot).not.toHaveProperty("executions");
  expect(
    store
      .db()
      .$client.prepare(
        "SELECT name FROM sqlite_master WHERE name = 'reply_execution_history'",
      )
      .get(),
  ).toBeUndefined();
  expect(
    store
      .db()
      .$client.prepare(
        "SELECT count(*) AS n FROM activity_events WHERE kind = 'chat-execution'",
      )
      .get(),
  ).toEqual({ n: 0 });
  store.db().$client.close();
  delete globalThis.__serverGuyDb;
  expect(runs.chatRunSnapshot(app, chat)).toEqual(snapshot);
});

it("keeps tool completion diagnostic while a rejected save leaves no successful outcome or Decision", async () => {
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
  expect(
    logs(run.id).find(
      (row) => row.event === "step.finished" && row.stepId === "tool:1",
    ),
  ).toMatchObject({ outcome: "completed" });
  expect(
    logs(run.id).find(
      (row) => row.event === "step.finished" && row.stepId === "save",
    ),
  ).toMatchObject({ outcome: "failed" });
  expect(
    logs(run.id).find((row) => row.event === "reply.failed"),
  ).toMatchObject({ errorCategory: "validation" });
  expect(logs(run.id).some((row) => row.event === "reply.succeeded")).toBe(
    false,
  );
  expect(store.listActiveDecisions(app)).toEqual([]);
  expect(store.listActivity(workspace)).toEqual([]);
});

it("defers accepted, cancelled and successful outcome claims until the outer transaction commits", () => {
  let rolledBack = "";
  expect(() =>
    store.withTransaction(() => {
      rolledBack = queued().id;
      expect(logs(rolledBack)).toEqual([]);
      throw new Error("rollback");
    }),
  ).toThrow("rollback");
  expect(status(rolledBack)).toBeUndefined();
  expect(logs(rolledBack)).toEqual([]);
  const run = queued();
  runs.claimNextPiRun();
  expect(() =>
    store.withTransaction(() => {
      runs.completePiRun(run.id, {
        message: "Synthetic",
        decisionProposals: [],
      });
      expect(logs(run.id).some((row) => row.event === "reply.succeeded")).toBe(
        false,
      );
      throw new Error("rollback");
    }),
  ).toThrow("rollback");
  expect(status(run.id)).toBe("running");
  expect(logs(run.id).some((row) => row.event === "reply.succeeded")).toBe(
    false,
  );
  store.withTransaction(() => {
    runs.cancelPiRun(app, chat, run.id);
    expect(logs(run.id).some((row) => row.event === "reply.cancelled")).toBe(
      false,
    );
  });
  expect(
    logs(run.id).filter((row) => row.event === "reply.cancelled"),
  ).toHaveLength(1);
});

it("logs a final commit failure without saved claims and rolls Decisions and Activity back", async () => {
  const run = queued();
  store.db().$client
    .exec(`CREATE TRIGGER reject_final_run BEFORE UPDATE ON pi_runs WHEN NEW.status = 'succeeded'
    BEGIN SELECT RAISE(ABORT, 'synthetic-secret-canary'); END;`);
  try {
    await executePiRun(runs.claimNextPiRun()!);
    expect(status(run.id)).toBe("failed");
    expect(store.listActiveDecisions(app)).toEqual([]);
    expect(store.listActivity(workspace)).toEqual([]);
    expect(logs(run.id).some((row) => row.event === "reply.succeeded")).toBe(
      false,
    );
    expect(
      logs(run.id).find((row) => row.event === "reply.failed"),
    ).toMatchObject({ errorCategory: "storage" });
    expect(
      logs(run.id).find(
        (row) => row.event === "step.finished" && row.stepId === "save",
      ),
    ).toMatchObject({ outcome: "failed" });
    expect(JSON.stringify(logs(run.id))).not.toContain("secret-canary");
  } finally {
    store.db().$client.exec("DROP TRIGGER reject_final_run");
  }
});

it.each(["cancelled", "timed-out", "interrupted"] as const)(
  "retains %s and retry lineage with diagnostic steps incomplete",
  (status) => {
    const run = queued();
    const claimed = runs.claimNextPiRun()!;
    const execution = beginRunTrace(claimed);
    execution.signal({ type: "start", key: "model:1", kind: "model" });
    if (status === "interrupted") runs.interruptRunningPiRuns();
    else runs.finishPiRun(run.id, status, "Stopped");
    execution.finish(status);
    execution.signal({ type: "start", key: "tool:99", kind: "tool" });
    execution.finish(status);
    expect(
      logs(run.id).filter((row) => row.event === "step.finished"),
    ).toHaveLength(1);
    expect(
      logs(run.id).find((row) => row.event === "step.finished"),
    ).toMatchObject({ outcome: "incomplete" });
    expect(logs(run.id).some((row) => row.stepId === "tool:99")).toBe(false);
    const retry = runs.retryPiRun(app, chat, run.id);
    runs.retryPiRun(app, chat, run.id);
    expect(retry.run.retryOfId).toBe(run.id);
    expect(
      logs(retry.run.id).filter((row) => row.event === "reply.retry"),
    ).toHaveLength(1);
    expect(logs(retry.run.id)[0].retryOfId).toBe(run.id);
    expect(store.listActivity(workspace)).toEqual([]);
  },
);

it("bounds total spans/steps, deduplicates callbacks and cleans up even without export", () => {
  const run = queued();
  const execution = beginRunTrace(runs.claimNextPiRun()!);
  for (let i = 0; i < MAX_DIAGNOSTIC_STEPS + 5; i++) {
    execution.signal({ type: "start", key: `tool:${i}`, kind: "tool" });
    execution.signal({ type: "end", key: `tool:${i}` });
  }
  execution.signal({ type: "start", key: "tool:0", kind: "tool" });
  execution.finish("succeeded");
  expect(
    logs(run.id).filter((row) => row.event === "step.started"),
  ).toHaveLength(MAX_DIAGNOSTIC_STEPS);
  expect(
    logs(run.id).filter((row) => row.event === "step.finished"),
  ).toHaveLength(MAX_DIAGNOSTIC_STEPS);
  expect(
    logs(run.id).find((row) => row.event === "execution.omitted"),
  ).toMatchObject({ omitted: 5 });
});

it("an unwritable log destination cannot reject acceptance, success, cancellation or retry", async () => {
  const bad = join(root, "not-a-directory");
  writeFileSync(bad, "synthetic");
  vi.stubEnv("SERVER_GUY_LOG_DIR", bad);
  try {
    const run = queued();
    await executePiRun(runs.claimNextPiRun()!);
    expect(status(run.id)).toBe("succeeded");
    const cancelled = queued();
    runs.cancelPiRun(app, chat, cancelled.id);
    expect(status(cancelled.id)).toBe("cancelled");
    expect(runs.retryPiRun(app, chat, cancelled.id).run.status).toBe("queued");
    expect(store.listActiveDecisions(app)).toHaveLength(1);
  } finally {
    delete process.env.SERVER_GUY_LOG_DIR;
  }
});

it.each([401, 429, 503])(
  "retains safe provider status %s and gives actionable failure text without raw errors",
  async (statusCode) => {
    mocks.ask.mockRejectedValue(
      Object.assign(new Error("private-secret-canary"), { status: statusCode }),
    );
    const run = queued();
    await executePiRun(runs.claimNextPiRun()!);
    expect(status(run.id)).toBe("failed");
    expect(
      logs(run.id).find((row) => row.event === "reply.failed"),
    ).toMatchObject({ httpStatus: statusCode });
    expect(runs.getPiRun(run.id)?.error).not.toContain("secret-canary");
    expect(JSON.stringify(logs(run.id))).not.toContain("secret-canary");
  },
);

it.each([false, true])(
  "exports correlated metadata and survives exporter failure=%s",
  async (unavailable) => {
    vi.stubEnv("SERVER_GUY_TRACING", "1");
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "synthetic");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "synthetic");
    mocks.unavailable = unavailable;
    const run = queued();
    await executePiRun(runs.claimNextPiRun()!);
    await shutdownTracing();
    expect(status(run.id)).toBe("succeeded");
    const spans =
      mocks.spans as import("@opentelemetry/sdk-trace-base").ReadableSpan[];
    expect(spans.length).toBeGreaterThan(3);
    expect(new Set(spans.map((span) => span.spanContext().traceId)).size).toBe(
      1,
    );
    expect(logs(run.id).some((row) => typeof row.traceId === "string")).toBe(
      true,
    );
    expect(JSON.stringify(spans.map((span) => span.attributes))).not.toContain(
      "secret-canary",
    );
    expect(store.listActivity(workspace).map((event) => event.kind)).toEqual([
      "decision-recorded",
    ]);
  },
);

it("exports standard OTLP/HTTP to an explicit endpoint with SDK headers, taking precedence over Langfuse", async () => {
  const requests: {
    headers: import("node:http").IncomingHttpHeaders;
    body: string;
  }[] = [];
  const receiver = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push({ headers: request.headers, body });
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end("{}");
    });
  });
  receiver.listen(0, "127.0.0.1");
  await once(receiver, "listening");
  try {
    const address = receiver.address() as import("node:net").AddressInfo;
    vi.stubEnv("SERVER_GUY_TRACING", "1");
    vi.stubEnv(
      "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
      `http://127.0.0.1:${address.port}/v1/traces`,
    );
    vi.stubEnv(
      "OTEL_EXPORTER_OTLP_HEADERS",
      "x-shared=generic,x-scope=generic",
    );
    vi.stubEnv(
      "OTEL_EXPORTER_OTLP_TRACES_HEADERS",
      "authorization=synthetic-token,x-scope=traces",
    );
    vi.stubEnv("LANGFUSE_PUBLIC_KEY", "synthetic");
    vi.stubEnv("LANGFUSE_SECRET_KEY", "synthetic");
    vi.stubEnv("SERVER_GUY_TRACING", "0");
    const untraced = queued();
    await executePiRun(runs.claimNextPiRun()!);
    await shutdownTracing();
    expect(status(untraced.id)).toBe("succeeded");
    expect(requests).toEqual([]);
    expect(logs(untraced.id).some((row) => row.event === "step.finished")).toBe(
      true,
    );
    vi.stubEnv("SERVER_GUY_TRACING", "1");
    const run = queued();
    await executePiRun(runs.claimNextPiRun()!);
    await shutdownTracing();
    expect(status(run.id)).toBe("succeeded");
    expect(mocks.langfuseCreated).toBe(0);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests[0].headers).toMatchObject({
      authorization: "synthetic-token",
      "x-shared": "generic",
      "x-scope": "traces",
    });
    expect(JSON.parse(requests[0].body)).toHaveProperty("resourceSpans");
    expect(requests[0].body).not.toContain("secret-canary");
    expect(requests[0].body).not.toContain("synthetic-token");
    expect(JSON.stringify(logs(run.id))).not.toContain("synthetic-token");
  } finally {
    await shutdownTracing();
    receiver.closeAllConnections();
    receiver.close();
  }
}, 10_000);

it("ends the successful save span only after the outer SQLite commit", async () => {
  vi.stubEnv("SERVER_GUY_TRACING", "1");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "synthetic");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "synthetic");
  const run = queued();
  const saves: { inTransaction: boolean; status: string | undefined }[] = [];
  mocks.onExport = (spans) => {
    if (
      spans.some(
        (span) =>
          span.name === "Validate and save reply and requirements" &&
          span.attributes["server_guy.outcome"] === "completed",
      )
    )
      saves.push({
        inTransaction: store.db().$client.inTransaction,
        status: status(run.id),
      });
  };
  await executePiRun(runs.claimNextPiRun()!);
  await shutdownTracing();
  expect(saves).toEqual([{ inTransaction: false, status: "succeeded" }]);
});

it("continues local diagnostics and succeeds if telemetry initialization throws", async () => {
  vi.stubEnv("SERVER_GUY_TRACING", "1");
  vi.stubEnv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", "");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "synthetic");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "synthetic");
  mocks.failSetup = true;
  const run = queued();
  await executePiRun(runs.claimNextPiRun()!);
  expect(status(run.id)).toBe("succeeded");
  expect(
    logs(run.id).filter((row) => row.event === "step.finished"),
  ).toHaveLength(4);
});
