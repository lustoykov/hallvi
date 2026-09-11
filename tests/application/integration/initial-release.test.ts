// A first deployment runs its approved release through the shared release
// loop, and Pi corrects execution failures within the approval. Pi, the
// resolver and the host are stand-ins; the approval route, operations, scope,
// lifecycle and receipt reconciliation are real.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pushTestDatabase } from "../../test-database";
const model = vi.hoisted(() => ({
  plan: vi.fn(),
  prepare: vi.fn(),
  execute: vi.fn(),
  verify: vi.fn(),
  ssh: vi.fn(),
}));
vi.mock("../../../src/server/deployment-planner", () => ({
  planRelease: model.plan,
}));
vi.mock("../../../src/server/native-compose", async (original) => ({
  ...(await original<object>()),
  prepareNativeRelease: model.prepare,
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: async () => ({ token: "synthetic" }),
}));
vi.mock("../../../src/server/deployment-source-files", () => ({
  deploymentSourceFiles: async () => ({
    paths: ["Dockerfile", "app.py"],
    read: async () => "",
  }),
}));
vi.mock("../../../src/server/execution-tree", () => ({
  fetchBaseTree: async () => [
    { path: "Dockerfile", mode: 0o644, content: Buffer.from("FROM python") },
  ],
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
vi.mock("../../../src/server/hetzner", () => ({
  hetzner: vi.fn(),
  hetznerConnectionId: () => "hetzner-a",
  smallestHostOffer: async (offer: unknown) => offer,
}));
vi.mock("../../../src/server/http", () => ({
  handle: async (fn: () => unknown) => {
    try {
      return Response.json(await fn());
    } catch (e) {
      return Response.json({ error: (e as Error).message }, { status: 400 });
    }
  },
}));
import { insertApplication, insertChat } from "../../../src/server/db";
import {
  getDeployment,
  requestDeployment,
  saveDeployment,
} from "../../../src/server/deployment-store";
import { claimOperation, operation } from "../../../src/server/operation-store";
import { runInitialRelease } from "../../../src/server/application-releases";
import { invalidateDeploymentRuntime } from "../../../src/server/deployment-lifecycle";
import { ReleaseExecutionError } from "../../../src/server/release-executor";
import {
  releaseOf,
  type DeploymentRelease,
  type NativeConfiguration,
} from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { deploymentDirectory } from "../../../src/server/deployment-files";
import { POST } from "../../../src/app/api/applications/[applicationId]/deployment/route";

let template: string, root: string, app: string, chat: string;
beforeAll(() => {
  template = join(
    mkdtempSync(join(tmpdir(), "sg-initial-schema-")),
    "db.sqlite",
  );
  pushTestDatabase(template);
});
afterAll(() => rmSync(dirname(template), { recursive: true, force: true }));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-initial-release-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "private"));
  copyFileSync(template, process.env.SERVER_GUY_DB_PATH!);
  app = insertApplication({
    name: "Notes",
    repositoryUrl: "https://github.com/qa/notes",
    repositoryOwner: "qa",
    repositoryName: "notes",
  }).id;
  chat = insertChat(app, "Deploy").id;
  for (const mock of Object.values(model)) mock.mockReset();
});
afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const REVISION = "a".repeat(40);
const SECRET = "synthetic-signing-value";
/** What resolution retains for Pi's one-service first deployment. */
function native(
  deploymentId: string,
  change: (app: Record<string, unknown>) => void = () => {},
): NativeConfiguration {
  const project = `sg-${deploymentId.slice(0, 8)}`;
  const app: Record<string, unknown> = {
    build: { context: ".", dockerfile: "Dockerfile" },
    image: `server-guy-${deploymentId}-app:${REVISION}`,
    command: ["python", "app.py"],
    environment: { APP_SECRET: "${APP_SECRET}" },
    ports: [{ target: 8080, published: "80", protocol: "tcp" }],
    volumes: [{ type: "volume", source: "data", target: "/data" }],
    labels: { "server-guy.revision": REVISION },
  };
  change(app);
  return {
    format: 1,
    resolver: "docker compose 2.40.3",
    compose: ["compose.yaml", ".server-guy/override.compose.json"],
    files: [],
    resolved: {
      name: project,
      services: { app },
      volumes: { data: { name: `${project}_data` } },
    },
    inputs: ["APP_SECRET"],
    inputReasons: { APP_SECRET: "Signs note digests" },
    data: [{ volume: "data", kind: "database", sqlite: "notes.sqlite" }],
    database: null,
    httpAccess: "public",
    criterion: {
      healthPath: "/health",
      checks: [
        {
          name: "Home",
          method: "GET",
          path: "/",
          body: null,
          expectedStatus: 200,
          contains: "Notes",
          captureId: null,
        },
      ],
      services: [],
    },
    summary: "Notes web service with its SQLite data volume",
  };
}
const selection = {
  compose: ["compose.yaml"],
  summary: "The corrected first deployment",
};
function post(body: unknown) {
  return POST(
    new Request("http://localhost:3000/api/deployment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ applicationId: app }) },
  );
}
/** The worker's steps before the loop: claim, then provision the host. */
function claim(id: string) {
  const record = getDeployment(id)!;
  expect(
    claimOperation(record.operationId ?? `deployment:${id}`)?.executorPid,
  ).toBe(process.pid);
  Object.assign(record, {
    status: "deploying",
    serverId: 7,
    address: "203.0.113.7",
  });
  saveDeployment(record);
  writeFileSync(join(deploymentDirectory(record), "database-password"), "x");
  return record;
}
/** Intake produced a native recommendation; the owner approves it. */
async function approved() {
  const record = requestDeployment(app, chat);
  Object.assign(record, {
    status: "awaiting-approval",
    revision: REVISION,
    repositoryId: 10,
    plan: null,
    native: native(record.id),
    recommendationId: randomUUID(),
    offer: {
      serverType: "cx23",
      location: "fsn1",
      cores: 2,
      memory: 4,
      monthly: 5,
      hourly: 0.01,
      currency: "EUR",
    },
  });
  record.releaseId = releaseOf(record)!.id;
  saveDeployment(record);
  const response = await post({
    action: "approve",
    deploymentId: record.id,
    recommendationId: record.recommendationId,
    maxMonthly: 5,
    inputs: { APP_SECRET: SECRET },
  });
  expect(response.status).toBe(200);
  return claim(record.id);
}
/** The record transition executeRelease makes before contacting the host. */
function adopt(r: DeploymentRecord, release: DeploymentRelease) {
  r.native = release.native;
  r.revision = release.revision;
  r.releaseId = release.id;
}

it("executes the approved release first and lets Pi correct a failure within the approval's effects", async () => {
  const record = await approved();
  const approvedId = record.releaseId!;
  // Approval binds the exact release, its price and its private inputs.
  expect(record.authority).toMatchObject({
    releaseId: approvedId,
    maxMonthly: 5,
  });
  const image = `sha256:${"e".repeat(64)}`;
  model.execute.mockImplementation(
    async (r: DeploymentRecord, release: DeploymentRelease) => {
      invalidateDeploymentRuntime(r);
      adopt(r, release);
      const first = model.execute.mock.calls.length === 1;
      r.lifecycle!.attempts.at(-1)!.remoteResult = {
        phase: "replace",
        exitCode: first ? 1 : 0,
        at: new Date().toISOString(),
      };
      saveDeployment(r);
      if (first)
        throw new ReleaseExecutionError(
          "python: can't open file '/app/app.py': [Errno 2] No such file",
          true,
          "replace",
        );
      Object.assign(r, {
        serviceImages: { app: image },
        imageId: image,
        verifiedAt: new Date().toISOString(),
      });
      return { behavior: "passed", evidence: "Verified the first deployment" };
    },
  );
  model.prepare
    .mockImplementationOnce(async ({ deploymentId }) =>
      native(deploymentId, (app) => {
        app.ports = [{ target: 8080, published: "8080", protocol: "tcp" }];
      }),
    )
    .mockImplementationOnce(async ({ deploymentId }) =>
      native(deploymentId, (app) => {
        app.command = ["python", "src/app.py"];
      }),
    );
  model.plan.mockImplementation(async (_files, _r, _signal, options) => {
    expect(options).toMatchObject({
      initial: true,
      runId: `deployment:${record.id}`,
    });
    // Pi starts from the execution feedback and the approved configuration.
    expect(options.context).toContain("first deployment");
    expect(options.context).toContain("No such file");
    expect(
      options.workspaceFiles.map((file: { path: string }) => file.path),
    ).toEqual(
      expect.arrayContaining([
        ".server-guy/current/compose.json",
        ".server-guy/current/release.json",
      ]),
    );
    const exposed = await options.apply(selection, []);
    expect(exposed).toMatchObject({
      ok: false,
      kind: "authorization",
      retryable: false,
    });
    expect(exposed.message).toContain("exposure");
    expect(await options.apply(selection, [])).toMatchObject({ ok: true });
  });
  await expect(
    runInitialRelease(record, new AbortController().signal),
  ).resolves.toBe("Verified the first deployment");
  const saved = getDeployment(record.id)!;
  const lifecycle = saved.lifecycle!;
  expect(
    lifecycle.attempts.map((a) => [a.kind, a.outcome, a.authorizationId]),
  ).toEqual([
    ["deploy", "failed", record.recommendationId],
    ["deploy", "verified", record.recommendationId],
  ]);
  // The refused selection never ran; the approval still names its release.
  expect(model.execute).toHaveBeenCalledTimes(2);
  expect(model.execute.mock.calls[0][1].id).toBe(approvedId);
  expect(lifecycle.releases.map((r) => r.id)).toEqual([
    approvedId,
    saved.releaseId,
  ]);
  expect(saved.authority!.releaseId).toBe(approvedId);
  expect(lifecycle.runtime).toMatchObject({
    state: "verified",
    lastVerified: { releaseId: saved.releaseId, images: { app: image } },
  });
  expect(saved.status).toBe("live");
  expect(operation(`deployment:${record.id}`)!.state).toBe("verified");
  expect(
    saved.events.filter((e) => e.message.startsWith("Release feedback:")),
  ).toHaveLength(2);
  expect(JSON.stringify(saved)).not.toContain(SECRET);
});

it("reconciles a lost first execution from its host receipt on retry, never repeating it", async () => {
  let record = await approved();
  model.prepare.mockImplementation(async ({ deploymentId }) =>
    native(deploymentId),
  );
  model.execute.mockImplementation(
    async (r: DeploymentRecord, release: DeploymentRelease) => {
      invalidateDeploymentRuntime(r);
      adopt(r, release);
      saveDeployment(r);
      throw new ReleaseExecutionError(
        "The remote release outcome is unknown.",
        false,
        "transport",
      );
    },
  );
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    expect(options.context).toContain("outcome is unknown");
    const blocked = await options.apply(selection, []);
    expect(blocked).toMatchObject({
      ok: false,
      kind: "authorization",
      retryable: false,
    });
    expect(blocked.message).toContain("unknown");
    throw new Error("Pi stopped: the outcome needs reconciliation.");
  });
  await expect(
    runInitialRelease(record, new AbortController().signal),
  ).rejects.toThrow("needs reconciliation");
  // The worker records the stop, and the owner retries the same approval.
  record = getDeployment(record.id)!;
  Object.assign(record, { status: "failed", error: "Pi stopped" });
  saveDeployment(record);
  expect(
    (await post({ action: "retry", deploymentId: record.id })).status,
  ).toBe(200);
  record = claim(record.id);
  const lost = record.lifecycle!.attempts.at(-1)!;
  model.ssh.mockResolvedValueOnce(
    JSON.stringify({
      attemptId: lost.id,
      releaseId: lost.releaseId,
      revision: REVISION,
      phase: "replace",
      exitCode: 0,
    }),
  );
  model.verify.mockImplementationOnce(async (r: DeploymentRecord) => {
    const image = `sha256:${"f".repeat(64)}`;
    Object.assign(r, {
      serviceImages: { app: image },
      imageId: image,
      verifiedAt: new Date().toISOString(),
    });
    return { behavior: "passed", evidence: "Verified the first deployment." };
  });
  await expect(
    runInitialRelease(record, new AbortController().signal),
  ).resolves.toContain("Reconciled the completed host command");
  expect(model.execute).toHaveBeenCalledOnce();
  expect(model.plan).toHaveBeenCalledOnce();
  const saved = getDeployment(record.id)!;
  expect(saved.lifecycle!.attempts.map((a) => [a.kind, a.outcome])).toEqual([
    ["deploy", "failed"],
    ["reconcile", "verified"],
  ]);
  expect(saved.lifecycle!.attempts[1]).toMatchObject({
    reconcilesAttemptId: lost.id,
    authorizationId: record.recommendationId,
    operationId: record.operationId,
  });
  expect(saved.lifecycle!.runtime.state).toBe("verified");
});

