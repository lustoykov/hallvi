import {
  AgentHarness,
  BACKGROUND_CONTEXT,
} from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { eq } from "drizzle-orm";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import { chats } from "../../../src/server/db-schema";
import {
  NativeSessionError,
  openNativeChatSession,
  removeNativeApplicationSessions,
} from "../../../src/server/pi-sessions";
import { pushTestDatabase } from "../../test-database";

let root: string;
let applicationId: string;
let chatId: string;
let otherChatId: string;
const pathFor = (chat = chatId) =>
  join(root, "pi-sessions", applicationId, `${chat}.jsonl`);
const association = () =>
  store.db().select().from(chats).where(eq(chats.id, chatId)).get()!
    .nativeSessionId;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-native-sessions-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  pushTestDatabase(store.databasePath());
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  const application = store.insertApplication({
    name: "test",
    repositoryUrl: "https://github.com/qa/test",
    repositoryOwner: "qa",
    repositoryName: "test",
  });
  applicationId = application.id;
  chatId = store.insertChat(applicationId, "Main").id;
  otherChatId = store.insertChat(applicationId, "Other").id;
});
afterAll(() => {
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** Pi's own history files for one conversation, wherever Pi put them. */
const historyFiles = (chat = chatId) => {
  const directory = join(root, "pi-sessions", applicationId, chat);
  return existsSync(directory)
    ? (readdirSync(directory, { recursive: true }) as string[])
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => join(directory, name))
    : [];
};
const ctx = BACKGROUND_CONTEXT;

it("keeps one private history per conversation, tied to its chat, and reopens it across database restarts", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  const id = first.session.metadata.id;
  await first.release();
  expect(association()).toBe(id);
  const [file] = historyFiles();
  expect(statSync(file).mode & 0o077).toBe(0);
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  const reopened = await openNativeChatSession(applicationId, chatId);
  expect(reopened.session.metadata.id).toBe(id);
  await reopened.release();
  expect(historyFiles()).toEqual([file]);
  // A conversation's history never leaks into another's.
  const other = await openNativeChatSession(applicationId, otherChatId);
  expect(other.session.metadata.id).not.toBe(id);
  await other.release();
});

it("reports a missing established history instead of silently starting a new one", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  await first.release();
  rmSync(join(root, "pi-sessions", applicationId, chatId), {
    recursive: true,
  });
  await expect(
    openNativeChatSession(applicationId, chatId),
  ).rejects.toMatchObject({ code: "history-unavailable" });
  expect(historyFiles()).toEqual([]);
  // The failed open let go of the application again.
  const other = await openNativeChatSession(applicationId, otherChatId);
  await other.release();
});

