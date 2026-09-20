import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  open: vi.fn(),
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
vi.mock("@earendil-works/pi-agent-core", () => ({
  AgentHarness: { create: mocks.create },
  BACKGROUND_CONTEXT: {},
}));
vi.mock("../../../src/server/pi-configuration", () => ({
  configuredPiRuntime: mocks.configure,
}));
vi.mock("../../../src/server/pi-sessions", () => ({
  openNativeChatSession: mocks.open,
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
const scope = {
  applicationId: "app-a",
  chatId: "chat-a",
  reply: () => "reply-a",
};
type RegisteredTool = {
  name: string;
  execute: (
    id: string,
    args: unknown,
    onUpdate: () => void,
    toolContext: undefined,
    invocation: object,
    context: { abortSignal: AbortSignal | undefined },
  ) => Promise<unknown>;
};
let harness: { close: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.main.mockReturnValue(true);
  mocks.configure.mockResolvedValue({
    configuration: { reasoningEffort: "high" },
    model: { provider: "openai-codex", id: "gpt" },
    modelRuntime: { runtime: true },
  });
  mocks.open.mockResolvedValue({ session: {}, release: mocks.release });
  harness = { close: vi.fn(async () => {}) };
  mocks.create.mockResolvedValue({
    harness: {
      ...harness,
      lane: async () => ({
        getModel: vi.fn(async () => undefined),
        setModel: vi.fn(),
        getThinkingLevel: vi.fn(async () => undefined),
        setThinkingLevel: vi.fn(),
        getActiveTools: vi.fn(async () => []),
        setActiveTools: vi.fn(),
      }),
    },
    open: [],
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
/** A tool as the harness calls it. */
const call = (name: string, id: string, args: unknown) =>
  tool(name).execute(
    id,
    args,
    () => {},
    undefined,
    {},
    {
      abortSignal: undefined,
    },
  );
function tool(name: string) {
  return (mocks.create.mock.calls[0][0].tools as RegisteredTool[]).find(
    (item) => item.name === name,
  )!;
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
  const composed = mocks.create.mock.calls[0][0];
  // Pi's own runtime is what the harness authenticates and compacts with, and
  // mutating calls are never concurrent.
  expect(composed.models).toEqual({ runtime: true });
  expect(composed).toMatchObject({
    toolExecution: "sequential",
    followUpMode: "one-at-a-time",
    steeringMode: "one-at-a-time",
  });
  // Pi's own argument shim for its edit tool passes through.
  expect(typeof tool("edit")).toBe("object");
  expect(
    (tool("edit") as unknown as { prepareArguments?: unknown })
      .prepareArguments,
  ).toBeTypeOf("function");
  // Opening starts nothing, and the history is held until Pi has closed.
  expect(mocks.release).not.toHaveBeenCalled();
  await close();
  expect(harness.close).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("side chats have no shell, approval or mutation tools", async () => {
  mocks.main.mockReturnValue(false);
  await openPiSession(scope);
  expect(mocks.create.mock.calls[0][0].activeToolNames).toEqual([
    "read",
    "grep",
    "find",
    "ls",
    "search_information",
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
  const names = mocks.create.mock.calls[0][0].activeToolNames as string[];
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
it("releases the history when the session cannot be opened, without leaking why", async () => {
  mocks.create.mockRejectedValue(new Error("Secret bearer token"));
  await expect(openPiSession(scope)).rejects.toThrow("could not reach");
  expect(mocks.release).toHaveBeenCalledOnce();
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

it("opens private access through the permission boundary and honors decline", async () => {
  mocks.tunnel.mockResolvedValue({
    url: "http://127.0.0.1:8080",
    httpStatus: 200,
  });
  await openPiSession(scope);
  await call("open_server_port", "tunnel", { remotePort: 80 });
  expect(mocks.execute.mock.calls[0][0]).toBe("open_server_port");
  expect(mocks.tunnel).toHaveBeenCalledWith(
    "app-a",
    { remotePort: 80 },
    undefined,
  );
  mocks.execute.mockResolvedValue({ declined: true });
  await call("open_server_port", "tunnel", { remotePort: 80 });
  expect(mocks.tunnel).toHaveBeenCalledOnce();
});
