import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  DeploymentPlan,
  DeploymentRecord,
} from "../../../src/server/deployment-types";

vi.mock("../../../src/server/db", () => ({
  getApplication: () => ({ repositoryOwner: "qa", repositoryName: "todo" }),
}));
const api = vi.hoisted(() => vi.fn());
vi.mock("../../../src/server/hetzner", async (original) => ({
  ...(await original<object>()),
  smallestHostOffer: vi.fn(async (offer) => offer),
  hetzner: api,
  hetznerConnectionId: () => "connection-a",
}));
vi.mock("../../../src/server/deployment-store", () => ({
  saveDeployment: vi.fn(),
  deploymentMessage: vi.fn(),
  deploymentEvent: vi.fn(),
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: vi.fn(async () => ({ token: "synthetic" })),
}));
import { HetznerError, smallestHostOffer } from "../../../src/server/hetzner";
import {
  provision,
  composeDefinition,
  deploymentDirectory,
  executeDeployment,
  verifyDeployment,
} from "../../../src/server/deployment-executor";

const plan: DeploymentPlan = {
  summary: "A synthetic application with private database",
  dockerfile: "Dockerfile",
  generatedDockerfile: null,
  context: ".",
  port: 8000,
  command: null,
  environment: [],
  postgres: {
    version: "16",
    variable: "DATABASE_URL",
    scheme: "postgresql+psycopg",
  },
  missingInputs: [],
  healthPath: "/health",
  checks: [
    {
      name: "Content",
      method: "GET",
      path: "/",
      body: null,
      expectedStatus: 200,
      contains: "Todo",
      captureId: null,
    },
  ],
};
function record(): DeploymentRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    applicationId: "app",
    chatId: "chat",
    status: "deploy-queued",
    repository: "qa/todo",
    revision: "a".repeat(40),
    plan,
    offer: {
      serverType: "cx23",
      location: "fsn1",
      cores: 2,
      memory: 4,
      monthly: 5,
      hourly: 0.01,
      currency: "EUR",
    },
    authority: {
      acceptedAt: new Date().toISOString(),
      connectionId: "connection-a",
      maxMonthly: 5,
    },
    serverId: null,
    serverCreateAttempted: false,
    address: null,
    imageId: null,
    url: null,
    verifiedAt: null,
    error: null,
    logs: "",
    events: [],
    createdAt: "now",
    updatedAt: "now",
  };
}
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-deployment-test-"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", root);
  api.mockReset();
  vi.mocked(smallestHostOffer).mockImplementation(async (offer) => ({
    ...record().offer!,
    ...offer,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
});
describe("real deployment boundary", () => {
  it("waits for the HTTP listener without retrying a mutating behavior check", async () => {
    const value = record();
    value.address = "203.0.113.10";
    value.plan = {
      ...plan,
      checks: [
        {
          name: "Create",
          method: "POST",
          path: "/todos",
          body: { title: "synthetic" },
          expectedStatus: 201,
          contains: "created",
          captureId: null,
        },
      ],
    };
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(new Response("healthy"))
      .mockResolvedValueOnce(new Response("created", { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    await verifyDeployment(value, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(
      fetcher.mock.calls.filter((call) => call[1].method === "POST"),
    ).toHaveLength(1);
  });
  it("never repeats an uncertain server purchase", async () => {
    const value = record();
    value.serverCreateAttempted = true;
    for (const name of ["client", "host", "database-password"])
      writeFileSync(join(deploymentDirectory(value), name), "synthetic", {
        mode: 0o600,
      });
    api.mockResolvedValue({ servers: [] });
    await expect(
      executeDeployment(value, new AbortController().signal),
    ).rejects.toThrow("No second purchase");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][1]).toBeUndefined(); // GET only; no request body.
  });
  it("refuses changed authority before any provider call", async () => {
    const value = record();
    value.authority!.connectionId = "different-project";
    await expect(
      executeDeployment(value, new AbortController().signal),
    ).rejects.toThrow("access changed");
    expect(api).not.toHaveBeenCalled();
  });
  it("keeps PostgreSQL private and persistent and preserves dollar characters in supplied values", () => {
    const compose = composeDefinition(
      plan,
      "a".repeat(40),
      "deployment",
      "synthetic-password",
      { API_KEY: "abc$ENV${OTHER}" },
    );
    expect(compose.services.postgres).not.toHaveProperty("ports");
    expect(compose.services.postgres).toMatchObject({
      volumes: ["database:/var/lib/postgresql/data"],
    });
    expect(compose.services.app).toMatchObject({
      ports: ["80:8000"],
      environment: {
        API_KEY: "abc$$ENV$${OTHER}",
        DATABASE_URL:
          "postgresql+psycopg://serverguy:synthetic-password@postgres:5432/application",
      },
    });
  });
  it("does not accept healthy HTTP when the application behavior is wrong", async () => {
    const value = record();
    value.address = "203.0.113.10";
    value.plan = {
      ...plan,
      checks: [
        {
          name: "Actual content",
          method: "GET",
          path: "/",
          body: null,
          expectedStatus: 200,
          contains: "Expected app",
          captureId: null,
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("healthy"))
        .mockResolvedValueOnce(new Response("wrong application")),
    );
    await expect(
      verifyDeployment(value, new AbortController().signal),
    ).rejects.toThrow("Actual content");
    expect(value.verifiedAt).toBeNull();
  });
  it("binds a read and cleanup to the object created by this verification", async () => {
    const value = record();
    value.address = "203.0.113.10";
    value.plan = {
      ...plan,
      checks: [
        {
          name: "Create",
          method: "POST",
          path: "/todos",
          body: { title: "SG_VERIFY_TOKEN" },
          expectedStatus: 201,
          contains: "SG_VERIFY_TOKEN",
          captureId: "todo.id",
        },
        {
          name: "Read",
          method: "GET",
          path: "/todos/{id}",
          body: null,
          expectedStatus: 200,
          contains: "SG_VERIFY_TOKEN",
          captureId: null,
        },
        {
          name: "Delete",
          method: "DELETE",
          path: "/todos/{id}",
          body: null,
          expectedStatus: 204,
          contains: "",
          captureId: null,
        },
      ],
    };
    let title = "";
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      if (url.pathname === "/health") return new Response("healthy");
      if (init.method === "POST") {
        title = JSON.parse(init.body as string).title;
        return Response.json(
          { todo: { id: "created-id", title } },
          { status: 201 },
        );
      }
      expect(url.pathname).toBe("/todos/created-id");
      return init.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json({ todo: { id: "created-id", title } });
    });
    vi.stubGlobal("fetch", fetcher);
    await verifyDeployment(value, new AbortController().signal);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(title).toMatch(/^sg-check-/);
  });
});

function keys(value: DeploymentRecord) {
  for (const name of [
    "client",
    "client.pub",
    "host",
    "host.pub",
    "database-password",
  ])
    writeFileSync(join(deploymentDirectory(value), name), "synthetic", {
      mode: 0o600,
    });
}
it("a definite create rejection can be retried while an ambiguous failure stays blocked", async () => {
  const value = record();
  keys(value);
  const created = {
    id: 12,
    labels: { "sg-deployment": value.id },
    status: "running",
    public_net: { ipv4: { ip: "203.0.113.10" } },
  };
  let attempts = 0;
  api.mockImplementation(async (path, body) => {
    if (path.startsWith("/servers?") || path === "/servers/12")
      return path.includes("?") ? { servers: [] } : { server: created };
    if (path.startsWith("/ssh_keys?")) return { ssh_keys: [{ id: 1 }] };
    if (path.startsWith("/firewalls?")) return { firewalls: [{ id: 2 }] };
    if (path === "/servers" && body) {
      if (++attempts === 1) throw new HetznerError(412, "resource_unavailable");
      return { server: created };
    }
    throw new Error(path);
  });
  await expect(provision(value, new AbortController().signal)).rejects.toThrow(
    "resource_unavailable",
  );
  expect(value.serverCreateAttempted).toBe(false);
  await provision(value, new AbortController().signal);
  expect(value.serverId).toBe(12);
  expect(attempts).toBe(2);
});
it("reconciles a server whose create response was lost without another POST", async () => {
  const value = record();
  keys(value);
  value.serverCreateAttempted = true;
  const server = {
    id: 12,
    labels: { "sg-deployment": value.id },
    status: "running",
    public_net: { ipv4: { ip: "203.0.113.10" } },
  };
  api.mockResolvedValue({ servers: [server], server });
  await provision(value, new AbortController().signal);
  expect(value.serverId).toBe(12);
  expect(api.mock.calls.every((args) => args[1] === undefined)).toBe(true);
});
it("requires renewed approval when purchase-time pricing exceeds the cap", async () => {
  const value = record();
  keys(value);
  api.mockResolvedValue({ servers: [] });
  vi.mocked(smallestHostOffer).mockResolvedValue({
    ...value.offer!,
    monthly: 7,
  });
  await expect(provision(value, new AbortController().signal)).rejects.toThrow(
    "updated server price",
  );
  expect(value.status).toBe("awaiting-approval");
  expect(value.authority).toBeNull();
  expect(value.serverCreateAttempted).toBe(false);
  expect(api).toHaveBeenCalledTimes(1);
});
it("cleans up the captured test object when a later read assertion fails", async () => {
  const value = record();
  value.address = "203.0.113.10";
  value.plan = {
    ...plan,
    checks: [
      {
        name: "Create",
        method: "POST",
        path: "/todos",
        body: { title: "SG_VERIFY_TOKEN" },
        expectedStatus: 201,
        contains: "SG_VERIFY_TOKEN",
        captureId: "id",
      },
      {
        name: "Read",
        method: "GET",
        path: "/todos/{id}",
        body: null,
        expectedStatus: 200,
        contains: "SG_VERIFY_TOKEN",
        captureId: null,
      },
      {
        name: "Cleanup",
        method: "DELETE",
        path: "/todos/{id}",
        body: null,
        expectedStatus: 204,
        contains: "",
        captureId: null,
      },
    ],
  };
  const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
    if (url.pathname === "/health") return new Response("ok");
    if (init.method === "POST")
      return Response.json(
        { id: "owned-test", ...JSON.parse(init.body as string) },
        { status: 201 },
      );
    if (init.method === "DELETE") {
      expect(url.pathname).toBe("/todos/owned-test");
      return new Response(null, { status: 204 });
    }
    return new Response("wrong content");
  });
  vi.stubGlobal("fetch", fetcher);
  await expect(
    verifyDeployment(value, new AbortController().signal),
  ).rejects.toThrow("Read");
  expect(value.cleanup).toBeNull();
  expect(value.verificationPending).toBeNull();
  expect(
    fetcher.mock.calls.filter((args) => args[1].method === "DELETE"),
  ).toHaveLength(1);
});
it("does not repeat test creation after an unknown POST outcome", async () => {
  const value = record();
  value.address = "203.0.113.10";
  value.verificationPending = "sg-check-prior";
  const fetcher = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", fetcher);
  await expect(
    verifyDeployment(value, new AbortController().signal),
  ).rejects.toThrow("unknown outcome");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([true, false])(
  "reconciles a supplied test ID only when its unique marker matches (%s)",
  async (matches) => {
    const value = record();
    value.address = "203.0.113.10";
    value.verificationPending = "sg-check-lost";
    value.verificationRecoveryId = "candidate";
    value.plan = {
      ...plan,
      checks: [
        {
          name: "Read",
          method: "GET",
          path: "/todos/{id}",
          body: null,
          expectedStatus: 200,
          contains: "SG_VERIFY_TOKEN",
          captureId: null,
        },
        {
          name: "Delete",
          method: "DELETE",
          path: "/todos/{id}",
          body: null,
          expectedStatus: 204,
          contains: "",
          captureId: null,
        },
      ],
    };
    const fetcher = vi.fn(async (url: URL, init: RequestInit = {}) => {
      if (url.pathname === "/health") return new Response("ok");
      expect(url.pathname).toBe("/todos/candidate");
      if (init.method === "DELETE") return new Response(null, { status: 204 });
      return new Response(matches ? "sg-check-lost" : "real user data");
    });
    vi.stubGlobal("fetch", fetcher);
    // The deliberately incomplete next check fails after recovery. It must not
    // hide whether cleanup was safely completed or left unresolved.
    await expect(
      verifyDeployment(value, new AbortController().signal),
    ).rejects.toThrow(matches ? "captured object ID" : "Nothing was deleted");
    expect(value.verificationPending).toBe(matches ? null : "sg-check-lost");
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "DELETE"),
    ).toHaveLength(matches ? 1 : 0);
  },
);

