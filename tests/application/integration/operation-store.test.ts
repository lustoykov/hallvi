import {
  beginDeploymentAttempt,
  ensureDeploymentLifecycle,
  invalidateDeploymentRuntime,
} from "../../../src/server/deployment-lifecycle";
import { getDeployment } from "../../../src/server/deployment-store";
import { queuePlan } from "../../fixtures/queue-worker/plan";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { pushTestDatabase } from "../../test-database";
import {
  db,
  insertApplication,
  insertChat,
  insertWorkspace,
  listMessages,
} from "../../../src/server/db";
import { applications, operationRecords } from "../../../src/server/db-schema";
import {
  advanceQueue,
  cancelOperation,
  claimOperation,
  findUnresolved,
  markOperationRemoteEffect,
  operation,
  operationsFor,
  proposeOperation,
  recoverDeadOperations,
  retryOperation,
  settleOperation,
  startChange,
  syncDeploymentOperation,
} from "../../../src/server/operation-store";
import {
  requestDeployment,
  cancelDeployment,
  saveDeployment,
} from "../../../src/server/deployment-store";
import { operationContext } from "../../../src/server/operation-tools";
let root: string, app: string, firstChat: string, secondChat: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-operations-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  app = insertApplication({
    name: "Example",
    repositoryUrl: "https://github.com/qa/ops",
    repositoryOwner: "qa",
    repositoryName: "ops",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Test",
  }).id;
  const workspace = insertWorkspace(app);
  firstChat = insertChat(workspace.id, "First", true).id;
  secondChat = insertChat(workspace.id, "Second", false).id;
});
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
function propose(
  target: string,
  chatId = firstChat,
  kind: "change" | "inspection" = "change",
) {
  return proposeOperation({
    applicationId: app,
    source: { type: "preparation", id: target },
    target,
    kind,
    chatId,
    title: target,
    summary: `Perform ${target}`,
    destinations: ["deployment"],
    command: { type: "start-preparation" },
  });
}
const approve = (value: ReturnType<typeof propose>) =>
  startChange(value.id, value.updatedAt);
function finish(id: string) {
  const claimed = claimOperation(id)!;
  return settleOperation(
    id,
    claimed.executionId!,
    "verified",
    "Verified by fixture",
  );
}

