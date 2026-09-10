import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pushTestDatabase } from "../../test-database";
import { queuePlan } from "../../fixtures/queue-worker/plan";
const model = vi.hoisted(() => {
  const source = [
    { path: "Dockerfile", mode: 0o644, content: Buffer.from("FROM python\n") },
  ];
  return {
    plan: vi.fn(),
    execute: vi.fn(),
    verify: vi.fn(),
    ssh: vi.fn(),
    source,
    archive: vi.fn(async () => source),
  };
});
vi.mock("../../../src/server/deployment-planner", () => ({
  planDeployment: model.plan,
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: async () => ({ token: "synthetic" }),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<object>()),
  githubJson: async (path: string) => ({
    data: path.includes("/git/trees/")
      ? {
          sha: "b".repeat(40),
          tree: [{ path: "Dockerfile", type: "blob", size: 12 }],
        }
      : { sha: "b".repeat(40) },
  }),
}));
vi.mock("../../../src/server/execution-tree", () => ({
  fetchBaseTree: model.archive,
}));
vi.mock("../../../src/server/container-images", () => ({
  pinContainerImage: async (reference: string) =>
    `${reference.split(":")[0]}@sha256:${"c".repeat(64)}`,
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
  applicationDeployment,
  runDeploymentAttempt,
} from "../../../src/server/deployment-store";
import {
  proposeApplicationRelease,
  runApplicationRelease,
} from "../../../src/server/application-releases";
import {
  operation,
  operationsFor,
  retryOperation,
  startChange,
} from "../../../src/server/operation-store";
import {
  executeOperation,
  recordOperationRemoteEffect,
} from "../../../src/server/application-operations";
import { invalidateDeploymentRuntime } from "../../../src/server/deployment-lifecycle";
import { ReleaseExecutionError } from "../../../src/server/release-executor";
import {
  releaseOf,
  type DeploymentRelease,
} from "../../../src/server/deployment-release";
import {
  ReleaseScopeError,
  type ReleaseScope,
} from "../../../src/server/release-scope";
import type {
  DeploymentPlan,
  DeploymentRecord,
} from "../../../src/server/deployment-types";
import type { StoredOperation } from "../../../src/server/operation-types";
let template: string, root: string, app: string, chat: string;
// One schema push per file; each test starts from its own copy.
beforeAll(() => {
  template = join(
    mkdtempSync(join(tmpdir(), "sg-release-schema-")),
    "db.sqlite",
  );
  pushTestDatabase(template);
});
afterAll(() => rmSync(dirname(template), { recursive: true, force: true }));
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
  copyFileSync(template, process.env.SERVER_GUY_DB_PATH!);
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
it("one scope authorizes a failed image configuration and a corrected source build, retaining the old runtime evidence", async () => {
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
    wrong.image = "ghcr.io/qa/example:1";
    wrong.command = ["python", "wrong.py"];
    const feedback = await options.apply(wrong);
    expect(feedback).toMatchObject({
      ok: false,
      retryable: true,
      kind: "replace",
    });
    expect(feedback.message).toContain("wrong.py");
    // Planning and a published image need no executable source archive.
    expect(model.archive).not.toHaveBeenCalled();
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
  const [image, build] = model.execute.mock.calls;
  expect(image[1].plan.image).toBe(
    `ghcr.io/qa/example@sha256:${"c".repeat(64)}`,
  );
  expect(image[2]).toEqual([]);
  expect(model.archive).toHaveBeenCalledTimes(1);
  expect(model.archive).toHaveBeenCalledWith(
    "qa/example",
    "b".repeat(40),
    "synthetic",
    expect.any(AbortSignal),
  );
  expect(build[2]).toBe(model.source);
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

// A busy lock and a missing result both surface as an SSH error here; the
// real lock is exercised only by the opt-in Docker proof.
it.each(["unreadable", "mismatch"])(
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

const digest = (c: string) => `sha256:${c.repeat(64)}`;
const V1 = digest("1"),
  V2 = digest("2"),
  EVIDENCE =
    "v2 only added a nullable column that v1 never reads; v1 writes rows v2 accepts.";
const pg = {
  version: "16",
  variable: "DATABASE_URL",
  scheme: "postgresql",
} as const;
const observed = (
  p: DeploymentPlan,
  app: string,
  postgres = digest("d"),
): Record<string, string> => (p.postgres ? { app, postgres } : { app });
const run = (tracked: StoredOperation) =>
  executeOperation(tracked, () =>
    runApplicationRelease(tracked, new AbortController().signal),
  );
const rollBack = (releaseId: string, compatibilityEvidence = EVIDENCE) =>
  proposeApplicationRelease(app, chat, "HEAD", "Go back to the last version", {
    releaseId,
    compatibilityEvidence,
  });
function v2Plan() {
  const p = plan();
  p.command = ["python", "app.py", "v2"];
  return p;
}
/** v1 is live and verified with the image digests the host reported. */
function verifiedV1(
  change: (p: DeploymentPlan) => void = () => {},
  postgres?: string,
) {
  const r = applicationDeployment(app)!;
  change(r.plan!);
  r.serviceImages = observed(r.plan!, V1, postgres);
  r.imageId = V1;
  saveDeployment(r);
}
/** Stands in for the host: records what it replaced, as executeRelease does. */
function replaced(image = V2) {
  return async (
    r: DeploymentRecord,
    release: DeploymentRelease,
    _files: unknown,
    _signal: AbortSignal,
    rollback?: Record<string, string>,
  ) => {
    recordOperationRemoteEffect();
    invalidateDeploymentRuntime(r);
    const images =
      rollback ?? observed(release.plan, image, r.serviceImages?.postgres);
    Object.assign(r, {
      plan: release.plan,
      revision: release.revision,
      releaseId: release.id,
      serviceImages: structuredClone(images),
      imageId: images.app,
      verifiedAt: new Date().toISOString(),
    });
    r.lifecycle!.attempts.at(-1)!.remoteResult = {
      phase: "replace",
      exitCode: 0,
      at: new Date().toISOString(),
    };
    saveDeployment(r);
    return { evidence: `Verified ${release.revision.slice(0, 12)}` };
  };
}
/** v2 arrives through the ordinary agent-planned release operation. */
async function releasedV2() {
  verifiedV1();
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementationOnce(replaced());
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    expect(await options.apply(v2Plan())).toMatchObject({ ok: true });
    return v2Plan();
  });
  await run(started);
  vi.clearAllMocks();
  return applicationDeployment(app)!;
}
/** v2 arrives through a separately authorized change, outside release scope. */
async function changedV2(
  change: (p: DeploymentPlan) => void,
  postgres?: string,
) {
  const r = applicationDeployment(app)!;
  const next = structuredClone(r.plan!);
  change(next);
  const release = releaseOf({
    repository: r.repository,
    revision: "b".repeat(40),
    plan: next,
  })!;
  await runDeploymentAttempt(
    r,
    "recreate",
    "separate-change",
    async () => {
      Object.assign(r, {
        plan: next,
        revision: release.revision,
        releaseId: release.id,
        serviceImages: observed(next, V2, postgres),
        imageId: V2,
        verifiedAt: new Date().toISOString(),
      });
    },
    release,
  );
  return applicationDeployment(app)!;
}

it("rolls back to the exact earlier release and recorded images on the same host, keeping data scope and history", async () => {
  const current = await releasedV2();
  const history = structuredClone(current.lifecycle!);
  const [v1, v2] = history.releases;
  expect(
    history.verifiedImages!.map((a) => [a.releaseId, a.hostId, a.images]),
  ).toEqual([
    [v1.id, history.host.id, { app: V1 }],
    [v2.id, history.host.id, { app: V2 }],
  ]);
  const proposed = await rollBack(
    v1.id,
    `${EVIDENCE} It still signs in with synthetic-private-password.`,
  );
  // The approval and stored scope show the agent's compatibility assessment,
  // with the application's known private values redacted.
  const assessment = `${EVIDENCE} It still signs in with [REDACTED].`;
  expect(proposed.summary).toContain(assessment);
  expect(proposed.summary).not.toContain("synthetic-private-password");
  const scope = (operation(proposed.id)!.command as { scope: ReleaseScope })
    .scope;
  expect(scope).toMatchObject({
    revision: v1.revision,
    baselineReleaseId: v2.id,
    hostId: history.host.id,
    serverId: 7,
    rollback: {
      releaseId: v1.id,
      attemptId: history.verifiedImages![0].attemptId,
      images: { app: V1 },
      compatibilityEvidence: assessment,
    },
  });
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementationOnce(replaced());
  await run(started);
  expect(operation(started.id)!.state).toBe("verified");
  // No planning session, source archive or build input: the exact recorded
  // release and its verified local images.
  expect(model.plan).not.toHaveBeenCalled();
  expect(model.archive).not.toHaveBeenCalled();
  expect(model.execute).toHaveBeenCalledOnce();
  const [, release, files, , images] = model.execute.mock.calls[0];
  expect(release).toEqual(v1);
  expect(files).toEqual([]);
  expect(images).toEqual({ app: V1 });
  const saved = applicationDeployment(app)!;
  expect(saved).toMatchObject({
    serverId: 7,
    address: "203.0.113.7",
    revision: v1.revision,
  });
  expect(saved.plan!.volumes).toEqual(v2.plan.volumes);
  expect(saved.lifecycle!.runtime).toMatchObject({
    state: "verified",
    lastVerified: {
      releaseId: v1.id,
      hostId: history.host.id,
      images: { app: V1 },
    },
  });
  // Earlier releases, attempts and image observations are appended to, never
  // rewritten; the rollback is its own verified attempt of the v1 release.
  expect(saved.lifecycle!.releases).toEqual(history.releases);
  expect(saved.lifecycle!.attempts.slice(0, history.attempts.length)).toEqual(
    history.attempts,
  );
  const attempt = saved.lifecycle!.attempts.at(-1)!;
  expect(attempt).toMatchObject({
    kind: "release",
    outcome: "verified",
    releaseId: v1.id,
    authorizationId: scope.id,
  });
  expect(saved.lifecycle!.verifiedImages!.slice(0, 2)).toEqual(
    history.verifiedImages,
  );
  expect(saved.lifecycle!.verifiedImages!.at(-1)).toMatchObject({
    attemptId: attempt.id,
    releaseId: v1.id,
    images: { app: V1 },
  });
  saved.lifecycle!.verifiedImages![0].images.app = V2;
  expect(() => saveDeployment(saved)).toThrow("cannot be rewritten");
});

it("keeps the current managed database image while returning to earlier application images", async () => {
  verifiedV1((p) => (p.postgres = pg), digest("3"));
  // A separately authorized same-version database patch changed its image.
  const current = await changedV2(
    (p) => (p.command = ["python", "app.py", "v2"]),
    digest("4"),
  );
  const v1 = current.lifecycle!.releases[0];
  expect(current.lifecycle!.verifiedImages![0].images).toEqual({
    app: V1,
    postgres: digest("3"),
  });
  const proposed = await rollBack(v1.id);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementationOnce(replaced());
  await run(started);
  expect(model.execute.mock.calls[0][4]).toEqual({
    app: V1,
    postgres: digest("4"),
  });
  expect(
    applicationDeployment(app)!.lifecycle!.runtime.lastVerified,
  ).toMatchObject({
    releaseId: v1.id,
    images: { app: V1, postgres: digest("4") },
  });
});

type Change = (p: DeploymentPlan) => void;
it.each<{ limit: string; v1: Change; v2: Change; reason: string }>([
  {
    limit: "a data mount",
    v1: () => {},
    v2: (p) => {
      p.volumes!.push({
        name: "uploads",
        target: "/uploads",
        kind: "files",
        sqlite: null,
      });
    },
    reason: "volume uploads",
  },
  {
    limit: "the database version",
    v1: (p) => {
      p.postgres = pg;
    },
    v2: (p) => {
      p.postgres = { ...pg, version: "17" };
    },
    reason: "database",
  },
  {
    limit: "network exposure",
    v1: (p) => {
      p.httpAccess = "controller";
    },
    v2: (p) => {
      p.httpAccess = "public";
    },
    reason: "exposure",
  },
])(
  "refuses a rollback that would change $limit",
  async ({ v1, v2, reason }) => {
    verifiedV1(v1);
    const current = await changedV2(v2);
    const operations = operationsFor(app).length;
    const error = await rollBack(current.lifecycle!.releases[0].id).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ReleaseScopeError);
    expect((error as Error).message).toContain(reason);
    expect(operationsFor(app)).toHaveLength(operations);
    expect(applicationDeployment(app)).toEqual(current);
  },
);

it("refuses rollback to a never-verified or current release, or without a compatibility assessment", async () => {
  verifiedV1();
  const proposed = await proposeApplicationRelease(app, chat);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute
    .mockImplementationOnce(async (r, release) => {
      recordOperationRemoteEffect();
      invalidateDeploymentRuntime(r);
      Object.assign(r, {
        plan: release.plan,
        revision: release.revision,
        releaseId: release.id,
      });
      r.lifecycle.attempts.at(-1).remoteResult = {
        phase: "replace",
        exitCode: 1,
        at: new Date().toISOString(),
      };
      saveDeployment(r);
      throw new ReleaseExecutionError("Unknown entry point", true, "replace");
    })
    .mockImplementationOnce(replaced());
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    const wrong = v2Plan();
    wrong.command = ["python", "wrong.py"];
    expect(await options.apply(wrong)).toMatchObject({ ok: false });
    expect(await options.apply(v2Plan())).toMatchObject({ ok: true });
    return v2Plan();
  });
  await run(started);
  const current = applicationDeployment(app)!;
  const [v1, unverified, v2] = current.lifecycle!.releases;
  expect(current.lifecycle!.verifiedImages!.map((a) => a.releaseId)).toEqual([
    v1.id,
    v2.id,
  ]);
  const operations = operationsFor(app).length;
  for (const [releaseId, evidence, reason] of [
    [unverified.id, EVIDENCE, "verified images"],
    [v2.id, EVIDENCE, "already"],
    [v1.id, " \n ", "Explain"],
  ])
    await expect(rollBack(releaseId, evidence)).rejects.toThrow(reason);
  expect(operationsFor(app)).toHaveLength(operations);
  expect(applicationDeployment(app)).toEqual(current);
  expect(model.execute).toHaveBeenCalledTimes(2);
  // The same v1 target is accepted once it is explained.
  expect(operation((await rollBack(v1.id)).id)!.state).toBe("proposed");
});

