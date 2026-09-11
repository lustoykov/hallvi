import { queueNative } from "../../fixtures/queue-worker/native";
import {
  beginDeploymentAttempt,
  invalidateDeploymentRuntime,
} from "../../../src/server/deployment-lifecycle";
import { runDeploymentAttempt } from "../../../src/server/deployment-store";
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
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { pushTestDatabase } from "../../test-database";
const external = vi.hoisted(() => ({
  provider: vi.fn(),
  price: vi.fn(),
  source: vi.fn(),
  inputs: vi.fn(),
}));
vi.mock("../../../src/server/hetzner", () => ({
  hetzner: external.provider,
  smallestHostOffer: external.price,
  hetznerConnectionId: () => "hetzner-a",
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: external.source,
}));
vi.mock("../../../src/server/deployment-executor", () => ({
  saveDeploymentInputs: external.inputs,
  collectDeploymentLogs: vi.fn(),
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
import {
  insertApplication,
  insertChat,
  listMessages,
} from "../../../src/server/db";
import {
  requestDeployment,
  getDeployment,
  saveDeployment,
  DeploymentConflictError,
  interruptDeployments,
} from "../../../src/server/deployment-store";
import { claimOperation, operation } from "../../../src/server/operation-store";
import { POST } from "../../../src/app/api/applications/[applicationId]/deployment/route";
import {
  deploymentDirectory,
  deploymentPath,
} from "../../../src/server/deployment-files";
let template: string;
let root: string;
let app: string;
let chat: string;
// One schema push per file; each test starts from its own copy.
beforeAll(() => {
  template = join(
    mkdtempSync(join(tmpdir(), "sg-deployment-schema-")),
    "db.sqlite",
  );
  pushTestDatabase(template);
});
afterAll(() => rmSync(dirname(template), { recursive: true, force: true }));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-deployment-state-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "private"));
  copyFileSync(template, process.env.SERVER_GUY_DB_PATH!);
  app = insertApplication({
    name: "Test",
    repositoryUrl: "https://github.com/qa/todo",
    repositoryOwner: "qa",
    repositoryName: "todo",
  }).id;
  chat = insertChat(app, "Conversation").id;
  vi.clearAllMocks();
  external.provider.mockResolvedValue({ servers: [] });
  external.source.mockResolvedValue({});
});
afterEach(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
function post(
  body: unknown,
  origin = "http://localhost:3000",
  host = "localhost:3000",
) {
  return POST(
    new Request("http://localhost:3000/api/deployment", {
      method: "POST",
      headers: { "content-type": "application/json", origin, host },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ applicationId: app }) },
  );
}
function recommendation() {
  const r = requestDeployment(app, chat, "server-guy");
  r.status = "awaiting-approval";
  r.recommendationId = randomUUID();
  r.offer = {
    serverType: "cx23",
    location: "fsn1",
    cores: 2,
    memory: 4,
    monthly: 5,
    hourly: 0.01,
    currency: "EUR",
  };
  saveDeployment(r);
  external.price.mockResolvedValue(r.offer);
  return r;
}
it("recovers a crash after claiming a deployment but before execution starts", async () => {
  const r = recommendation();
  const response = await post({
    action: "approve",
    deploymentId: r.id,
    recommendationId: r.recommendationId,
    maxMonthly: 5,
    inputs: {},
  });
  expect(response.status).toBe(200);
  const id = `deployment:${r.id}`;
  // Ordinary unclaimed approvals survive restart and remain executable.
  interruptDeployments();
  expect(getDeployment(r.id)?.status).toBe("deploy-queued");
  expect(claimOperation(id)?.executorPid).toBe(process.pid);
  interruptDeployments();
  expect(getDeployment(r.id)?.status).toBe("failed");
  expect(operation(id)?.state).toBe("failed");
  expect(operation(id)?.executorPid).toBeNull();
});
it("agent initiation preserves provenance and repeating it reuses the request", () => {
  const r = requestDeployment(app, chat, "server-guy");
  expect(requestDeployment(app, chat, "server-guy").id).toBe(r.id);
  const messages = listMessages(chat);
  expect(messages).toHaveLength(2);
  expect(
    messages.every((m) => m.role === "assistant" && m.source === "server-guy"),
  ).toBe(true);
});
it("rejects a stale state writer without undoing another operation", () => {
  const r = requestDeployment(app, chat);
  const stale = getDeployment(r.id)!;
  r.status = "planning";
  saveDeployment(r);
  stale.status = "failed";
  expect(() => saveDeployment(stale)).toThrow(DeploymentConflictError);
  expect(getDeployment(r.id)?.status).toBe("planning");
});
it("keeps worker progress and references when another conversation follows active work", () => {
  const worker = requestDeployment(app, chat);
  worker.status = "deploying";
  saveDeployment(worker);
  const otherChat = insertChat(app, "Follow deployment").id;
  const followed = requestDeployment(app, otherChat, "server-guy");
  expect(followed.mentions).toHaveLength(1);

  worker.events.push({ at: new Date().toISOString(), message: "Host ready" });
  worker.serverId = 123;
  saveDeployment(worker);
  const saved = getDeployment(worker.id)!;
  expect(saved.serverId).toBe(123);
  expect(saved.events.at(-1)?.message).toBe("Host ready");
  expect(saved.mentions).toEqual(followed.mentions);
  expect(saved.status).toBe("deploying");

  followed.status = "failed";
  expect(() => saveDeployment(followed)).toThrow(DeploymentConflictError);
});
it("approval is bound to the recommendation actually displayed", async () => {
  const r = recommendation();
  const response = await post({
    action: "approve",
    deploymentId: r.id,
    recommendationId: randomUUID(),
    maxMonthly: 5,
    inputs: {},
  });
  expect(response.status).toBe(400);
  expect(external.inputs).not.toHaveBeenCalled();
  expect(getDeployment(r.id)?.status).toBe("awaiting-approval");
});
it("a price increase updates the recommendation without approving or saving secrets", async () => {
  const r = recommendation();
  external.price.mockResolvedValue({ ...r.offer, monthly: 7 });
  const response = await post({
    action: "approve",
    deploymentId: r.id,
    recommendationId: r.recommendationId,
    maxMonthly: 5,
    inputs: {},
  });
  expect(response.status).toBe(400);
  expect(external.inputs).not.toHaveBeenCalled();
  expect(getDeployment(r.id)?.offer?.monthly).toBe(7);
  expect(getDeployment(r.id)?.recommendationId).not.toBe(r.recommendationId);
});
it("cancels only confirmed empty setup and preserves a transcript receipt", async () => {
  const r = recommendation();
  expect((await post({ action: "cancel", deploymentId: r.id })).status).toBe(
    200,
  );
  expect(getDeployment(r.id)).toBeNull();
  expect(listMessages(chat).at(-1)?.body).toContain("cancelled by the user");
  expect(requestDeployment(app, chat).id).not.toBe(r.id);
});
it("cannot cancel an uncertain purchase or an observed server", async () => {
  const r = recommendation();
  r.status = "failed";
  r.serverCreateAttempted = true;
  saveDeployment(r);
  expect((await post({ action: "cancel", deploymentId: r.id })).status).toBe(
    400,
  );
  r.serverCreateAttempted = false;
  r.authority = {
    connectionId: "hetzner-a",
    acceptedAt: new Date().toISOString(),
    maxMonthly: 5,
  };
  saveDeployment(r);
  external.provider.mockResolvedValue({ servers: [{ id: 4 }] });
  expect((await post({ action: "cancel", deploymentId: r.id })).status).toBe(
    400,
  );
  expect(getDeployment(r.id)).not.toBeNull();
});
it("rejects cross-origin and rebinding-host requests before preparing work", async () => {
  expect(
    (await post({ action: "prepare", chatId: chat }, "https://evil.example"))
      .status,
  ).toBe(400);
  expect(
    (
      await post(
        { action: "prepare", chatId: chat },
        "http://evil.example",
        "evil.example",
      )
    ).status,
  ).toBe(400);
  expect(listMessages(chat)).toHaveLength(0);
});