it("keeps a verified execution when Pi's session is interrupted afterwards", async () => {
  const record = await approved();
  const image = `sha256:${"d".repeat(64)}`;
  model.prepare.mockImplementation(async ({ deploymentId }) =>
    native(deploymentId, (app) => {
      app.command = ["python", "main.py"];
    }),
  );
  model.execute.mockImplementation(
    async (r: DeploymentRecord, release: DeploymentRelease) => {
      invalidateDeploymentRuntime(r);
      adopt(r, release);
      const first = model.execute.mock.calls.length === 1;
      r.lifecycle!.attempts.at(-1)!.remoteResult = {
        phase: first ? "build" : "replace",
        exitCode: first ? 1 : 0,
        at: new Date().toISOString(),
      };
      saveDeployment(r);
      if (first)
        throw new ReleaseExecutionError("Base image not found", true, "build");
      Object.assign(r, {
        serviceImages: { app: image },
        imageId: image,
        verifiedAt: new Date().toISOString(),
      });
      return { behavior: "passed", evidence: "Verified the correction" };
    },
  );
  // The worker stops while Pi writes its closing reply.
  model.plan.mockImplementationOnce(async (_files, _r, _signal, options) => {
    expect(await options.apply(selection, [])).toMatchObject({ ok: true });
    throw new DOMException("This operation was aborted", "AbortError");
  });
  await expect(
    runInitialRelease(record, new AbortController().signal),
  ).resolves.toBe("Verified the correction");
  const saved = getDeployment(record.id)!;
  expect(saved.status).toBe("live");
  expect(saved.lifecycle!.runtime.state).toBe("verified");
});
