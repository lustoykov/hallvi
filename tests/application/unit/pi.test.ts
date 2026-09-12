import { beforeEach, expect, it, vi } from "vitest";
import type { PiRun } from "../../../src/server/types";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  open: vi.fn(),
  configure: vi.fn(),
  workspace: vi.fn(),
  main: vi.fn(),
  execute: vi.fn(),
  host: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
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
    async reload() {}
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
    execute = mocks.workspace;
    dispose = mocks.dispose;
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
