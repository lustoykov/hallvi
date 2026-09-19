import { beforeEach, expect, it, vi } from "vitest";
import type { PiRun } from "../../../src/server/types";
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
  createAgentSession: mocks.create,
  defineTool: <T>(tool: T) => tool,
  DefaultResourceLoader: class {
    constructor(private options: { appendSystemPromptOverride: () => void }) {}
    async reload() {
      this.options.appendSystemPromptOverride();
    }
  },
  SettingsManager: { inMemory: () => ({}) },
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
  },
}));
import { askPi, describePiFailure } from "../../../src/server/pi";
const run = { id: "run-a", applicationId: "app-a", chatId: "chat-a" } as PiRun;
const input = { run, userMessage: "Inspect the server", runContext: "{}" };
type RegisteredTool = {
  name: string;
  execute: (id: string, args: unknown) => Promise<unknown>;
};
let session: {
  prompt: ReturnType<typeof vi.fn>;
  waitForIdle: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.main.mockReturnValue(true);
  mocks.configure.mockResolvedValue({
    configuration: { reasoningEffort: "high" },
    model: {},
    modelRuntime: {},
  });
  mocks.open.mockResolvedValue({
    sessionManager: { getSessionFile: () => "/tmp/test-session.jsonl" },
    release: mocks.release,
  });
  let listener: (event: unknown) => void;
  session = {
    prompt: vi.fn(async () =>
      listener({
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Checked." }],
          stopReason: "stop",
        },
      }),
    ),
    waitForIdle: vi.fn(async () => {}),
    dispose: vi.fn(),
    ...{
      subscribe: (callback: typeof listener) => {
        listener = callback;
        return () => {};
      },
      sendCustomMessage: vi.fn(async () => {}),
    },
  };
  mocks.create.mockResolvedValue({ session });
  mocks.unavailable.mockResolvedValue(null);
  mocks.workspace.mockResolvedValue({
    content: [{ type: "text", text: "file" }],
    details: {},
  });
  mocks.execute.mockImplementation(async (_tool, _target, _input, work) =>
    work(() => {}),
  );
  mocks.host.mockResolvedValue({ output: "Linux", exitCode: 0 });
});
function tool(name: string) {
  return (mocks.create.mock.calls[0][0].customTools as RegisteredTool[]).find(
    (item) => item.name === name,
  )!;
}
it("executes host and workspace mutations through the permission boundary in the main native session", async () => {
  expect(await askPi(input)).toMatchObject({
    message: "Checked.",
  });
  await tool("server_bash").execute("call", { command: "uname -s" });
  expect(mocks.host).toHaveBeenCalledWith(
    { address: "test-host" },
    "uname -s",
    undefined,
    expect.any(Function),
    undefined,
  );
  await tool("write").execute("write", { path: "file", content: "hello" });
  expect(mocks.execute.mock.calls.map((call) => call[0])).toEqual([
    "server_bash",
    "write",
  ]);
  const names = mocks.create.mock.calls[0][0].tools;
  expect(names).not.toContain("prepare_deployment");
  expect(names).not.toContain("prepare_release");
  expect(session.prompt).toHaveBeenCalledWith(
    input.userMessage,
    expect.anything(),
  );
  expect(session.waitForIdle).toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalledOnce();
});
it("side chats have no shell, approval or mutation tools", async () => {
  mocks.main.mockReturnValue(false);
  await askPi(input);
  expect(mocks.create.mock.calls[0][0].tools).toEqual([
    "read",
    "grep",
    "find",
    "ls",
    "search_information",
    "get_application_status",
  ]);
  await tool("read").execute("read", { path: "README.md" });
  expect(mocks.workspace).toHaveBeenCalled();
  expect(mocks.execute).not.toHaveBeenCalled();
});
it("withdraws every workspace tool with its reason when the chosen Docker isolation is unavailable", async () => {
  const reason = "Docker isolation is selected, and Docker cannot be used.";
  mocks.unavailable.mockResolvedValue(reason);
  await askPi(input);
  const names = mocks.create.mock.calls[0][0].tools as string[];
  for (const name of ["read", "write", "edit", "bash", "grep", "find", "ls"])
    expect(names).not.toContain(name);
  expect(names).toContain("server_bash");
  expect(mocks.workspacePrompt).toHaveBeenCalledWith(reason);
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("a declined file mutation never reaches the workspace", async () => {
  mocks.execute.mockResolvedValue({ declined: true });
  await askPi(input);
  expect(
    await tool("write").execute("call", { path: "file", content: "hello" }),
  ).toMatchObject({ content: [{ text: '{"declined":true}' }] });
  expect(mocks.workspace).not.toHaveBeenCalled();
});
it("does not treat an incomplete model turn as success and releases the session", async () => {
  session.prompt.mockResolvedValue(undefined);
  await expect(askPi(input)).rejects.toThrow("could not reach");
  expect(session.dispose).toHaveBeenCalledOnce();
  expect(mocks.release).toHaveBeenCalledOnce();
  expect(describePiFailure(new Error("Secret bearer token"))).not.toContain(
    "token",
  );
});

it("provider and connection tools use the same permission boundary, including decline", async () => {
  mocks.provider.mockResolvedValue({ server: { id: 123 } });
  mocks.publicKey.mockResolvedValue({ publicKey: "ssh-ed25519 public" });
  mocks.connect.mockResolvedValue({ sshVerified: true });
  await askPi(input);
  await tool("hetzner_request").execute("api", {
    method: "POST",
    path: "/servers",
    body: { name: "example", ssh_keys: [1] },
  });
  await tool("server_public_key").execute("key", {});
  await tool("connect_server").execute("connect", { serverId: 123 });
  expect(mocks.execute.mock.calls.map((call) => call[0])).toEqual([
    "hetzner_request",
    "server_public_key",
    "connect_server",
  ]);
  expect(mocks.provider).toHaveBeenCalledOnce();
  expect(mocks.publicKey).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
  mocks.execute.mockResolvedValue({ declined: true });
  await tool("hetzner_request").execute("api", {
    method: "POST",
    path: "/servers",
    body: {},
  });
  await tool("connect_server").execute("connect", { serverId: 456 });
  expect(mocks.provider).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it("opens private access through the permission boundary and honors decline", async () => {
  mocks.tunnel.mockResolvedValue({
    url: "http://127.0.0.1:8080",
    httpStatus: 200,
  });
  await askPi(input);
  await tool("open_server_port").execute("tunnel", { remotePort: 80 });
  expect(mocks.execute.mock.calls[0][0]).toBe("open_server_port");
  expect(mocks.tunnel).toHaveBeenCalledWith(
    "app-a",
    { remotePort: 80 },
    undefined,
  );
  mocks.execute.mockResolvedValue({ declined: true });
  await tool("open_server_port").execute("tunnel", { remotePort: 80 });
  expect(mocks.tunnel).toHaveBeenCalledOnce();
});
