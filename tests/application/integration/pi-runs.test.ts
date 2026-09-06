import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  rmSync,
  cpSync,
  symlinkSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as store from "../../../src/server/db";
import * as runs from "../../../src/server/pi-runs";
import {
  acquireWorkerLock,
  executePiRun,
  PiWorkerDrainError,
} from "../../../src/server/pi-worker";
import { buildPiRunContext } from "../../../src/server/pi-run-context";
import { openNativeChatSession } from "../../../src/server/pi-sessions";
import { readPiApplicationStatus } from "../../../src/server/pi-status";
import {
  createChat,
  getPhaseOneOperatorView,
  removeApplication,
} from "../../../src/server/phase-one";
import { savePiConfiguration } from "../../../src/server/pi-configuration";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.ask,
}));
let root: string;
let applicationId: string;
let chatId: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "server-guy-durable-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  const app = store.insertApplication({
    name: "test",
    repositoryUrl: "https://github.com/qa/test",
    repositoryOwner: "qa",
    repositoryName: "test",
    environment: "production",
    approvalMode: "pi-decides",
    approvalScope: "test",
  });
  applicationId = app.id;
  chatId = store.insertChat(store.insertWorkspace(app.id).id, "Main", true).id;
  mocks.ask.mockReset().mockImplementation(async (_input, options) => {
    options.onModelCall?.();
    return { message: "Done", decisionProposals: [] };
  });
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const enqueue = (message = "Hello", chat = chatId, key = randomUUID()) =>
  runs.sendChatMessage(applicationId, chat, message, key);
const claimed = () => {
  const run = runs.claimNextPiRun();
  expect(run).not.toBeNull();
  return run!;
};

