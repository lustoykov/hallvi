import { expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import type { NativeConfiguration } from "../../../src/server/deployment-release";
const mock = vi.hoisted(() => ({
  create: vi.fn(),
  workspace: vi.fn(),
  execute: vi.fn(),
  exportFiles: vi.fn(),
  dispose: vi.fn(),
}));
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
vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  // Pi's own native tool schemas and descriptions; execution is replaced.
  ...Object.fromEntries(
    Object.entries(
      await original<typeof import("@earendil-works/pi-coding-agent")>(),
    ).filter(([name]) => /^create\w+ToolDefinition$/.test(name)),
  ),
  defineTool: (tool: unknown) => tool,
  createAgentSession: mock.create,
  SettingsManager: { inMemory: () => ({}) },
  SessionManager: { inMemory: () => ({}) },
  DefaultResourceLoader: class {
    async reload() {}
  },
}));
// The planning workspace executes in Docker; tests observe what reaches it.
vi.mock("../../../src/server/pi-workspace", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-workspace")>()),
  PiWorkspace: class {
    constructor(options: unknown) {
      mock.workspace(options);
    }
    execute = mock.execute;
    exportFiles = mock.exportFiles;
    dispose = mock.dispose;
  },
}));
import {
  planDeployment,
  planRelease,
} from "../../../src/server/deployment-planner";
import { PI_BUILTIN_TOOLS } from "../../../src/server/pi-workspace";
import { NativeConfigurationError } from "../../../src/server/native-compose";
import { callNativeToolsThroughSdk } from "../fixtures/native-tools";

const selection = {
  compose: ["./compose.yaml"],
  summary: "Release the corrected worker entry point",
};
const source = { paths: ["compose.yaml"], read: async () => "" };
const session = (prompt: () => Promise<void>) => ({
  session: {
    prompt,
    waitForIdle: async () => {},
    dispose: vi.fn(),
    abort: vi.fn(),
  },
});
type Tool = {
  name: string;
  execute: (...args: unknown[]) => Promise<{ content: { text: string }[] }>;
};
const tool = (options: { customTools: Tool[] }, name: string) =>
  options.customTools.find((t) => t.name === name)!;

it("returns selection, execution and inspection feedback to the same Pi session, which corrects and resubmits", async () => {
  const seen: unknown[] = [];
  const files = [
    { path: "compose.yaml", mode: 0o644, content: Buffer.from("services: {}") },
  ];
  mock.exportFiles.mockReset().mockResolvedValue(files);
  const apply = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      kind: "replace",
      retryable: true,
      message: "python: can't open file wrong.py",
    })
    .mockResolvedValueOnce({ ok: true, message: "Verified" });
  mock.create.mockImplementation(async (options) =>
    session(async () => {
      const send = async (args: unknown) => {
        const result = await tool(options, "deploy_release").execute(
          "call",
          args,
        );
        const feedback = JSON.parse(result.content[0].text);
        seen.push(feedback);
        return feedback;
      };
      // A path outside the workspace is refused before any file is read.
      expect(
        await send({ ...selection, compose: ["../compose.yaml"] }),
      ).toMatchObject({
        ok: false,
        retryable: true,
      });
      expect(mock.exportFiles).not.toHaveBeenCalled();
      expect((await send(selection)).message).toContain("wrong.py");
      expect(
        (await tool(options, "inspect_release").execute()).content[0].text,
      ).toContain("wrong.py");
      expect((await send(selection)).ok).toBe(true);
      // A repeated call after success cannot redeploy.
      await tool(options, "deploy_release").execute("call", selection);
    }),
  );
  await planRelease(
    source,
    { repository: "qa/example", requirements: "Update" } as DeploymentRecord,
    new AbortController().signal,
    {
      revision: "a".repeat(40),
      context: "",
      workspaceFiles: [],
      apply,
      inspect: async () => ({ evidence: "Container exited: wrong.py missing" }),
      reconcile: vi.fn(),
    },
  );
  expect(apply).toHaveBeenCalledTimes(2);
  // The exact exported bytes and normalized Compose order reach execution.
  expect(apply.mock.calls[0][0].compose).toEqual(["compose.yaml"]);
  expect(apply.mock.calls[0][1]).toBe(files);
  expect(mock.exportFiles).toHaveBeenCalledWith(
    ["compose.yaml"],
    expect.any(Number),
  );
  expect(mock.create).toHaveBeenCalledTimes(1);
  expect(seen).toHaveLength(3);
});