it("approves unchanged execution state when another chat follows during pricing", async () => {
  const r = recommendation();
  const other = insertChat(app, "Follow deployment").id;
  external.price.mockImplementationOnce(async () => {
    requestDeployment(app, other, "server-guy");
    return r.offer;
  });
  const response = await post({
    action: "approve",
    deploymentId: r.id,
    recommendationId: r.recommendationId,
    maxMonthly: 5,
    inputs: { APP_TOKEN: "test-only" },
  });
  expect(response.status).toBe(200);
  expect(external.inputs).toHaveBeenCalledOnce();
  const saved = getDeployment(r.id)!;
  expect(saved.status).toBe("deploy-queued");
  expect(saved.authority?.maxMonthly).toBe(5);
  expect(saved.mentions).toHaveLength(1);
  expect(saved.mentions?.[0]?.chatId).toBe(other);
  expect((await response.json()).deployment.mentions).toEqual(saved.mentions);
});

it("a recommendation changed during pricing cannot overwrite its private inputs", async () => {
  const r = recommendation();
  external.price.mockImplementationOnce(async () => {
    const changed = getDeployment(r.id)!;
    changed.recommendationId = randomUUID();
    saveDeployment(changed);
    return changed.offer;
  });
  const response = await post({
    action: "approve",
    deploymentId: r.id,
    recommendationId: r.recommendationId,
    maxMonthly: 5,
    inputs: {},
  });
  expect(response.status).toBe(400);
  expect(external.inputs).not.toHaveBeenCalled();
  expect(getDeployment(r.id)?.status).toBe("awaiting-approval");
});
it("records the announcing reply and refers a second conversation to the same deployment", () => {
  const r = requestDeployment(app, chat, "server-guy");
  const announced = listMessages(chat).at(-1)!;
  expect(getDeployment(r.id)?.originMessageId).toBe(announced.id);
  const other = insertChat(app, "Later question").id;
  const same = requestDeployment(app, other, "server-guy");
  expect(same.id).toBe(r.id);
  const reply = listMessages(other);
  expect(reply).toHaveLength(1);
  expect(reply[0].source).toBe("server-guy");
  expect(reply[0].body).toContain("already has a deployment");
  expect(getDeployment(r.id)?.mentions).toEqual([
    { chatId: other, messageId: reply[0].id, at: reply[0].createdAt },
  ]);
  // The original conversation is not touched by the reference.
  expect(listMessages(chat)).toHaveLength(2);
});