it("reconciles a lost rollback reply before any repeat and never replaces again", async () => {
  const current = await releasedV2();
  const v1 = current.lifecycle!.releases[0];
  const proposed = await rollBack(v1.id);
  const started = startChange(proposed.id, proposed.updatedAt);
  model.execute.mockImplementationOnce(
    async (r, release, _files, _signal, images) => {
      recordOperationRemoteEffect();
      invalidateDeploymentRuntime(r);
      Object.assign(r, {
        plan: release.plan,
        revision: release.revision,
        releaseId: release.id,
        serviceImages: structuredClone(images),
      });
      saveDeployment(r);
      throw new ReleaseExecutionError("Lost result", false, "transport");
    },
  );
  await expect(run(started)).rejects.toThrow("Lost result");
  const lost = structuredClone(
    applicationDeployment(app)!.lifecycle!.attempts.at(-1)!,
  );
  expect(lost).toMatchObject({ kind: "release", releaseId: v1.id });
  // A busy lock or missing host result authorizes neither success nor repeat.
  model.ssh.mockRejectedValueOnce(new Error("lock busy"));
  let failed = operation(started.id)!;
  const blocked = retryOperation(failed.id, failed.updatedAt);
  await expect(run(blocked)).rejects.toThrow(ReleaseScopeError);
  expect(model.execute).toHaveBeenCalledOnce();
  expect(operation(blocked.id)!.blocksQueue).toBe(true);
  failed = operation(blocked.id)!;
  const recovered = retryOperation(failed.id, failed.updatedAt);
  model.ssh.mockResolvedValueOnce(
    JSON.stringify({
      attemptId: lost.id,
      releaseId: v1.id,
      revision: v1.revision,
      phase: "replace",
      exitCode: 0,
    }),
  );
  model.verify.mockImplementationOnce(async (r) => {
    r.imageId = r.serviceImages.app;
    r.verifiedAt = new Date().toISOString();
    return { evidence: "Verified the recovered rollback" };
  });
  await run(recovered);
  expect(model.execute).toHaveBeenCalledOnce();
  expect(model.verify).toHaveBeenCalledOnce();
  const saved = applicationDeployment(app)!;
  expect(saved.lifecycle!.attempts.find((a) => a.id === lost.id)).toEqual(lost);
  expect(saved.lifecycle!.attempts.at(-1)).toMatchObject({
    kind: "reconcile",
    outcome: "verified",
    reconcilesAttemptId: lost.id,
  });
  expect(saved.lifecycle!.runtime.lastVerified).toMatchObject({
    releaseId: v1.id,
    images: { app: V1 },
  });
  expect(operation(recovered.id)).toMatchObject({
    state: "verified",
    blocksQueue: false,
  });
});
