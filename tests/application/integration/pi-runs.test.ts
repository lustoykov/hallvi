import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, cpSync, symlinkSync, mkdirSync } from "node:fs";
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
import { acquireWorkerLock, executePiRun } from "../../../src/server/pi-worker";
import {
  boundedChatContext,
  CONTEXT_LIMITS,
} from "../../../src/server/pi-context";
import {
  createChat,
  getPhaseOneOperatorView,
} from "../../../src/server/phase-one";
import { pushTestDatabase } from "../../test-database";

const mocks = vi.hoisted(() => ({ ask: vi.fn(), summary: vi.fn() }));
vi.mock("../../../src/server/pi", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi")>()),
  askPi: mocks.ask,
  summarizePiChat: mocks.summary,
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
  mocks.ask
    .mockReset()
    .mockResolvedValue({ message: "Done", decisionProposals: [] });
  mocks.summary
    .mockReset()
    .mockResolvedValue("A summary of the supplied older exchanges.");
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
  it("serializes chats and loads shared Decisions at execution, not acceptance", async () => {
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
    expect(mocks.ask.mock.calls[1][0].decisions).toMatchObject([
      { value: "Recover quickly" },
    ]);
    expect(
      mocks.ask.mock.calls[1][0].messages.every(
        (message: { chatId: string }) => message.chatId === second,
      ),
    ).toBe(true);
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

describe("bounded completed Chat context", () => {
  function history() {
    for (let index = 0; index < 12; index++) {
      store.insertMessage(chatId, "user", `Question ${index}`, "user");
      store.insertMessage(chatId, "assistant", `Answer ${index}`, "pi");
    }
  }
  it("persists coverage, never summarizes a range twice, retains full transcript and isolates Chats", async () => {
    history();
    const before = store.listMessages(chatId);
    enqueue("Current question");
    const run = claimed();
    const context = await boundedChatContext(run, new AbortController().signal);
    expect(context.summary).toContain("summary");
    expect(context.messages.length).toBeLessThanOrEqual(
      CONTEXT_LIMITS.recentExchanges * 2,
    );
    const summarized = mocks.summary.mock.calls[0][1] as string;
    for (const message of before)
      expect(
        summarized.includes(message.body) ||
          context.messages.some((part) => part.id === message.id),
      ).toBe(true);
    await boundedChatContext(run, new AbortController().signal);
    expect(mocks.summary).toHaveBeenCalledTimes(1);
    expect(store.listMessages(chatId)).toHaveLength(before.length + 2);
    runs.finishPiRun(run.id, "cancelled", "Test finished");
    const other = createChat(applicationId, "Isolated").selectedChatId!;
    enqueue("Hello", other);
    const otherContext = await boundedChatContext(
      claimed(),
      new AbortController().signal,
    );
    expect(otherContext.summary).toBe("");
    expect(
      otherContext.messages.every((message) => message.chatId === other),
    ).toBe(true);
  });
  it("summary failure leaves its coverage untouched and does not replay an unlimited transcript", async () => {
    history();
    mocks.summary.mockRejectedValueOnce(new Error("Secret provider payload"));
    const accepted = enqueue();
    await executePiRun(claimed());
    expect(mocks.ask).not.toHaveBeenCalled();
    expect(
      store.db().$client.prepare("SELECT * FROM chat_summaries").all(),
    ).toEqual([]);
    expect(runs.getPiRun(accepted.run.id)).toMatchObject({
      status: "failed",
      piCalls: 1,
    });
    expect(runs.getPiRun(accepted.run.id)?.error).not.toContain("Secret");
  });
  it("excludes unsuccessful attempts but includes every active Decision or fails visibly", async () => {
    const unsuccessful = enqueue("Failed user intent");
    runs.cancelPiRun(applicationId, chatId, unsuccessful.run.id);
    enqueue();
    await executePiRun(claimed());
    expect(mocks.ask.mock.calls[0][0].messages).toEqual([]);
    const source = store.listMessages(chatId)[0];
    for (let index = 0; index < 100; index++)
      store.insertDecision({
        applicationId,
        sourceMessageId: source.id,
        kind: "launch-priority",
        label: "Priority",
        value: `Priority ${index} ${"x".repeat(280)}`,
      });
    enqueue("Too much context");
    await executePiRun(claimed());
    expect(mocks.ask).toHaveBeenCalledTimes(1);
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

it("a real worker process saves drafts, survives browser absence and exposes a crash without repeating it", async () => {
  const copy = join(root, "process-app");
  mkdirSync(copy);
  cpSync("src", join(copy, "src"), { recursive: true });
  cpSync("tests/browser-fixtures/pi.ts.txt", join(copy, "src/server/pi.ts"));
  symlinkSync(
    join(process.cwd(), "node_modules"),
    join(copy, "node_modules"),
    "dir",
  );
  const env = { ...process.env, SERVER_GUY_QA_ROOT: root };
  const start = () =>
    spawn(process.execPath, ["--import", "tsx", "src/worker.ts"], {
      cwd: copy,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  const accepted = enqueue("Hello [slow]");
  const first = start();
  let second: ReturnType<typeof start> | undefined;
  try {
    await vi.waitFor(
      () => expect(runs.getPiRun(accepted.run.id)?.status).toBe("running"),
      { timeout: 10_000 },
    );
    await vi.waitFor(() =>
      expect(store.listMessages(chatId).at(-1)?.body).toContain("QA draft"),
    );
    const duplicate = start();
    const [code] = await once(duplicate, "close");
    expect(code).toBe(1);
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
        .filter((message) => message.body === "Hello [slow]"),
    ).toHaveLength(1);
  } finally {
    for (const child of [first, second])
      if (child && child.exitCode === null && child.signalCode === null) {
        const closed = once(child, "close");
        child.kill("SIGTERM");
        await closed;
      }
  }
}, 30_000);