describe("application operation scheduling", () => {
  it("serializes independent-process approvals in SQLite", async () => {
    const a = propose("first");
    const b = propose("second", secondChat);
    const path = join(root, "approve.mjs");
    writeFileSync(
      path,
      `import { startChange } from ${JSON.stringify(join(process.cwd(), "src/server/operation-store.ts"))};\nprocess.send('ready');\nprocess.once('message', () => { try { const result=startChange(process.argv[2],process.argv[3]); process.send({state:result.state}); } catch(e) { process.send({error:e.message}); } process.disconnect(); });`,
    );
    const launch = (record: typeof a) => {
      const child = spawn(
        process.execPath,
        ["--import", "tsx", path, record.id, record.updatedAt],
        {
          cwd: process.cwd(),
          env: process.env,
          stdio: ["ignore", "ignore", "pipe", "ipc"],
        },
      );
      let stderr = "";
      child.stderr!.on("data", (data) => (stderr += data));
      const ready = new Promise<void>((resolve, reject) => {
        child.once("message", () => resolve());
        child.once("exit", (code) => {
          if (code) reject(new Error(stderr));
        });
      });
      const result = new Promise<{ state?: string; error?: string }>(
        (resolve, reject) => {
          child.on("message", (value) => {
            if (typeof value === "object") resolve(value);
          });
          child.once("error", reject);
          child.once("exit", (code) => {
            if (code) reject(new Error(stderr));
          });
        },
      );
      return { child, ready, result };
    };
    const one = launch(a),
      two = launch(b);
    try {
      await Promise.all([one.ready, two.ready]);
      one.child.send("approve");
      two.child.send("approve");
      expect(
        (await Promise.all([one.result, two.result]))
          .map((value) => value.state)
          .sort(),
      ).toEqual(["queued", "working"]);
      const working = operationsFor(app).filter(
        (item) => item.kind === "change" && item.state === "working",
      );
      expect(working).toHaveLength(1);
      const queued = operationsFor(app).find(
        (item) => item.state === "queued",
      )!;
      expect(queued.waitingForId).toBe(working[0].id);
    } finally {
      one.child.kill();
      two.child.kill();
    }
  }, 15000);

  it("continues oldest approved work and leaves read-only inspections concurrent", () => {
    const a = approve(propose("first"));
    const b = approve(propose("second", secondChat));
    const c = approve(propose("third"));
    const read = propose("inspect", secondChat, "inspection");
    expect(read.state).toBe("working");
    expect(b.state).toBe("queued");
    finish(a.id);
    expect(operation(b.id)?.state).toBe("working");
    expect(operation(c.id)?.state).toBe("queued");
    finish(b.id);
    expect(operation(c.id)?.state).toBe("working");
  });

  it("returns a stale queued plan to proposed without executing", () => {
    const a = approve(propose("first"));
    const b = approve(propose("second"));
    const running = claimOperation(a.id)!;
    db()
      .update(applications)
      .set({ repositoryUrl: "https://github.com/qa/changed" })
      .where(eq(applications.id, app))
      .run();
    settleOperation(
      a.id,
      running.executionId!,
      "verified",
      "Fixture changed the source",
    );
    expect(operation(b.id)?.state).toBe("proposed");
    expect(operation(b.id)?.summary).toContain("repository");
    expect(operation(b.id)?.approvedAt).toBeNull();
    expect(operation(b.id)?.executorPid).toBeNull();
  });

  it("deduplicates unresolved outcomes and links the other conversation", () => {
    const first = propose("same");
    const again = propose("same", secondChat);
    expect(again.id).toBe(first.id);
    expect(operationsFor(app)).toHaveLength(1);
    expect(again.mentions).toHaveLength(1);
    expect(
      listMessages(secondChat).some(
        (message) => message.id === again.mentions[0].messageId,
      ),
    ).toBe(true);
    expect(findUnresolved(app, "preparation", "same")?.id).toBe(first.id);
    expect(operationContext(app)[0].conversation).toBe("First");
    expect(JSON.stringify(operationContext(app))).not.toContain(
      "I’m referring",
    );
  });

  it("retains cancellation and refuses stale decisions", () => {
    const a = approve(propose("first"));
    const b = approve(propose("second"));
    cancelOperation(b.id, b.updatedAt);
    expect(operation(b.id)?.state).toBe("cancelled");
    expect(() => cancelOperation(b.id, b.updatedAt)).toThrow("changed");
    finish(a.id);
    expect(operation(b.id)?.state).toBe("cancelled");
    const c = propose("third");
    approve(c);
    expect(() => approve(c)).toThrow("changed");
  });

  it("frees an abandoned change only when no remote effect was started", () => {
    const a = approve(propose("first"));
    const b = approve(propose("second"));
    claimOperation(a.id);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    recoverDeadOperations();
    expect(operation(a.id)?.state).toBe("failed");
    expect(operation(b.id)?.state).toBe("working");
  });

  it("holds an unknown remote outcome and allows only its reconciliation retry", async () => {
    const a = approve(propose("first"));
    const b = approve(propose("second"));
    const claimed = claimOperation(a.id)!;
    markOperationRemoteEffect(a.id, claimed.executionId!);
    vi.spyOn(process, "kill").mockImplementation(() => {
      throw Object.assign(new Error("gone"), { code: "ESRCH" });
    });
    recoverDeadOperations();
    const failed = operation(a.id)!;
    expect(failed.state).toBe("failed");
    expect(failed.blocksQueue).toBe(true);
    expect(operation(b.id)?.state).toBe("queued");
    expect(() => cancelOperation(a.id, failed.updatedAt)).toThrow("Reconcile");
    const retry = retryOperation(a.id, failed.updatedAt);
    expect(retry.id).not.toBe(a.id);
    expect(retry.state).toBe("working");
    expect(operation(a.id)?.resolvedById).toBe(retry.id);
    expect(operation(b.id)?.state).toBe("queued");
    const { executeOperation } =
      await import("../../../src/server/application-operations");
    await expect(
      executeOperation(retry, async () => {
        throw new Error("Credentials unavailable before reconciliation");
      }),
    ).rejects.toThrow("Credentials unavailable");
    expect(operation(retry.id)?.blocksQueue).toBe(true);
    expect(operation(b.id)?.state).toBe("queued");
  });

  it("persists history across database reopen and keeps cancelled deployment evidence", () => {
    const deployment = requestDeployment(app, firstChat);
    deployment.status = "awaiting-approval";
    saveDeployment(deployment);
    cancelDeployment(deployment);
    globalThis.__serverGuyDb?.$client.close();
    delete globalThis.__serverGuyDb;
    expect(
      operationsFor(app).find((item) => item.source.id === deployment.id)
        ?.state,
    ).toBe("cancelled");
    expect(db().select().from(operationRecords).all()).toHaveLength(1);
    expect(advanceQueue(app)).toBeNull();
  });
});

