import { expect, it, vi } from "vitest";
import { queuePlan } from "../../fixtures/queue-worker/plan";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
const mock = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../../../src/server/deployment-store", () => ({
  deploymentEvent: vi.fn(),
  deploymentMessage: vi.fn(),
  saveDeployment: vi.fn(),
}));
vi.mock("../../../src/server/pi-configuration", () => ({
  configuredPiRuntime: async () => ({
    configuration: {},
    modelRuntime: {},
    model: {},
  }),
  piConfigDir: () => "/tmp/synthetic-pi",
}));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  defineTool: (tool: unknown) => tool,
  createAgentSession: mock.create,
  SettingsManager: { inMemory: () => ({}) },
  SessionManager: { inMemory: () => ({}) },
  DefaultResourceLoader: class {
    async reload() {}
  },
}));
import { planDeployment } from "../../../src/server/deployment-planner";

it("returns validation and execution feedback to the same Pi session, which corrects and resubmits", async () => {
  const seen: unknown[] = [];
  const first = queuePlan();
  first.command = ["python", "wrong.py"];
  const second = queuePlan();
  const apply = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      kind: "replace",
      retryable: true,
      message: "python: can't open file wrong.py",
    })
    .mockResolvedValueOnce({ ok: true, message: "Verified" });
  mock.create.mockImplementation(async (options) => ({
    session: {
      prompt: async () => {
        const submit = options.customTools.find(
          (t: { name: string }) => t.name === "deploy_release",
        );
        const send = async (json: string) => {
          const result = await submit.execute("tool-call", { json });
          const feedback = JSON.parse(result.content[0].text);
          seen.push(feedback);
          return feedback;
        };
        expect((await send("{")).retryable).toBe(true);
        const failure = await send(JSON.stringify(first));
        expect(failure.message).toContain("wrong.py");
        expect(failure.retryable).toBe(true);
        const diagnostic = options.customTools.find(
          (t: { name: string }) => t.name === "inspect_release",
        );
        expect((await diagnostic.execute()).content[0].text).toContain(
          "wrong.py",
        );
        expect((await send(JSON.stringify(second))).ok).toBe(true);
        // A repeated call after success cannot redeploy.
        await submit.execute("tool-call", { json: JSON.stringify(second) });
      },
      waitForIdle: async () => {},
      dispose: vi.fn(),
      abort: vi.fn(),
    },
  }));
  const record = {
    repository: "qa/example",
    revision: "a".repeat(40),
    requirements: "Update",
  } as DeploymentRecord;
  const result = await planDeployment(
    [
      {
        path: "Dockerfile",
        mode: 0o644,
        content: Buffer.from("FROM python:3.12"),
      },
    ],
    record,
    new AbortController().signal,
    {
      apply,
      inspect: async () => ({ evidence: "Container exited: wrong.py missing" }),
    },
  );
  expect(result.command).toEqual(second.command);
  expect(apply).toHaveBeenCalledTimes(2);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(seen).toHaveLength(3);
});

it("accepts verified reconciliation as completion without another deploy tool call", async () => {
  const selected = queuePlan();
  const apply = vi
    .fn()
    .mockResolvedValue({
      ok: false,
      kind: "transport",
      retryable: false,
      message: "Lost reply",
    });
  const reconcile = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      verified: true,
      plan: selected,
      message: "Verified existing containers",
    });
  mock.create.mockImplementation(async (options) => ({
    session: {
      prompt: async () => {
        const deploy = options.customTools.find(
          (t: { name: string }) => t.name === "deploy_release",
        );
        const recovery = options.customTools.find(
          (t: { name: string }) => t.name === "reconcile_release",
        );
        await deploy.execute("deploy", { json: JSON.stringify(selected) });
        expect(
          JSON.parse((await recovery.execute()).content[0].text).verified,
        ).toBe(true);
        await deploy.execute("duplicate", { json: JSON.stringify(selected) });
      },
      waitForIdle: async () => {},
      dispose: vi.fn(),
      abort: vi.fn(),
    },
  }));
  await planDeployment(
    [
      {
        path: "Dockerfile",
        mode: 0o644,
        content: Buffer.from("FROM python:3.12"),
      },
    ],
    { repository: "qa/example", revision: "a".repeat(40) } as DeploymentRecord,
    new AbortController().signal,
    { apply, reconcile },
  );
  expect(apply).toHaveBeenCalledTimes(1);
  expect(reconcile).toHaveBeenCalledTimes(1);
});
