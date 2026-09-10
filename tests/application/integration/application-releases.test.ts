import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pushTestDatabase } from "../../test-database";
import { queuePlan } from "../../fixtures/queue-worker/plan";
const model = vi.hoisted(() => ({
  plan: vi.fn(),
  execute: vi.fn(),
  verify: vi.fn(),
  ssh: vi.fn(),
}));
vi.mock("../../../src/server/deployment-planner", () => ({
  planDeployment: model.plan,
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: async () => ({ token: "synthetic" }),
}));
vi.mock("../../../src/server/github-api", () => ({
  githubJson: async () => ({ data: { sha: "b".repeat(40) } }),
}));
vi.mock("../../../src/server/execution-tree", () => ({
  fetchBaseTree: async () => [],
}));
vi.mock("../../../src/server/release-executor", async (original) => ({
  ...(await original<object>()),
  executeRelease: model.execute,
  verifyRelease: model.verify,
}));
vi.mock("../../../src/server/deployment-ssh", async (original) => ({
  ...(await original<object>()),
  deploymentSsh: model.ssh,
}));
import {
  insertApplication,
  insertWorkspace,
  insertChat,
} from "../../../src/server/db";
import {
  requestDeployment,
  getDeployment,
  saveDeployment,
} from "../../../src/server/deployment-store";
import {
  proposeApplicationRelease,
  runApplicationRelease,
} from "../../../src/server/application-releases";
import { operation, startChange } from "../../../src/server/operation-store";
import {
  executeOperation,
  recordOperationRemoteEffect,
} from "../../../src/server/application-operations";
import { invalidateDeploymentRuntime } from "../../../src/server/deployment-lifecycle";
import { ReleaseExecutionError } from "../../../src/server/release-executor";
let root: string, app: string, chat: string;
function plan() {
  const p = queuePlan();
  p.services = [];
  p.dependencies = [];
  p.inputBindings = [];
  p.missingInputs = [];
  p.volumes = [
    {
      name: "data",
      target: "/data",
      kind: "database",
      sqlite: "/data/app.sqlite",
    },
  ];
  return p;
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-release-state-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "private"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  app = insertApplication({
    name: "Example",
    repositoryUrl: "https://github.com/qa/example",
    repositoryOwner: "qa",
    repositoryName: "example",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Test",
  }).id;
  chat = insertChat(insertWorkspace(app).id, "Release", true).id;
  const r = requestDeployment(app, chat);
  Object.assign(r, {
    status: "live",
    repositoryId: 10,
    revision: "a".repeat(40),
    plan: plan(),
    serverId: 7,
    address: "203.0.113.7",
    verifiedAt: new Date().toISOString(),
    imageId: "old-image",
    serviceImages: { app: "old-image" },
  });
  saveDeployment(r);
  const directory = join(root, "private", "deployments", r.id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "database-password"),
    "synthetic-private-password",
  );
  vi.clearAllMocks();
});
afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("one scope authorizes a failed configuration and a corrected release, retaining the old runtime evidence", async () => {
  const proposed = await proposeApplicationRelease(app, chat);
  const tracked = operation(proposed.id)!;
  expect(tracked.state).toBe("proposed");
  await expect(
    runApplicationRelease(tracked, new AbortController().signal),
  ).rejects.toThrow("active authorization");
  expect(model.execute).not.toHaveBeenCalled();
  const started = startChange(proposed.id, proposed.updatedAt);
  const deploymentId = (tracked.command as { scope: { deploymentId: string } })
    .scope.deploymentId;
  const initialReceipt = operation(`deployment:${deploymentId}`)!;
  model.execute.mockImplementation(async (r, release) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    r.plan = release.plan;
    r.revision = release.revision;
    r.releaseId = release.id;
    const attempt = r.lifecycle.attempts.at(-1);
    attempt.remoteResult = {
      phase: "replace",
      exitCode: model.execute.mock.calls.length === 1 ? 1 : 0,
      at: new Date().toISOString(),
    };
    saveDeployment(r);
    if (model.execute.mock.calls.length === 1)
      throw new ReleaseExecutionError(
        "Unknown entry point wrong.py",
        true,
        "replace",
      );
    r.imageId = "new-image";
    r.serviceImages = { app: "new-image" };
    r.verifiedAt = new Date().toISOString();
    return { evidence: "Verified new revision" };
  });
  model.plan.mockImplementation(async (_files, r, _signal, options) => {
    const wrong = plan();
    wrong.command = ["python", "wrong.py"];
    const feedback = await options.apply(wrong);
    expect(feedback).toMatchObject({
      ok: false,
      retryable: true,
      kind: "replace",
    });
    expect(feedback.message).toContain("wrong.py");
    expect(getDeployment(r.id)!.lifecycle!.runtime.lastVerified!.revision).toBe(
      "a".repeat(40),
    );
    expect(getDeployment(r.id)!.lifecycle!.runtime.state).toBe("unknown");
    expect(operation(started.id)!.approvedAt).toBe(started.approvedAt);
    expect((await options.apply(plan())).ok).toBe(true);
    return plan();
  });
  await executeOperation(started, () =>
    runApplicationRelease(started, new AbortController().signal),
  );
  const saved = getDeployment(deploymentId)!;
  expect(saved.lifecycle!.attempts.map((a) => a.outcome)).toEqual([
    "verified",
    "failed",
    "verified",
  ]);
  expect(saved.lifecycle!.runtime.lastVerified!.revision).toBe("b".repeat(40));
  expect(saved.lifecycle!.runtime.state).toBe("verified");
  expect(saved.serverId).toBe(7);
  expect(operation(initialReceipt.id)).toEqual(initialReceipt);
  expect(operation(started.id)!.state).toBe("verified");
});
it("returns an unknown remote outcome to Pi but refuses another execution", async () => {
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementation(async (r) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    saveDeployment(r);
    throw new ReleaseExecutionError(
      "SSH lost; remote outcome unknown",
      false,
      "transport",
    );
  });
  model.plan.mockImplementation(async (_files, _r, _signal, options) => {
    expect(await options.apply(plan())).toMatchObject({
      ok: false,
      retryable: false,
    });
    const blocked = await options.apply(plan());
    expect(blocked).toMatchObject({
      ok: false,
      retryable: false,
      kind: "authorization",
    });
    expect(blocked.message).toContain("unknown");
    throw new Error("Needs remote reconciliation");
  });
  await expect(
    executeOperation(started, () =>
      runApplicationRelease(started, new AbortController().signal),
    ),
  ).rejects.toThrow("reconciliation");
  expect(model.execute).toHaveBeenCalledTimes(1);
  expect(operation(started.id)!.blocksQueue).toBe(true);
});