it("opens a history written before the upgrade through Pi's own repository, and leaves the original for rollback", async () => {
  // A representative earlier history, written by the session manager the
  // earlier version used: a tool call and its result, a compaction, more talk.
  mkdirSync(dirname(pathFor()), { recursive: true });
  writeFileSync(pathFor(), "", { mode: 0o600 });
  const earlier = SessionManager.open(pathFor(), dirname(pathFor()), root);
  const assistant = (content: unknown[], stopReason = "stop") =>
    ({
      role: "assistant",
      api: "openai-codex-responses",
      provider: "openai-codex",
      model: "gpt-5.6-sol",
      content,
      stopReason,
      timestamp: 2,
      usage: {
        input: 10,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 11,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    }) as never;
  earlier.appendMessage({ role: "user", content: "Deploy it", timestamp: 1 });
  earlier.appendMessage(
    assistant(
      [{ type: "toolCall", id: "call-1", name: "server_bash", arguments: {} }],
      "toolUse",
    ),
  );
  earlier.appendMessage({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: "server_bash",
    content: [{ type: "text", text: "container started" }],
    isError: false,
    timestamp: 3,
  } as never);
  const kept = earlier.appendMessage({
    role: "user",
    content: "Is it up?",
    timestamp: 4,
  });
  earlier.appendCompaction("Deployed the application.", kept, 1_000);
  earlier.appendMessage(assistant([{ type: "text", text: "It is up." }]));
  store
    .db()
    .update(chats)
    .set({ nativeSessionId: earlier.getSessionId() })
    .where(eq(chats.id, chatId))
    .run();
  const original = readFileSync(pathFor());

  const opened = await openNativeChatSession(applicationId, chatId);
  expect(opened.session.metadata.id).toBe(earlier.getSessionId());
  const { harness } = await AgentHarness.create(
    {
      session: opened.session,
      models: createModels(),
      model: { provider: "none", id: "none" } as never,
      systemPrompt: "x",
      tools: [],
    },
    ctx,
  );
  const lane = await harness.lane("main", ctx);
  const entries = await lane.findEntries(undefined, ctx);
  expect(entries.map((entry) => entry.type).sort()).toEqual([
    "compaction",
    "message",
    "message",
    "message",
    "message",
    "message",
  ]);
  expect(JSON.stringify(entries)).toContain("container started");
  // Writing through Pi turns its copy into Pi's current format.
  await lane.appendCustomEntry("hallvi-upgrade-check", undefined, ctx);
  await harness.close(ctx);
  await opened.release();
  const [imported] = historyFiles();
  expect(
    JSON.parse(readFileSync(imported, "utf8").split("\n")[0]),
  ).toMatchObject({ v: 4, id: earlier.getSessionId() });
  // The original is byte for byte what it was: the earlier version still
  // reads it, and removing the conversation's directory is the rollback.
  expect(readFileSync(pathFor()).equals(original)).toBe(true);
  expect(
    SessionManager.open(pathFor(), dirname(pathFor()), root).getEntries(),
  ).toHaveLength(6);
  // A second open uses Pi's copy and does not import again.
  const again = await openNativeChatSession(applicationId, chatId);
  expect(await again.session.findEntries(undefined, ctx)).toHaveLength(7);
  await again.release();
  expect(historyFiles()).toEqual([imported]);
});

it("refuses a damaged earlier history rather than half-reading it", async () => {
  mkdirSync(dirname(pathFor()), { recursive: true });
  writeFileSync(
    pathFor(),
    '{"type":"session","version":3,"id":"s","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/"}\n{"type":"message","id":"a"\n',
    { mode: 0o600 },
  );
  await expect(
    openNativeChatSession(applicationId, chatId),
  ).rejects.toMatchObject({ code: "history-unavailable" });
  expect(historyFiles()).toEqual([]);
});

it("blocks a second writer and removal until release, and retains lock files after removal", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  await expect(
    openNativeChatSession(applicationId, otherChatId),
  ).rejects.toMatchObject({ code: "busy" });
  const remove = vi.fn(() => store.deleteApplication(applicationId));
  expect(() => removeNativeApplicationSessions(applicationId, remove)).toThrow(
    NativeSessionError,
  );
  expect(remove).not.toHaveBeenCalled();
  await first.release();
  removeNativeApplicationSessions(applicationId, remove);
  expect(remove).toHaveBeenCalledOnce();
  expect(store.getApplication(applicationId)).toBeNull();
  expect(existsSync(dirname(pathFor()))).toBe(false);
  expect(
    existsSync(join(root, "pi-sessions", ".locks", `${applicationId}.sqlite`)),
  ).toBe(true);
});

it("rejects cross-application identity and path traversal before creating session storage", async () => {
  await expect(
    openNativeChatSession("wrong-app", chatId),
  ).rejects.toMatchObject({ code: "not-found" });
  await expect(
    openNativeChatSession(applicationId, "../escape"),
  ).rejects.toMatchObject({ code: "not-found" });
  expect(existsSync(dirname(pathFor()))).toBe(false);
});

it("the OS releases an abandoned application lock when its worker exits", async () => {
  const initial = await openNativeChatSession(applicationId, chatId);
  await initial.release();
  const lockPath = join(
    root,
    "pi-sessions",
    ".locks",
    `${applicationId}.sqlite`,
  );
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import Database from 'better-sqlite3'; const lock = new Database(process.argv[1],{timeout:0}); lock.exec('BEGIN EXCLUSIVE'); process.stdout.write('locked'); setInterval(() => lock.inTransaction, 1000);`,
      lockPath,
    ],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  try {
    const [ready] = await once(child.stdout, "data");
    expect(String(ready)).toBe("locked");
    await expect(
      openNativeChatSession(applicationId, chatId),
    ).rejects.toMatchObject({ code: "busy" });
    const exited = once(child, "exit");
    child.kill("SIGKILL");
    await exited;
    const resumed = await openNativeChatSession(applicationId, chatId);
    await resumed.release();
  } finally {
    child.kill("SIGKILL");
  }
});