describe("durable Pi acceptance and outcomes", () => {
  it("accepts immediately, deduplicates identical submissions, rejects key reuse and wrong ownership", () => {
    const key = randomUUID();
    const accepted = enqueue("Hello", chatId, key);
    expect(accepted.run.status).toBe("queued");
    expect(enqueue("Hello", chatId, key)).toEqual(accepted);
    expect(() => enqueue("Different", chatId, key)).toThrow(
      "different message",
    );
    expect(() =>
      runs.sendChatMessage("wrong", chatId, "Hello", randomUUID()),
    ).toThrow("Application not found");
    expect(store.listMessages(chatId)).toMatchObject([
      { role: "user", status: "completed" },
      { role: "assistant", status: "queued", body: "" },
    ]);
    expect(mocks.ask).not.toHaveBeenCalled();
  });
  it("serializes Chats, shares saved Decisions and sends only scoped operational context", async () => {
    const second = createChat(applicationId, "Second").selectedChatId!;
    enqueue("priority: recover");
    const later = enqueue("What priority?", second);
    mocks.ask.mockResolvedValueOnce({
      message: "Recovery noted",
      decisionProposals: [
        { kind: "launch-priority", value: "Recover quickly" },
      ],
    });
    const first = claimed();
    expect(runs.claimNextPiRun()).toBeNull();
    await executePiRun(first);
    expect(claimed().id).toBe(later.run.id);
    await executePiRun(runs.getPiRun(later.run.id)!);
    expect(store.listActiveDecisions(applicationId)).toMatchObject([
      { value: "Recover quickly" },
    ]);
    const secondInput = mocks.ask.mock.calls[1][0];
    expect(secondInput).toMatchObject({
      run: { chatId: second, applicationId },
      userMessage: "What priority?",
    });
    expect(Object.keys(secondInput).sort()).toEqual([
      "phaseKey",
      "run",
      "runContext",
      "userMessage",
    ]);
    expect(secondInput.phaseKey).toBe("start");
    expect(JSON.parse(secondInput.runContext)).toMatchObject({
      chatId: second,
      applicationId,
      previousAttempt: null,
    });
    expect(secondInput.runContext).not.toContain("Recover quickly");
    // No automatic application summary: check labels, results and the
    // Approval Mode reach Pi only through the scoped status tool.
    expect(JSON.parse(secondInput.runContext)).not.toHaveProperty(
      "currentApplication",
    );
    expect(secondInput.runContext).not.toContain("GitHub repository access");
    expect(secondInput.runContext).not.toContain("Let Server Guy decide");
  });
  it("rolls back all Decisions and final text if a later proposal is invalid", async () => {
    const before = getPhaseOneOperatorView(applicationId);
    const accepted = enqueue();
    mocks.ask.mockResolvedValueOnce({
      message: "Saved both!",
      decisionProposals: [
        { kind: "launch-priority", value: "Valid" },
        { kind: "launch-priority", value: "Invalid", replaces: randomUUID() },
      ],
    });
    await executePiRun(claimed());
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("failed");
    expect(store.listActiveDecisions(applicationId)).toEqual([]);
    // The rolled-back save leaves no requirement event; the failed attempt
    // remains recorded.
    expect(store.listActivity(before.workspace!.id)).toEqual(before.activity);
    expect(store.listMessages(chatId).at(-1)).toMatchObject({
      body: "",
      status: "failed",
    });
  });
  it("cancels queued work without a model call; retries have lineage and one original user message", async () => {
    const first = enqueue();
    runs.cancelPiRun(applicationId, chatId, first.run.id);
    expect(runs.claimNextPiRun()).toBeNull();
    expect(mocks.ask).not.toHaveBeenCalled();
    const retry = runs.retryPiRun(applicationId, chatId, first.run.id);
    expect(runs.retryPiRun(applicationId, chatId, first.run.id)).toEqual(retry);
    expect(retry.run.retryOfId).toBe(first.run.id);
    await executePiRun(claimed());
    expect(
      store.listMessages(chatId).filter((message) => message.role === "user"),
    ).toHaveLength(1);
    expect(runs.cancelPiRun(applicationId, chatId, retry.run.id).status).toBe(
      "succeeded",
    );
    expect(() => runs.retryPiRun(applicationId, chatId, retry.run.id)).toThrow(
      "unsuccessful",
    );
  });
  it.each(["cancel", "remove", "timeout"] as const)(
    "rejects late callbacks after %s",
    async (action) => {
      let finish!: (reply: { message: string; decisionProposals: [] }) => void;
      mocks.ask.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const accepted = enqueue();
      const work = executePiRun(claimed(), {
        timeoutMs: action === "timeout" ? 25 : 5_000,
      });
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"), {
        interval: 1,
      });
      if (action === "cancel")
        runs.cancelPiRun(applicationId, chatId, accepted.run.id);
      if (action === "remove") store.deleteApplication(applicationId);
      if (action === "timeout")
        await new Promise((resolve) => setTimeout(resolve, 40));
      finish({ message: "Late result", decisionProposals: [] });
      await work;
      expect(
        store
          .listMessages(chatId)
          .some((message) => message.body === "Late result"),
      ).toBe(false);
      expect(runs.getPiRun(accepted.run.id)?.status).toBe(
        action === "remove"
          ? undefined
          : action === "cancel"
            ? "cancelled"
            : "timed-out",
      );
    },
  );
  it("persists increasing public draft revisions, then atomically completes", async () => {
    let finish!: (reply: { message: string; decisionProposals: [] }) => void;
    mocks.ask.mockImplementationOnce((_input, options) => {
      options.onModelCall();
      options.onText("Public draft");
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const accepted = enqueue();
    const work = executePiRun(claimed());
    await vi.waitFor(() =>
      expect(store.listMessages(chatId).at(-1)?.body).toBe("Public draft"),
    );
    const draft = store.listMessages(chatId).at(-1)!;
    expect(draft.status).toBe("running");
    finish({ message: "Final answer", decisionProposals: [] });
    await work;
    expect(store.listMessages(chatId).at(-1)!.revision).toBeGreaterThan(
      draft.revision,
    );
    expect(runs.getPiRun(accepted.run.id)).toMatchObject({
      status: "succeeded",
      piCalls: 1,
    });
  });
  it("rejects an archived Chat and scoped run operations from another Chat", () => {
    const accepted = enqueue();
    const other = createChat(applicationId, "Other").selectedChatId!;
    expect(() =>
      runs.cancelPiRun(applicationId, other, accepted.run.id),
    ).toThrow("not found");
    expect(() =>
      runs.retryPiRun(applicationId, other, accepted.run.id),
    ).toThrow("not found");
    store.archiveChat(chatId);
    expect(() => enqueue()).toThrow("archived");
  });
  it("only one worker owns the database lock; crash recovery interrupts running work", () => {
    const release = acquireWorkerLock();
    try {
      expect(() => acquireWorkerLock()).toThrow("already running");
    } finally {
      release();
    }
    const first = enqueue();
    claimed();
    const queued = enqueue("Next");
    runs.interruptRunningPiRuns();
    expect(runs.getPiRun(first.run.id)?.status).toBe("interrupted");
    expect(claimed().id).toBe(queued.run.id);
  });
});