it("rechecks facts at executor claim, not just while draining the queue", () => {
  const approved = approve(propose("pending execution"));
  db()
    .update(applications)
    .set({ repositoryUrl: "https://github.com/qa/new" })
    .where(eq(applications.id, app))
    .run();
  expect(claimOperation(approved.id)).toBeNull();
  expect(operation(approved.id)?.state).toBe("proposed");
});

it("imports an older approved deployment into the same queue", () => {
  const running = approve(propose("source change"));
  const record = requestDeployment(app, firstChat);
  // Simulate the pre-v13 row with no corresponding durable operation.
  db()
    .delete(operationRecords)
    .where(eq(operationRecords.id, `deployment:${record.id}`))
    .run();
  record.status = "deploy-queued";
  saveDeployment(record);
  const queued = operation(`deployment:${record.id}`)!;
  expect(queued.state).toBe("queued");
  expect(queued.waitingForId).toBe(running.id);
  finish(running.id);
  expect(operation(queued.id)?.state).toBe("working");
});

it("keeps all collected log snapshots after newer snapshots arrive", () => {
  const record = requestDeployment(app, firstChat);
  record.status = "live";
  record.logsCollectedAt = "2026-09-09T10:00:00.000Z";
  saveDeployment(record);
  record.logsCollectedAt = "2026-09-09T11:00:00.000Z";
  saveDeployment(record);
  expect(
    operationsFor(app).filter((item) => item.source.type === "logs"),
  ).toHaveLength(2);
});

it("rejects stale and cross-application decisions and retains queued deployment cancellation", async () => {
  const { POST } =
    await import("../../../src/app/api/applications/[applicationId]/operations/[operationId]/decision/route");
  const decide = (
    id: string,
    applicationId: string,
    action: string,
    updatedAt: string,
  ) =>
    POST(
      new Request("http://localhost/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, updatedAt }),
      }),
      { params: Promise.resolve({ applicationId, operationId: id }) },
    );
  const proposed = propose("first");
  expect(
    (await decide(proposed.id, "another-app", "approve", proposed.updatedAt))
      .status,
  ).toBe(404);
  expect(
    (await decide(proposed.id, app, "approve", proposed.updatedAt)).status,
  ).toBe(200);
  expect(
    (await decide(proposed.id, app, "approve", proposed.updatedAt)).status,
  ).toBe(409);
  const record = requestDeployment(app, firstChat);
  record.status = "awaiting-approval";
  saveDeployment(record);
  const plan = operation(`deployment:${record.id}`)!;
  startChange(plan.id, plan.updatedAt);
  record.status = "deploy-queued";
  saveDeployment(record);
  const queued = operation(plan.id)!;
  expect(queued.state).toBe("queued");
  expect(
    (await decide(queued.id, app, "cancel", queued.updatedAt)).status,
  ).toBe(200);
  expect(operation(queued.id)?.state).toBe("cancelled");
  expect(
    operationsFor(app).some(
      (item) => item.id === queued.id && item.state === "cancelled",
    ),
  ).toBe(true);
});