it("accepts a completed reconciliation without another deploy tool call", async () => {
  mock.exportFiles.mockReset().mockResolvedValue([]);
  const apply = vi.fn().mockResolvedValue({
    ok: false,
    kind: "transport",
    retryable: false,
    message: "Lost reply",
  });
  const reconcile = vi.fn().mockResolvedValue({
    ok: true,
    completed: true,
    message: "Verified existing containers",
  });
  mock.create.mockImplementation(async (options) =>
    session(async () => {
      await tool(options, "deploy_release").execute("deploy", selection);
      const recovered = await tool(options, "reconcile_release").execute();
      expect(JSON.parse(recovered.content[0].text).completed).toBe(true);
      await tool(options, "deploy_release").execute("duplicate", selection);
    }),
  );
  await planRelease(
    source,
    { repository: "qa/example" } as DeploymentRecord,
    new AbortController().signal,
    {
      revision: "a".repeat(40),
      context: "",
      workspaceFiles: [],
      apply,
      inspect: vi.fn(),
      reconcile,
    },
  );
  expect(apply).toHaveBeenCalledTimes(1);
  expect(reconcile).toHaveBeenCalledTimes(1);
});

it("prepares a first deployment natively: Pi's exported files resolve into the recommendation, with feedback until they do", async () => {
  const files = [
    {
      path: "Dockerfile",
      mode: 0o644,
      content: Buffer.from("FROM python:3.12"),
    },
  ];
  const answer = {
    content: [{ type: "text", text: "workspace result" }],
    details: {},
  };
  mock.workspace.mockClear();
  mock.dispose.mockClear();
  mock.execute.mockReset().mockResolvedValue(answer);
  const exported = [
    { path: "compose.yaml", mode: 0o644, content: Buffer.from("services: {}") },
  ];
  mock.exportFiles.mockReset().mockResolvedValue(exported);
  const native = { summary: "Resolved native release" } as NativeConfiguration;
  const recommend = vi
    .fn()
    .mockRejectedValueOnce(
      new NativeConfigurationError(
        "Include criterion: checks that prove useful behavior.",
      ),
    )
    .mockResolvedValueOnce(native);
  const selection = {
    compose: ["./compose.yaml"],
    criterion: "{}",
    httpAccess: "public",
    summary: "A web service with its managed database",
  };
  let nativeTools:
    Awaited<ReturnType<typeof callNativeToolsThroughSdk>> | undefined;
  const replies: string[] = [];
  mock.create.mockImplementation(async (options) =>
    session(async () => {
      nativeTools = await callNativeToolsThroughSdk(options);
      const recommendation = tool(options, "recommend_deployment");
      for (let attempt = 0; attempt < 3; attempt++)
        replies.push(
          (await recommendation.execute("call", selection)).content[0].text,
        );
    }),
  );
  const revision = "a".repeat(40);
  const record = {
    id: "deployment-a",
    applicationId: "app-a",
    operationId: "operation-a",
    repository: "qa/example",
    revision,
  } as DeploymentRecord;
  await expect(
    planDeployment(files, record, new AbortController().signal, {
      recommend,
    }),
  ).resolves.toBe(native);
  expect(mock.execute.mock.calls.map(([name]) => name)).toEqual([
    ...PI_BUILTIN_TOOLS,
  ]);
  expect(Object.values(nativeTools!.results)).toEqual(
    PI_BUILTIN_TOOLS.map(() => answer),
  );
  expect(nativeTools!.controllerFiles).toEqual([]);
  // Resolution errors return to Pi; one success completes the session.
  expect(JSON.parse(replies[0])).toMatchObject({
    ok: false,
    kind: "configuration",
    retryable: true,
  });
  expect(JSON.parse(replies[0]).message).toContain("Include criterion");
  expect(JSON.parse(replies[1])).toMatchObject({ ok: true });
  expect(replies[2]).toContain("Already completed");
  expect(recommend).toHaveBeenCalledTimes(2);
  // The exact exported bytes and the normalized Compose paths are resolved.
  expect(recommend.mock.calls[0][0]).toMatchObject({
    compose: ["compose.yaml"],
    httpAccess: "public",
  });
  expect(recommend.mock.calls[0][1]).toBe(exported);
  expect(mock.exportFiles).toHaveBeenCalledWith(
    ["compose.yaml"],
    expect.any(Number),
  );
  const [workspace] = mock.workspace.mock.calls[0];
  expect(workspace).toMatchObject({
    applicationId: "app-a",
    runId: "operation-a",
  });
  // Pi explores exactly the tree being planned.
  await expect(workspace.source()).resolves.toEqual({
    description: `qa/example@${revision}`,
    files,
  });
  expect(mock.dispose).toHaveBeenCalledOnce();
});