describe("minimal native Run context", () => {
  it.each(["failed", "cancelled", "interrupted", "timed-out"] as const)(
    "carries the actual %s attempt outcome without treating its history as saved effects",
    async (status) => {
      const previous = enqueue("An attempted change");
      claimed();
      runs.finishPiRun(previous.run.id, status, "Synthetic terminal outcome");
      enqueue("What is saved now?");
      await executePiRun(claimed());
      const context = JSON.parse(mocks.ask.mock.calls[0][0].runContext);
      expect(context).toMatchObject({
        applicationId,
        chatId,
        previousAttempt: { runId: previous.run.id, status },
      });
      expect(context.previousAttempt.savedOutcome).toContain(
        "pending, not saved; none were committed",
      );
      // The envelope carries identity and outcome only; current checks and
      // Approval Mode are read on demand through get_application_status.
      expect(Object.keys(context).sort()).toEqual([
        "applicationId",
        "chatId",
        "createdAt",
        "previousAttempt",
        "runId",
        "userMessageId",
      ]);
      expect(context).not.toHaveProperty("currentApplication");
      expect(context).not.toHaveProperty("decisions");
    },
  );
  it("identifies a committed previous answer and excludes other Chats' outcomes", async () => {
    const previous = enqueue();
    await executePiRun(claimed());
    enqueue("Next");
    const next = claimed();
    const context = JSON.parse(buildPiRunContext(next));
    expect(context.previousAttempt).toMatchObject({
      runId: previous.run.id,
      status: "succeeded",
    });
    expect(context.previousAttempt.savedOutcome).toContain("were committed");
    runs.finishPiRun(next.id, "cancelled", "Stop test");
    const other = createChat(applicationId, "Other").selectedChatId!;
    enqueue("Fresh Chat", other);
    expect(JSON.parse(buildPiRunContext(claimed())).previousAttempt).toBeNull();
  });
  it("does not inject large Decision collections, legacy summaries or completed transcripts", async () => {
    const source = store.insertMessage(
      chatId,
      "user",
      "Original historical text",
      "user",
    );
    for (let index = 0; index < 100; index++)
      store.insertDecision({
        applicationId,
        sourceMessageId: source.id,
        kind: "launch-priority",
        label: "Priority",
        value: `Decision-${index} ${"x".repeat(280)}`,
      });
    store
      .db()
      .$client.prepare("INSERT INTO chat_summaries VALUES (?, ?, ?, ?)")
      .run(chatId, "Old model-authored summary", source.id, "2026-09-05");
    enqueue("Hello");
    await executePiRun(claimed());
    expect(mocks.ask).toHaveBeenCalledOnce();
    const passed = mocks.ask.mock.calls[0][0];
    expect(passed.userMessage).toBe("Hello");
    expect(passed.runContext).not.toContain("Decision-");
    expect(passed.runContext).not.toContain("Old model-authored summary");
    expect(passed.runContext).not.toContain("Original historical text");
    expect(
      store.db().$client.prepare("SELECT body FROM chat_summaries").get(),
    ).toEqual({ body: "Old model-authored summary" });
  });
  it("no longer sizes application state before a reply; an oversized status is the lookup's own tool error", async () => {
    store
      .db()
      .$client.prepare("UPDATE applications SET name = ? WHERE id = ?")
      .run("x".repeat(12_001), applicationId);
    const accepted = enqueue();
    await executePiRun(claimed());
    expect(mocks.ask).toHaveBeenCalledOnce();
    expect(mocks.ask.mock.calls[0][0].runContext).not.toContain("xxxx");
    expect(runs.getPiRun(accepted.run.id)).toMatchObject({
      status: "succeeded",
    });
    expect(() => readPiApplicationStatus(applicationId, chatId)).toThrow(
      "larger than the supported tool result",
    );
  });
  it("fails before model execution when the Chat can no longer be loaded", async () => {
    const accepted = enqueue();
    const run = claimed();
    store.archiveChat(chatId);
    await executePiRun(run);
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(runs.getPiRun(accepted.run.id)).toMatchObject({
      status: "failed",
      piCalls: 0,
    });
  });
  it("counts tool-loop and compaction model calls from adapter events", async () => {
    mocks.ask.mockImplementationOnce(async (_input, options) => {
      options.onModelCall();
      options.onModelCall();
      options.onModelCall();
      return { message: "Done", decisionProposals: [] };
    });
    const accepted = enqueue();
    await executePiRun(claimed());
    expect(runs.getPiRun(accepted.run.id)).toMatchObject({
      status: "succeeded",
      piCalls: 3,
    });
  });
});

