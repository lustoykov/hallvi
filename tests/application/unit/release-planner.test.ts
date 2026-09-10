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
    { apply },
  );
  expect(result.command).toEqual(second.command);
  expect(apply).toHaveBeenCalledTimes(2);
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(seen).toHaveLength(3);
});