it("reuses official images and preserves data/config mounts without publishing private services", () => {
  const value: DeploymentPlan = {
    ...plan,
    postgres: null,
    image: "grafana/grafana@sha256:" + "a".repeat(64),
    volumes: [
      {
        name: "grafana-data",
        target: "/var/lib/grafana",
        kind: "database",
        sqlite: "/var/lib/grafana/grafana.db",
      },
    ],
    configs: [
      {
        name: "datasource",
        target: "/etc/grafana/provisioning/datasources/prometheus.yaml",
        content: "url: http://prometheus:9090",
      },
    ],
    services: [
      {
        name: "prometheus",
        image: "prom/prometheus@sha256:" + "b".repeat(64),
        command: null,
        environment: [],
        volumes: [
          {
            name: "metrics",
            target: "/prometheus",
            kind: "files",
            sqlite: null,
          },
        ],
        configs: [],
        port: 9090,
        healthPath: "/-/ready",
        checks: [],
      },
    ],
  };
  const compose = composeDefinition(value, "a".repeat(40), "id", "unused", {});
  expect(compose.services.app).not.toHaveProperty("build");
  expect(compose.services.app).toMatchObject({
    image: value.image,
    volumes: [
      "grafana-data:/var/lib/grafana",
      "./configs/app-datasource:/etc/grafana/provisioning/datasources/prometheus.yaml:ro",
    ],
  });
  expect(compose.services.prometheus).not.toHaveProperty("ports");
  expect(compose.volumes).toEqual({ "grafana-data": {}, metrics: {} });
});

it("verifies JSON content independently of formatting without changing values", async () => {
  const { responseContains } =
    await import("../../../src/server/deployment-executor");
  expect(responseContains('{\n  "database": "ok"\n}', '"database":"ok"')).toBe(
    true,
  );
  expect(responseContains('{"database":"not ok"}', '"database":"ok"')).toBe(
    false,
  );
  expect(responseContains('{"message":"not ok"}', '"message":"notok"')).toBe(
    false,
  );
  expect(responseContains("<p>not ok</p>", "notok")).toBe(false);
});