describe("worker settlement", () => {
  it.each(["cancel", "shutdown"] as const)(
    "waits for an unsettled adapter after %s and rejects late Decisions",
    async (action) => {
      let finish!: (reply: {
        message: string;
        decisionProposals: Array<{ kind: "launch-priority"; value: string }>;
      }) => void;
      mocks.ask.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const accepted = enqueue();
      const controller = new AbortController();
      let settled = false;
      const work = executePiRun(claimed(), { signal: controller.signal }).then(
        (result) => {
          settled = true;
          return result;
        },
      );
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      if (action === "cancel")
        runs.cancelPiRun(applicationId, chatId, accepted.run.id);
      else controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(settled).toBe(false);
      finish({
        message: "Late claimed success",
        decisionProposals: [
          { kind: "launch-priority", value: "Must not be saved" },
        ],
      });
      await work;
      expect(store.listActiveDecisions(applicationId)).toEqual([]);
      expect(runs.getPiRun(accepted.run.id)?.status).toBe(
        action === "cancel" ? "cancelled" : "interrupted",
      );
    },
  );
  it("throws a fatal drain error for unresponsive SDK work, retaining the terminal timeout", async () => {
    let finish!: (reply: { message: string; decisionProposals: [] }) => void;
    mocks.ask.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const accepted = enqueue();
    await expect(
      executePiRun(claimed(), { timeoutMs: 10, drainTimeoutMs: 10 }),
    ).rejects.toBeInstanceOf(PiWorkerDrainError);
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("timed-out");
    finish({ message: "Late output", decisionProposals: [] });
    await Promise.resolve();
    expect(store.listMessages(chatId).at(-1)?.body).toBe("");
  });
  it("requires the production application-removal path to wait for the native writer", async () => {
    const native = await openNativeChatSession(applicationId, chatId);
    try {
      expect(() => removeApplication(applicationId, "qa/test")).toThrow(
        "still running",
      );
      expect(store.getApplication(applicationId)).not.toBeNull();
    } finally {
      native.release();
    }
    removeApplication(applicationId, "qa/test");
    expect(store.getApplication(applicationId)).toBeNull();
  });
});

it("starts the real SDK worker without credentials or model calls when the queue is empty", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    await vi.waitFor(() => expect(output).toContain("Pi worker ready"), {
      timeout: 10_000,
    });
    expect(child.exitCode).toBeNull();
    expect(runs.chatRunSnapshot(applicationId, chatId).runs).toEqual([]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      await closed;
    }
  }
}, 15_000);

function createWorkerFixture(name: string) {
  const copy = join(root, name);
  mkdirSync(copy);
  cpSync("src", join(copy, "src"), { recursive: true });
  cpSync(
    join(copy, "src/server/pi-configuration.ts"),
    join(copy, "src/server/pi-configuration-real.ts"),
  );
  cpSync(
    "tests/browser-fixtures/pi-configuration.ts.txt",
    join(copy, "src/server/pi-configuration.ts"),
  );
  // The synthetic provider's scripted Phase 2 flow imports the shared fixture
  // modules, copied the way the disposable browser app copies them.
  cpSync("tests/fixtures", join(copy, "src/server/qa-fixtures"), {
    recursive: true,
  });
  const authPath = join(root, "synthetic-auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({
      "openai-codex": { type: "api_key", key: "QA-NO-NETWORK" },
    }),
    { mode: 0o600 },
  );
  savePiConfiguration({
    mode: "separate",
    authPath,
    providerId: "openai-codex",
    modelId: "gpt-5.6-sol",
    reasoningEffort: "high",
    credentialType: "api_key",
  });
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(copy, "node_modules"),
    "dir",
  );
  return { copy, env: { ...process.env, SERVER_GUY_QA_ROOT: root } };
}