it("the persistent worker claims queued source commands and drains them in order", async () => {
  const preparation = await import("../../../src/server/preparation");
  const { runOperationWorker } =
    await import("../../../src/server/operation-worker");
  const first = approve(propose("first worker command"));
  const second = approve(propose("second worker command", secondChat));
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: string[] = [];
  vi.spyOn(preparation, "startPreparation").mockImplementation(async () => {
    const executing = operationsFor(app).find(
      (item) => item.state === "working" && item.kind === "change",
    )!;
    calls.push(executing.id);
    if (executing.id === first.id) await hold;
    return { id: "verified-fixture-branch" } as Awaited<
      ReturnType<typeof preparation.startPreparation>
    >;
  });
  const controller = new AbortController();
  const worker = runOperationWorker(controller.signal);
  try {
    await vi.waitFor(() => expect(calls).toEqual([first.id]));
    expect(operation(second.id)?.state).toBe("queued");
    expect(operation(first.id)?.executorPid).toBe(process.pid);
    release();
    await vi.waitFor(() =>
      expect(operation(second.id)?.state).toBe("verified"),
    );
    expect(calls).toEqual([first.id, second.id]);
    expect(operation(second.id)?.result).toEqual({
      id: "verified-fixture-branch",
    });
  } finally {
    release();
    controller.abort();
    await worker;
  }
});

it("imports historical deployment dates without making verification look recent", () => {
  const record = requestDeployment(app, firstChat);
  record.status = "live";
  record.updatedAt = "2026-09-08T12:00:00.000Z";
  db()
    .delete(operationRecords)
    .where(eq(operationRecords.id, `deployment:${record.id}`))
    .run();
  // The source snapshot, rather than its import time, dates this history item.
  const { id } = record;
  const result = syncDeploymentOperation(record);
  expect(result.id).toBe(`deployment:${id}`);
  expect(result.updatedAt).toBe(record.updatedAt);
});

it("a request follows the recorded result when the worker wins its claim race", async () => {
  const store = await import("../../../src/server/operation-store");
  const { duringApplicationOperation } =
    await import("../../../src/server/application-operations");
  const claim = store.claimOperation;
  vi.spyOn(store, "claimOperation").mockImplementationOnce((id) => {
    const owned = claim(id)!;
    settleOperation(
      id,
      owned.executionId!,
      "verified",
      "Worker completed",
      false,
      { branch: "existing" },
    );
    return null;
  });
  const effect = vi.fn();
  const result = await duringApplicationOperation(app, effect, {
    command: { type: "start-preparation" },
    kind: "change",
    title: "Start preparation",
  });
  expect(result).toEqual({ branch: "existing" });
  expect(effect).not.toHaveBeenCalled();
});

it("recovers a dead recreation worker without rewriting the original deployment receipt", () => {
  const r = requestDeployment(app, firstChat);
  r.status = "live";
  r.plan = queuePlan();
  r.revision = "a".repeat(40);
  r.serverId = 7;
  r.verifiedAt = new Date().toISOString();
  r.imageId = "sha256:original";
  saveDeployment(r);
  const original = operation(`deployment:${r.id}`)!;
  const proposed = proposeOperation({
    applicationId: app,
    chatId: firstChat,
    source: { type: "release", id: r.id },
    target: "recreate-deployment",
    kind: "change",
    title: "Recreate containers",
    summary: "Synthetic recreation",
    destinations: ["deployment"],
    command: { type: "recreate-deployment", deploymentId: r.id },
  });
  startChange(proposed.id, proposed.updatedAt);
  const claimed = claimOperation(proposed.id)!;
  const prior = structuredClone(
    ensureDeploymentLifecycle(r).runtime.lastVerified,
  );
  const attempt = beginDeploymentAttempt(r, "recreate", proposed.id);
  markOperationRemoteEffect(claimed.id, claimed.executionId!);
  invalidateDeploymentRuntime(r);
  saveDeployment(r);
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("dead"), { code: "ESRCH" });
  });
  recoverDeadOperations();
  const saved = getDeployment(r.id)!;
  expect(saved.lifecycle!.attempts.at(-1)).toMatchObject({
    id: attempt.id,
    outcome: "interrupted",
  });
  expect(saved.lifecycle!.runtime).toEqual({
    state: "unknown",
    lastVerified: prior,
  });
  expect(operation(proposed.id)).toMatchObject({
    state: "failed",
    blocksQueue: true,
  });
  operationsFor(app);
  expect(operation(original.id)).toEqual(original);
});
