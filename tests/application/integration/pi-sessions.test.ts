import { SessionManager } from "@earendil-works/pi-coding-agent";
import { eq } from "drizzle-orm";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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
import { chats, chatSummaries } from "../../../src/server/db-schema";
import {
  NativeSessionError,
  openNativeChatSession,
  rebuildNativeChatSession,
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
  root = mkdtempSync(join(tmpdir(), "server-guy-native-sessions-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  pushTestDatabase(store.databasePath());
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  const application = store.insertApplication({
    name: "test",
    repositoryUrl: "https://github.com/qa/test",
    repositoryOwner: "qa",
    repositoryName: "test",
    environment: "production",
    approvalMode: "pi-decides",
    approvalScope: "test",
  });
  applicationId = application.id;
  const workspace = store.insertWorkspace(applicationId);
  chatId = store.insertChat(workspace.id, "Main", true).id;
  otherChatId = store.insertChat(workspace.id, "Other", false).id;
});
afterAll(() => {
  globalThis.__serverGuyDb?.$client.close();
  delete globalThis.__serverGuyDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

it("persists a private header and SQLite identity before any assistant message, then reopens across database restarts", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  const id = first.sessionManager.getSessionId();
  expect(association()).toBe(id);
  expect(
    JSON.parse(readFileSync(pathFor(), "utf8").split("\n")[0]),
  ).toMatchObject({ type: "session", id });
  expect(statSync(pathFor()).mode & 0o777).toBe(0o600);
  expect(statSync(dirname(pathFor())).mode & 0o777).toBe(0o700);
  expect(statSync(join(root, "pi-sessions")).mode & 0o777).toBe(0o700);
  first.sessionManager.appendMessage({
    role: "user",
    content: "Remember this native message",
    timestamp: Date.now(),
  });
  first.release();
  first.release();
  store.db().$client.close();
  delete globalThis.__serverGuyDb;
  const resumed = await openNativeChatSession(applicationId, chatId);
  expect(resumed.sessionManager.getSessionId()).toBe(id);
  expect(resumed.sessionManager.buildSessionContext().messages).toMatchObject([
    { role: "user", content: "Remember this native message" },
  ]);
  resumed.release();
  const separate = await openNativeChatSession(applicationId, otherChatId);
  expect(separate.sessionManager.getSessionId()).not.toBe(id);
  expect(separate.sessionManager.buildSessionContext().messages).toEqual([]);
  separate.release();
});

it("imports bounded completed legacy data once without fabricating native assistant/tool messages or deleting old summaries", async () => {
  const user = store.insertMessage(chatId, "user", "Original request", "user");
  store.insertMessage(chatId, "assistant", "Legacy saved answer", "pi");
  store.insertMessage(
    chatId,
    "assistant",
    "Failed partial output",
    "pi",
    "failed",
  );
  store
    .db()
    .insert(chatSummaries)
    .values({
      chatId,
      body: "Old summary ".repeat(2_000),
      coveredMessageId: user.id,
      updatedAt: "2026-09-05",
    })
    .run();
  const originalSummary = store.db().select().from(chatSummaries).get();
  for (let index = 0; index < 36; index++)
    store.insertMessage(
      chatId,
      "user",
      `Legacy ${index}: ${"x".repeat(1_000)}`,
      "user",
    );
  const first = await openNativeChatSession(applicationId, chatId);
  const imported = first.sessionManager
    .getEntries()
    .filter((entry) => entry.type === "custom_message");
  expect(imported).toHaveLength(1);
  expect(imported[0]).toMatchObject({
    customType: "server-guy-legacy-context",
    details: { truncated: true },
  });
  expect(String(imported[0].content)).toContain(
    "historical, user/model-authored data",
  );
  expect(String(imported[0].content).length).toBeLessThan(23_000);
  expect(String(imported[0].content)).not.toContain("Failed partial output");
  expect(
    first.sessionManager
      .getEntries()
      .filter((entry) => entry.type === "message"),
  ).toEqual([]);
  first.release();
  const bytes = readFileSync(pathFor(), "utf8");
  store.insertMessage(chatId, "user", "Added after import", "user");
  const second = await openNativeChatSession(applicationId, chatId);
  second.release();
  expect(readFileSync(pathFor(), "utf8")).toBe(bytes);
  expect(store.db().select().from(chatSummaries).get()).toEqual(
    originalSummary,
  );
  expect(store.listMessages(chatId)).toHaveLength(40);
});

it("does not duplicate the accepted user message from the first queued Run", async () => {
  const user = store.insertMessage(
    chatId,
    "user",
    "New accepted input",
    "user",
  );
  const answer = store.insertMessage(chatId, "assistant", "", "pi", "queued");
  const chat = store.getChat(chatId)!;
  store
    .db()
    .$client.prepare(
      "INSERT INTO pi_runs (id, application_id, workspace_id, chat_id, user_message_id, assistant_message_id, request_key, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      "queued-run",
      applicationId,
      chat.workspaceId,
      chatId,
      user.id,
      answer.id,
      "key",
      "queued",
      "2026-09-05",
    );
  const opened = await openNativeChatSession(applicationId, chatId);
  expect(opened.sessionManager.buildSessionContext().messages).toEqual([]);
  opened.release();
  await expect(
    rebuildNativeChatSession(applicationId, chatId),
  ).rejects.toMatchObject({ code: "busy" });
});

it("restores a native compaction entry and the surviving native message through the SDK", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  first.sessionManager.appendMessage({
    role: "user",
    content: "Old native message",
    timestamp: 1,
  });
  const kept = first.sessionManager.appendMessage({
    role: "user",
    content: "Recent native message",
    timestamp: 2,
  });
  const compaction = first.sessionManager.appendCompaction(
    "Native compacted context",
    kept,
    80_000,
  );
  first.release();
  const reopened = await openNativeChatSession(applicationId, chatId);
  expect(reopened.sessionManager.getEntry(compaction)).toMatchObject({
    type: "compaction",
    summary: "Native compacted context",
    firstKeptEntryId: kept,
  });
  const context = JSON.stringify(
    reopened.sessionManager.buildSessionContext().messages,
  );
  expect(context).toContain("Native compacted context");
  expect(context).toContain("Recent native message");
  expect(context).not.toContain("Old native message");
  reopened.release();
});

it.each([
  "empty",
  "missing",
  "mismatched",
  "malformed",
  "partial-tail",
  "unreadable",
])(
  "fails safely for an established %s file and preserves it for explicit rebuild",
  async (damage) => {
    const initial = await openNativeChatSession(applicationId, chatId);
    const originalId = initial.sessionManager.getSessionId();
    initial.release();
    const initialBytes = readFileSync(pathFor(), "utf8");
    if (damage === "empty") writeFileSync(pathFor(), "");
    if (damage === "missing") rmSync(pathFor());
    if (damage === "mismatched") {
      const lines = readFileSync(pathFor(), "utf8").split("\n");
      const header = JSON.parse(lines[0]);
      lines[0] = JSON.stringify({ ...header, id: "another-native-session" });
      writeFileSync(pathFor(), lines.join("\n"));
    }
    if (damage === "malformed") appendFileSync(pathFor(), "{bad-json}\n");
    if (damage === "partial-tail")
      appendFileSync(pathFor(), '{"type":"message","id":');
    if (damage === "unreadable") chmodSync(pathFor(), 0o200);
    // Read before permission removal on ordinary user accounts.
    const damaged =
      damage === "unreadable" || damage === "missing"
        ? null
        : readFileSync(pathFor(), "utf8");
    await expect(
      openNativeChatSession(applicationId, chatId),
    ).rejects.toMatchObject({ code: "history-unavailable" });
    expect(association()).toBe(originalId);
    if (damage !== "unreadable" && damage !== "missing")
      expect(readFileSync(pathFor(), "utf8")).toBe(damaged);
    const savedBytes =
      damage === "unreadable"
        ? initialBytes
        : existsSync(pathFor())
          ? readFileSync(pathFor(), "utf8")
          : null;
    await rebuildNativeChatSession(applicationId, chatId);
    expect(association()).not.toBe(originalId);
    expect(
      store.listActivity(store.getChat(chatId)!.workspaceId),
    ).toMatchObject([
      {
        kind: "chat-history-rebuilt",
        summary: "Conversation rebuilt from saved chat",
        detail: chatId,
      },
    ]);
    const preserved = readdirSync(dirname(pathFor())).filter((name) =>
      name.includes(".preserved-"),
    );
    expect(preserved).toHaveLength(damage === "missing" ? 0 : 1);
    if (savedBytes !== null)
      expect(readFileSync(join(dirname(pathFor()), preserved[0]), "utf8")).toBe(
        savedBytes,
      );
  },
);

it.each([false, true])(
  "recovers interrupted initial file creation (header already initialized: %s)",
  async (initialized) => {
    mkdirSync(dirname(pathFor()), { recursive: true, mode: 0o700 });
    writeFileSync(pathFor(), "", { mode: 0o600, flag: "wx" });
    const id = initialized
      ? SessionManager.open(
          pathFor(),
          dirname(pathFor()),
          process.cwd(),
        ).getSessionId()
      : undefined;
    expect(association()).toBeNull();
    const opened = await openNativeChatSession(applicationId, chatId);
    if (id) expect(opened.sessionManager.getSessionId()).toBe(id);
    expect(association()).toBe(opened.sessionManager.getSessionId());
    opened.release();
  },
);

it("completes interrupted legacy import after identity association, then never reimports", async () => {
  store.insertMessage(chatId, "user", "Legacy context to retain", "user");
  mkdirSync(dirname(pathFor()), { recursive: true, mode: 0o700 });
  writeFileSync(pathFor(), "", { mode: 0o600 });
  const initialized = SessionManager.open(
    pathFor(),
    dirname(pathFor()),
    process.cwd(),
  );
  store
    .db()
    .update(chats)
    .set({ nativeSessionId: initialized.getSessionId() })
    .where(eq(chats.id, chatId))
    .run();
  const opened = await openNativeChatSession(applicationId, chatId);
  expect(JSON.stringify(opened.sessionManager.getEntries())).toContain(
    "Legacy context to retain",
  );
  expect(opened.sessionManager.getSessionId()).toBe(initialized.getSessionId());
  opened.release();
  const reopened = await openNativeChatSession(applicationId, chatId);
  expect(
    reopened.sessionManager
      .getEntries()
      .filter((entry) => entry.type === "custom_message"),
  ).toHaveLength(1);
  reopened.release();
});

it("releases its lock after an association failure and adopts the initialized header on retry", async () => {
  store
    .db()
    .$client.exec(
      "CREATE TRIGGER reject_native_association BEFORE UPDATE OF native_session_id ON chats BEGIN SELECT RAISE(ABORT, 'synthetic association failure'); END",
    );
  try {
    await expect(
      openNativeChatSession(applicationId, chatId),
    ).rejects.toMatchObject({ code: "history-unavailable" });
    expect(association()).toBeNull();
  } finally {
    store.db().$client.exec("DROP TRIGGER reject_native_association");
  }
  const headerId = JSON.parse(
    readFileSync(pathFor(), "utf8").split("\n")[0],
  ).id;
  const reopened = await openNativeChatSession(applicationId, chatId);
  expect(reopened.sessionManager.getSessionId()).toBe(headerId);
  reopened.release();
});

it("does not adopt an unassociated file that already contains a native conversation", async () => {
  mkdirSync(dirname(pathFor()), { recursive: true, mode: 0o700 });
  writeFileSync(pathFor(), "", { mode: 0o600 });
  const other = SessionManager.open(
    pathFor(),
    dirname(pathFor()),
    process.cwd(),
  );
  other.appendMessage({
    role: "user",
    content: "Unknown native history",
    timestamp: 1,
  });
  const original = readFileSync(pathFor(), "utf8");
  await expect(
    openNativeChatSession(applicationId, chatId),
  ).rejects.toMatchObject({ code: "history-unavailable" });
  expect(association()).toBeNull();
  expect(readFileSync(pathFor(), "utf8")).toBe(original);
});

it("rolls back the association and success Activity together if recording rebuild completion fails", async () => {
  const initial = await openNativeChatSession(applicationId, chatId);
  const initialId = initial.sessionManager.getSessionId();
  initial.release();
  store
    .db()
    .$client.exec(
      "CREATE TRIGGER reject_rebuild_activity BEFORE INSERT ON activity_events BEGIN SELECT RAISE(ABORT, 'synthetic activity failure'); END",
    );
  try {
    await expect(
      rebuildNativeChatSession(applicationId, chatId),
    ).rejects.toMatchObject({ code: "history-unavailable" });
    expect(association()).toBe(initialId);
    expect(store.listActivity(store.getChat(chatId)!.workspaceId)).toEqual([]);
  } finally {
    store.db().$client.exec("DROP TRIGGER reject_rebuild_activity");
  }
  await rebuildNativeChatSession(applicationId, chatId);
  expect(association()).not.toBe(initialId);
  expect(store.listActivity(store.getChat(chatId)!.workspaceId)).toHaveLength(
    1,
  );
});

it("blocks a second writer, rebuild and removal until release, and retains lock files after removal", async () => {
  const first = await openNativeChatSession(applicationId, chatId);
  await expect(
    openNativeChatSession(applicationId, otherChatId),
  ).rejects.toMatchObject({ code: "busy" });
  await expect(
    rebuildNativeChatSession(applicationId, chatId),
  ).rejects.toMatchObject({ code: "busy" });
  const remove = vi.fn(() => store.deleteApplication(applicationId));
  expect(() => removeNativeApplicationSessions(applicationId, remove)).toThrow(
    NativeSessionError,
  );
  expect(remove).not.toHaveBeenCalled();
  first.release();
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
  initial.release();
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
    resumed.release();
  } finally {
    child.kill("SIGKILL");
  }
});