it("a real worker process saves drafts, survives browser absence and exposes a crash without repeating it", async () => {
  const { copy, env } = createWorkerFixture("process-app");
  const start = () =>
    spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
      cwd: copy,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const interruptedMessage = "[pause-after-draft] Hello";
  const accepted = enqueue(interruptedMessage);
  const first = start();
  let second: ReturnType<typeof start> | undefined;
  try {
    await vi.waitFor(
      () => expect(runs.getPiRun(accepted.run.id)?.status).toBe("running"),
      { timeout: 10_000 },
    );
    await vi.waitFor(() =>
      expect(store.listMessages(chatId).at(-1)?.body).toContain(
        "[QA fixture reply]",
      ),
    );
    const duplicate = start();
    const [code] = await once(duplicate, "close");
    expect(code).toBe(1);
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("running");
    const closed = once(first, "close");
    first.kill("SIGKILL");
    await closed;
    const queued = enqueue("After restart");
    second = start();
    await vi.waitFor(
      () => expect(runs.getPiRun(queued.run.id)?.status).toBe("succeeded"),
      { timeout: 10_000 },
    );
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("interrupted");
    expect(
      store
        .listMessages(chatId)
        .filter((message) => message.body === interruptedMessage),
    ).toHaveLength(1);
    const recall = enqueue(`recall: ${interruptedMessage}`);
    await vi.waitFor(
      () => expect(runs.getPiRun(recall.run.id)?.status).toBe("succeeded"),
      { timeout: 10_000 },
    );
    expect(store.listMessages(chatId).at(-1)?.body).toBe(
      `[QA native history] found: ${interruptedMessage}`,
    );
    const nativePath = join(
      root,
      "pi-sessions",
      applicationId,
      `${chatId}.jsonl`,
    );
    const native = readFileSync(nativePath, "utf8");
    expect(native).toContain("server-guy-run");
    expect(native).toContain("interrupted");
    // Exercise normal teardown while the same barrier is waiting. It must
    // settle on abort, unlike the separate deliberately unresponsive fixture.
    const shutdown = enqueue("[pause-after-draft] Graceful shutdown");
    await vi.waitFor(() =>
      expect(store.listMessages(chatId).at(-1)?.body).toContain(
        "[QA fixture reply]",
      ),
    );
    expect(runs.getPiRun(shutdown.run.id)?.status).toBe("running");
    const stopped = once(second, "close");
    second.kill("SIGTERM");
    expect((await stopped)[0]).toBe(0);
    expect(runs.getPiRun(shutdown.run.id)?.status).toBe("interrupted");
  } finally {
    for (const child of [first, second])
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = once(child, "close");
        child.kill("SIGTERM");
        await closed;
      }
  }
}, 30_000);

it("a poisoned real worker retains its OS locks through garbage collection until process exit", async () => {
  const { copy, env } = createWorkerFixture("unresponsive-app");
  const accepted = enqueue("Hello [unresponsive]");
  const child = spawn(
    process.execPath,
    [
      "--expose-gc",
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { runPiWorker, PiWorkerDrainError } from './src/server/pi-worker.ts';
    const controller = new AbortController();
    process.on('SIGTERM', () => controller.abort());
    setInterval(() => global.gc(), 50);
    runPiWorker(controller.signal).catch(error => {
      if (!(error instanceof PiWorkerDrainError)) { console.error(error); process.exit(2); }
      process.stdout.write('drain-failed');
    });
  `,
    ],
    { cwd: copy, env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  try {
    await vi.waitFor(
      () =>
        expect(store.listMessages(chatId).at(-1)?.body).toContain(
          "[QA fixture reply]",
        ),
      { timeout: 10_000 },
    );
    child.kill("SIGTERM");
    await vi.waitFor(() => expect(output).toContain("drain-failed"), {
      timeout: 8_000,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(child.exitCode).toBeNull();
    expect(runs.getPiRun(accepted.run.id)?.status).toBe("interrupted");
    expect(() => acquireWorkerLock()).toThrow("already running");
    await expect(
      openNativeChatSession(applicationId, chatId),
    ).rejects.toMatchObject({ code: "busy" });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close");
      child.kill("SIGKILL");
      await closed;
    }
  }
  const release = acquireWorkerLock();
  release();
  const resumed = await openNativeChatSession(applicationId, chatId);
  resumed.release();
}, 25_000);