it("removes only the cancelled setup's private files, retaining other deployments", async () => {
  const r = recommendation();
  writeFileSync(
    join(deploymentDirectory(r), "inputs.json"),
    "synthetic secret",
  );
  const other = { id: randomUUID() };
  writeFileSync(join(deploymentDirectory(other), "client"), "other key");
  expect((await post({ action: "cancel", deploymentId: r.id })).status).toBe(
    200,
  );
  expect(existsSync(deploymentPath(r.id))).toBe(false);
  expect(existsSync(join(deploymentPath(other.id), "client"))).toBe(true);
});

it("requires owner-confirmed provider evidence and clears spending authority after reconciliation", async () => {
  const r = recommendation();
  r.status = "failed";
  r.serverCreateAttempted = true;
  r.authority = {
    connectionId: "hetzner-a",
    acceptedAt: new Date().toISOString(),
    maxMonthly: 5,
  };
  saveDeployment(r);
  const input = {
    action: "resolve-purchase",
    deploymentId: r.id,
    confirmedNotCreated: true,
    providerReference: "Support ticket TEST-123",
  };
  expect((await post({ ...input, confirmedNotCreated: false })).status).toBe(
    400,
  );
  external.provider.mockResolvedValueOnce({ servers: [{ id: 8 }] });
  expect((await post(input)).status).toBe(400);
  expect(getDeployment(r.id)?.serverCreateAttempted).toBe(true);
  external.provider.mockResolvedValueOnce({ servers: [] });
  expect((await post(input)).status).toBe(200);
  const resolved = getDeployment(r.id)!;
  expect(resolved.serverCreateAttempted).toBe(false);
  expect(resolved.authority).toBeNull();
  expect(resolved.events.at(-1)?.message).toContain("Owner-attested");
  expect((await post({ action: "retry", deploymentId: r.id })).status).toBe(
    200,
  );
  expect(getDeployment(r.id)?.status).toBe("queued"); // inspect, never purchase
});

function executable() {
  const r = recommendation();
  r.revision = "a".repeat(40);
  r.native = queueNative(r.id, "a".repeat(40));
  r.authority = {
    connectionId: "hetzner-a",
    acceptedAt: new Date().toISOString(),
    maxMonthly: 5,
  };
  r.status = "deploy-queued";
  saveDeployment(r);
  return r;
}
it("persists retries, immutable release snapshots, and the verified runtime through CAS saves", async () => {
  const r = executable();
  await expect(
    runDeploymentAttempt(r, "deploy", "attempt-operation-1", async () => {
      r.status = "deploying";
      invalidateDeploymentRuntime(r);
      saveDeployment(r);
      throw new Error("Synthetic startup failure");
    }),
  ).rejects.toThrow("Synthetic startup failure");
  const failed = structuredClone(getDeployment(r.id)!.lifecycle!.attempts[0]);
  expect(failed.outcome).toBe("failed");
  await runDeploymentAttempt(r, "deploy", "attempt-operation-2", async () => {
    invalidateDeploymentRuntime(r);
    saveDeployment(r);
    r.serverId = 77;
    r.imageId = "sha256:synthetic";
    r.verifiedAt = new Date().toISOString();
  });
  const saved = getDeployment(r.id)!;
  expect(saved.status).toBe("live");
  expect(saved.lifecycle!.host.serverId).toBe(77);
  expect(saved.lifecycle!.attempts).toHaveLength(2);
  expect(saved.lifecycle!.attempts[0]).toEqual(failed);
  expect(saved.lifecycle!.attempts[1].releaseId).toBe(failed.releaseId);
  expect(saved.lifecycle!.runtime.lastVerified!.images.app).toBe(
    "sha256:synthetic",
  );
  const release = structuredClone(saved.lifecycle!.releases[0]);
  saved.lifecycle!.releases[0].native.resolved.services.app.command = [
    "changed",
  ];
  expect(() => saveDeployment(saved)).toThrow("cannot be rewritten");
  expect(getDeployment(r.id)!.lifecycle!.releases[0]).toEqual(release);
});
it("records an interrupted attempt before another worker can retry", () => {
  const r = executable();
  const attempt = beginDeploymentAttempt(r, "deploy", "attempt-operation-1");
  r.status = "deploying";
  invalidateDeploymentRuntime(r);
  saveDeployment(r);
  interruptDeployments();
  const saved = getDeployment(r.id)!;
  expect(saved.lifecycle!.attempts[0]).toMatchObject({
    id: attempt.id,
    outcome: "interrupted",
  });
  expect(saved.lifecycle!.runtime.state).toBe("unknown");
  expect(() => saveDeployment(r)).toThrow(DeploymentConflictError);
});
