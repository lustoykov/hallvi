import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  getChat,
  insertApplication,
  insertWorkspace,
  insertChat,
  listMessages,
} from "../../../src/server/db";
import {
  requestDeployment,
  getDeployment,
  saveDeployment,
  DeploymentConflictError,
} from "../../../src/server/deployment-store";
import { POST } from "../../../src/app/api/applications/[applicationId]/deployment/route";
let root: string;
let app: string;
let chat: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-deployment-state-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
  app = insertApplication({
    name: "Test",
    repositoryUrl: "https://github.com/qa/todo",
    repositoryOwner: "qa",
    repositoryName: "todo",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Test",
  }).id;
  chat = insertChat(insertWorkspace(app).id, "Conversation", true).id;
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
  const otherChat = insertChat(
    getChat(chat)!.workspaceId,
    "Follow deployment",
    false,
  ).id;
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
  const other = insertChat(
    getChat(chat)!.workspaceId,
    "Follow deployment",
    false,
  ).id;
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
  const other = insertChat(
    getChat(chat)!.workspaceId,
    "Later question",
    false,
  ).id;
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