it("bounds executions per approval and gives an explicit retry a fresh budget", async () => {
  const { retryOperation } =
    await import("../../../src/server/operation-store");
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementation(async (r) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    r.lifecycle.attempts.at(-1).remoteResult = {
      phase: "build",
      exitCode: 1,
      at: new Date().toISOString(),
    };
    saveDeployment(r);
    throw new ReleaseExecutionError("Build failed", true, "build");
  });
  model.plan.mockImplementation(async (_files, _r, _signal, options) => {
    for (let i = 0; i < 3; i++)
      expect(await options.apply(plan())).toMatchObject({
        ok: false,
        retryable: true,
      });
    expect(await options.apply(plan())).toMatchObject({
      ok: false,
      retryable: false,
      kind: "authorization",
    });
    throw new Error("Execution budget used");
  });
  await expect(
    executeOperation(started, () =>
      runApplicationRelease(started, new AbortController().signal),
    ),
  ).rejects.toThrow("budget");
  expect(model.execute).toHaveBeenCalledTimes(3);
  const failed = operation(started.id)!;
  const retried = retryOperation(failed.id, failed.updatedAt);
  model.plan.mockImplementation(async (_files, _r, _signal, options) => {
    expect(await options.apply(plan())).toMatchObject({
      ok: false,
      retryable: true,
      kind: "build",
    });
    throw new Error("New execution recorded");
  });
  await expect(
    executeOperation(retried, () =>
      runApplicationRelease(retried, new AbortController().signal),
    ),
  ).rejects.toThrow("New execution");
  expect(model.execute).toHaveBeenCalledTimes(4);
});

it("reconciles a lost successful result and verifies without a second replacement", async () => {
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  let originalAttempt: unknown;
  model.execute.mockImplementation(async (r, release) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    r.plan = release.plan;
    r.revision = release.revision;
    r.releaseId = release.id;
    saveDeployment(r);
    throw new ReleaseExecutionError("Lost result", false, "transport");
  });
  model.ssh.mockImplementation(async (r, command) => {
    expect(command).toContain("flock -n");
    expect(command).toContain("/result.json");
    const prior = r.lifecycle.attempts.findLast(
      (a: { kind: string }) => a.kind === "release",
    );
    return JSON.stringify({
      attemptId: prior.id,
      releaseId: prior.releaseId,
      revision: r.revision,
      phase: "replace",
      exitCode: 0,
    });
  });
  model.verify.mockImplementation(async (r) => {
    r.serviceImages = { app: "observed-new-image" };
    r.imageId = "observed-new-image";
    r.verifiedAt = new Date().toISOString();
    return { evidence: "Verified recovered release" };
  });
  model.plan.mockImplementation(async (_files, r, _signal, options) => {
    expect(await options.apply(plan())).toMatchObject({
      ok: false,
      retryable: false,
    });
    originalAttempt = structuredClone(r.lifecycle.attempts.at(-1));
    expect(await options.reconcile()).toMatchObject({
      ok: true,
      verified: true,
    });
    return plan();
  });
  await executeOperation(started, () =>
    runApplicationRelease(started, new AbortController().signal),
  );
  const saved = getDeployment(
    (started.command as { scope: { deploymentId: string } }).scope.deploymentId,
  )!;
  expect(saved.lifecycle!.attempts[1]).toEqual(originalAttempt);
  expect(saved.lifecycle!.attempts.at(-1)).toMatchObject({
    kind: "reconcile",
    outcome: "verified",
  });
  expect(saved.lifecycle!.runtime.state).toBe("verified");
  expect(model.execute).toHaveBeenCalledTimes(1);
  expect(model.verify).toHaveBeenCalledTimes(1);
  expect(operation(started.id)!.blocksQueue).toBe(false);
  const changed = getDeployment(saved.id)!;
  changed.lifecycle!.reconciliations![0].exitCode = 1;
  expect(() => saveDeployment(changed)).toThrow("cannot be rewritten");
});

