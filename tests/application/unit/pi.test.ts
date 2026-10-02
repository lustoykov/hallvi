import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  agent: vi.fn(),
  configure: vi.fn(),
  workspace: vi.fn(),
  unavailable: vi.fn(),
  workspacePrompt: vi.fn(),
  main: vi.fn(),
  execute: vi.fn(),
  host: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
  provider: vi.fn(),
  publicKey: vi.fn(),
  connect: vi.fn(),
  tunnel: vi.fn(),
  capture: vi.fn(),
  propose: vi.fn(),
}));
vi.mock("../../../src/server/github-proposal", async (original) => ({
  ...(await original<object>()),
  proposeRepositoryChanges: mocks.propose,
}));
vi.mock("../../../src/server/hetzner", () => ({
  hetzner: mocks.provider,
  hetznerConnectionId: () => "configured",
}));
vi.mock("../../../src/server/private-access", () => ({
  openServerPort: mocks.tunnel,
}));
vi.mock("../../../src/server/server-access", () => ({
  serverPublicKey: mocks.publicKey,
  connectServer: mocks.connect,
}));
vi.mock("@earendil-works/pi-coding-agent", async (original) => ({
  ...Object.fromEntries(
    Object.entries(
      await original<typeof import("@earendil-works/pi-coding-agent")>(),
    ).filter(([name]) => /^create\w+ToolDefinition$/.test(name)),
  ),
  defineTool: <T>(tool: T) => tool,
}));
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-configuration")>()),
  configuredPiRuntime: mocks.configure,
}));
vi.mock("../../../src/server/pi-sessions", () => ({
  openConversation: mocks.open,
  NativeSessionError: class extends Error {},
}));
vi.mock("../../../src/server/operator-execution", () => ({
  isMainChat: mocks.main,
  executionContext: () => ({ execute: mocks.execute }),
  operatorSettings: () => ({
    permissionMode: "pi-decides",
    host: { address: "test-host" },
  }),
  runHostCommand: mocks.host,
  listExecutions: () => [],
}));
vi.mock("../../../src/server/pi-workspace", async (original) => ({
  ...(await original<typeof import("../../../src/server/pi-workspace")>()),
  PiWorkspace: class {
    path = "/workspace";
    execute = mocks.workspace;
    dispose = mocks.dispose;
    unavailable = mocks.unavailable;
    prompt = mocks.workspacePrompt;
    capture = mocks.capture;
  },
}));
import { openPiSession, describePiFailure } from "../../../src/server/pi";
import {
  listConnectionRequests,
  requestDomain,
  requestHost,
  settleHost,
} from "../../../src/server/connection-requests";
const scope = {
  applicationId: "6f1c2a3e-7b5d-4c8e-9a10-2b3c4d5e6f70",
  chatId: "chat-a",
  reply: () => "reply-a",
};
type RegisteredTool = {
  name: string;
  executionMode?: string;
  execute: (
    args: unknown,
    api: { callId: string },
    context: { abortSignal: AbortSignal | undefined },
  ) => Promise<unknown>;
};
/** What Pi was opened with: its model access, its tools and its settings. */
type Runtime = {
  models: unknown;
  settings: Record<string, unknown>;
  registry: {
    snapshot(): { tools(): { tool: RegisteredTool }[] };
  };
};
let config: string;
beforeEach(() => {
  config = mkdtempSync(join(tmpdir(), "hallvi-pi-tools-"));
  vi.stubEnv("HALLVI_CONFIG_DIR", config);
  vi.clearAllMocks();
  mocks.main.mockReturnValue(true);
  mocks.configure.mockResolvedValue({
    configuration: { reasoningEffort: "high" },
    model: { provider: "openai-codex", id: "gpt" },
    modelRuntime: { runtime: true },
  });
  mocks.open.mockResolvedValue({
    harness: {},
    conversation: { configure: mocks.agent },
    close: mocks.release,
  });
  mocks.unavailable.mockResolvedValue(null);
  mocks.workspace.mockResolvedValue({
    content: [{ type: "text", text: "file" }],
    details: {},
  });
  mocks.execute.mockImplementation(async (_tool, _target, _input, work) =>
    work(() => {}),
  );
  mocks.host.mockResolvedValue({ output: "Linux", exitCode: 0 });
  mocks.capture.mockResolvedValue({
    provenance: {
      repository: "qa/app",
      branch: "main",
      commitSha: "a",
      omitted: [],
    },
    files: new Map([
      ["Dockerfile", { content: Buffer.from("x"), executable: false }],
    ]),
  });
  mocks.propose.mockResolvedValue({ status: "opened" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(config, { recursive: true, force: true });
});
const runtime = () => mocks.open.mock.calls[0][1] as Runtime;
const tools = () =>
  runtime()
    .registry.snapshot()
    .tools()
    .map((each) => each.tool);
/** A tool as Pi calls it. */
const call = (name: string, id: string, args: unknown) =>
  tool(name).execute(args, { callId: id }, { abortSignal: undefined });
function tool(name: string) {
  return tools().find((item) => item.name === name)!;
}
it("executes host and workspace mutations through the permission boundary in the main native session", async () => {
  const { close } = await openPiSession(scope);
  await call("server_bash", "call", { command: "uname -s" });
  expect(mocks.host).toHaveBeenCalledWith(
    { address: "test-host" },
    "uname -s",
    undefined,
    expect.any(Function),
    undefined,
  );
  await call("write", "write", { path: "file", content: "hello" });
  expect(mocks.execute.mock.calls.map((call) => call[0])).toEqual([
    "server_bash",
    "write",
  ]);
  // Pi's own runtime is what it authenticates and compacts with, mutating
  // calls are never concurrent, and Hallvi's setup chooses the model.
  expect(runtime().models).toEqual({ runtime: true });
  expect(runtime().settings).toMatchObject({ toolExecution: "sequential" });
  expect(tools().every((each) => each.executionMode === "sequential")).toBe(
    true,
  );
  expect(mocks.agent).toHaveBeenCalledWith(
    {
      model: { provider: "openai-codex", modelId: "gpt" },
      thinkingLevel: "high",
    },
    expect.anything(),
  );
  // Pi's own argument shim for its edit tool passes through.
  expect(typeof tool("edit")).toBe("object");
  expect(
    (tool("edit") as unknown as { prepareArguments?: unknown })
      .prepareArguments,
  ).toBeTypeOf("function");
  // Opening starts nothing, and the workspace is kept until Pi has closed.
  expect(mocks.release).not.toHaveBeenCalled();
  await close();
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(mocks.release.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.dispose.mock.invocationCallOrder[0],
  );
});
it("side chats have no shell, approval or mutation tools", async () => {
  mocks.main.mockReturnValue(false);
  await openPiSession(scope);
  expect(tools().map((each) => each.name)).toEqual([
    "read",
    "grep",
    "find",
    "ls",
    "search_information",
    "read_traffic",
    "get_application_status",
  ]);
  await call("read", "read", { path: "README.md" });
  expect(mocks.workspace).toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("withdraws every workspace tool with its reason when the chosen Docker isolation is unavailable", async () => {
  const reason = "Docker isolation is selected, and Docker cannot be used.";
  mocks.unavailable.mockResolvedValue(reason);
  await openPiSession(scope);
  const names = tools().map((each) => each.name);
  for (const name of ["read", "write", "edit", "bash", "grep", "find", "ls"])
    expect(names).not.toContain(name);
  expect(names).toContain("server_bash");
  expect(mocks.workspacePrompt).toHaveBeenCalledWith(reason);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("a declined file mutation never reaches the workspace", async () => {
  mocks.execute.mockResolvedValue({ declined: true });
  await openPiSession(scope);
  expect(
    await call("write", "call", { path: "file", content: "hello" }),
  ).toMatchObject({ content: [{ text: '{"declined":true}' }] });
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("proposing a change to the repository goes through the permission boundary, and a decline never reaches GitHub", async () => {
  await openPiSession(scope);
  await call("open_pull_request", "call", {
    paths: ["Dockerfile"],
    branch: "Add Dockerfile!",
    title: "Add a Dockerfile",
    body: "why",
  });
  // The branch the owner is asked to approve is the branch that gets made.
  expect(mocks.execute).toHaveBeenCalledWith(
    "open_pull_request",
    "qa/app · hallvi/add-dockerfile",
    expect.objectContaining({ branch: "hallvi/add-dockerfile" }),
    expect.any(Function),
    false,
    "call",
    undefined,
  );
  expect(mocks.propose).toHaveBeenCalledOnce();

  mocks.execute.mockResolvedValue({ declined: true });
  expect(
    await call("open_pull_request", "declined", {
      paths: ["Dockerfile"],
      branch: "add-dockerfile",
      title: "Add a Dockerfile",
      body: "why",
    }),
  ).toMatchObject({ content: [{ text: '{"declined":true}' }] });
  expect(mocks.propose).toHaveBeenCalledOnce();
});
it("releases the workspace when the conversation cannot be opened, without leaking why", async () => {
  mocks.open.mockRejectedValue(new Error("Secret bearer token"));
  await expect(openPiSession(scope)).rejects.toThrow("could not reach");
  expect(mocks.dispose).toHaveBeenCalledOnce();
  expect(describePiFailure(new Error("Secret bearer token"))).not.toContain(
    "token",
  );
});

it("provider and connection tools use the same permission boundary, including decline", async () => {
  mocks.provider.mockResolvedValue({ server: { id: 123 } });
  mocks.publicKey.mockResolvedValue({ publicKey: "ssh-ed25519 public" });
  mocks.connect.mockResolvedValue({ sshVerified: true });
  await openPiSession(scope);
  await call("hetzner_request", "api", {
    method: "POST",
    path: "/servers",
    body: { name: "example", ssh_keys: [1] },
  });
  await call("server_public_key", "key", {});
  await call("connect_server", "connect", { serverId: 123 });
  expect(mocks.execute.mock.calls.map((call) => call[0])).toEqual([
    "hetzner_request",
    "server_public_key",
    "connect_server",
  ]);
  expect(mocks.provider).toHaveBeenCalledOnce();
  expect(mocks.publicKey).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
  mocks.execute.mockResolvedValue({ declined: true });
  await call("hetzner_request", "api", {
    method: "POST",
    path: "/servers",
    body: {},
  });
  await call("connect_server", "connect", { serverId: 456 });
  expect(mocks.provider).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it("closes only the obsolete host request after Pi connects, and keeps it after failure", async () => {
  const otherApplication = "7f1c2a3e-7b5d-4c8e-9a10-2b3c4d5e6f70";
  const request = {
    needs: "A Linux machine with Docker.",
    estimate: "Use an existing machine.",
    recommended: "machine" as const,
  };
  requestHost(scope.applicationId, request);
  requestDomain(scope.applicationId, "app.example.com");
  const before = listConnectionRequests(scope.applicationId);
  const other = requestHost(otherApplication, request);
  const { close } = await openPiSession(scope);
  try {
    mocks.connect.mockRejectedValueOnce(new Error("SSH was not verified."));
    // A failure is the tool's own words to the model, not a throw for Pi.
    expect(
      await call("connect_server", "failed-connect", { serverId: 123 }),
    ).toEqual({
      content: [{ type: "text", text: "SSH was not verified." }],
      isError: true,
      details: {},
    });
    expect(listConnectionRequests(scope.applicationId)).toEqual(before);

    mocks.connect.mockResolvedValueOnce({ sshVerified: true });
    await call("connect_server", "verified-connect", { serverId: 123 });
    expect(listConnectionRequests(scope.applicationId)).toEqual(
      before.filter((request) => request.kind === "domain"),
    );
    expect(listConnectionRequests(otherApplication)).toEqual([other]);

    requestHost(scope.applicationId, request);
    settleHost(scope.applicationId, {
      kind: "machine",
      user: "root",
      address: "test-host",
      os: "Linux",
    });
    const receipt = listConnectionRequests(scope.applicationId);
    mocks.connect.mockResolvedValueOnce({ sshVerified: true });
    await call("connect_server", "reconnect", { serverId: 123 });
    expect(listConnectionRequests(scope.applicationId)).toEqual(receipt);
  } finally {
    await close();
  }
});

it("opens private access through the permission boundary and honors decline", async () => {
  mocks.tunnel.mockResolvedValue({
    url: "http://127.0.0.1:8080",
    httpStatus: 200,
  });
  await openPiSession(scope);
  await call("open_server_port", "tunnel", { remotePort: 80 });
  expect(mocks.execute.mock.calls[0][0]).toBe("open_server_port");
  expect(mocks.tunnel).toHaveBeenCalledWith(
    scope.applicationId,
    { remotePort: 80 },
    undefined,
  );
  mocks.execute.mockResolvedValue({ declined: true });
  await call("open_server_port", "tunnel", { remotePort: 80 });
  expect(mocks.tunnel).toHaveBeenCalledOnce();
});