it.each(["busy", "missing", "mismatch"])(
  "keeps %s remote evidence blocked",
  async (failure) => {
    const proposed = await proposeApplicationRelease(app, chat);
    const started = startChange(proposed.id, proposed.updatedAt);
    model.execute.mockImplementation(async (r, release) => {
      recordOperationRemoteEffect();
      invalidateDeploymentRuntime(r);
      r.plan = release.plan;
      r.revision = release.revision;
      r.releaseId = release.id;
      saveDeployment(r);
      throw new ReleaseExecutionError("Lost result", false, "transport");
    });
    model.ssh.mockImplementation(async (r) => {
      if (failure !== "mismatch") throw new Error(failure);
      const prior = r.lifecycle.attempts.at(-1);
      return JSON.stringify({
        attemptId: prior.id,
        releaseId: "f".repeat(64),
        revision: r.revision,
        phase: "replace",
        exitCode: 0,
      });
    });
    model.plan.mockImplementation(async (_files, _r, _signal, options) => {
      await options.apply(plan());
      expect(await options.reconcile()).toMatchObject({
        ok: false,
        retryable: false,
      });
      expect(await options.apply(plan())).toMatchObject({
        ok: false,
        retryable: false,
      });
      throw new Error("Unresolved outcome");
    });
    await expect(
      executeOperation(started, () =>
        runApplicationRelease(started, new AbortController().signal),
      ),
    ).rejects.toThrow("Unresolved outcome");
    expect(model.execute).toHaveBeenCalledTimes(1);
    expect(model.verify).not.toHaveBeenCalled();
    expect(operation(started.id)!.blocksQueue).toBe(true);
  },
);

it("an explicitly retried operation reconciles a known failure before another execution", async () => {
  const { retryOperation } =
    await import("../../../src/server/operation-store");
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementation(async (r, release) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    r.plan = release.plan;
    r.revision = release.revision;
    r.releaseId = release.id;
    if (model.execute.mock.calls.length === 1) {
      saveDeployment(r);
      throw new ReleaseExecutionError("Lost build reply", false, "transport");
    }
    r.lifecycle.attempts.at(-1).remoteResult = {
      phase: "replace",
      exitCode: 0,
      at: new Date().toISOString(),
    };
    r.imageId = "new";
    r.serviceImages = { app: "new" };
    r.verifiedAt = new Date().toISOString();
    return { evidence: "Verified corrected release" };
  });
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    await options.apply(plan());
    throw new Error("Connection unavailable");
  });
  await expect(
    executeOperation(started, () =>
      runApplicationRelease(started, new AbortController().signal),
    ),
  ).rejects.toThrow("Connection unavailable");
  const failed = operation(started.id)!;
  const retried = retryOperation(failed.id, failed.updatedAt);
  model.ssh.mockImplementation(async (r) => {
    const prior = r.lifecycle.attempts.at(-1);
    return JSON.stringify({
      attemptId: prior.id,
      releaseId: prior.releaseId,
      revision: r.revision,
      phase: "build",
      exitCode: 1,
    });
  });
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    expect(await options.apply(plan())).toMatchObject({
      ok: false,
      retryable: false,
    });
    expect(model.execute).toHaveBeenCalledTimes(1);
    expect(await options.reconcile()).toMatchObject({
      ok: true,
      retryable: true,
    });
    expect(await options.apply(plan())).toMatchObject({ ok: true });
    return plan();
  });
  await executeOperation(retried, () =>
    runApplicationRelease(retried, new AbortController().signal),
  );
  expect(model.execute).toHaveBeenCalledTimes(2);
  expect(operation(retried.id)!.state).toBe("verified");
  expect(operation(retried.id)!.blocksQueue).toBe(false);
});
