import { SessionManager } from "@earendil-works/pi-coding-agent";
import { eq } from "drizzle-orm";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
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
  root = mkdtempSync(join(tmpdir(), "haldur-native-sessions-"));
  vi.stubEnv("HALDUR_DB_PATH", join(root, "test.db"));
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
  globalThis.__haldurDb?.$client.close();
  delete globalThis.__haldurDb;
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
  delete globalThis.__haldurDb;
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

it("starts with empty native context instead of importing disposable SQLite chat text", async () => {
  store.insertMessage(chatId, "user", "Old chat text", "user");
  store.insertMessage(chatId, "assistant", "Old answer", "pi");
  const opened = await openNativeChatSession(applicationId, chatId);
  expect(opened.sessionManager.buildSessionContext().messages).toEqual([]);
  expect(opened.sessionManager.getEntries()).toEqual([]);
  opened.release();
  expect(store.listMessages(chatId)).toHaveLength(2);
});

it("does not duplicate the accepted user message from the first queued Run", async () => {
  const user = store.insertMessage(
    chatId,
    "user",
    "New accepted input",
    "user",
  );
  const answer = store.insertMessage(chatId, "assistant", "", "pi", "queued");
  store
    .db()
    .$client.prepare(
      "UPDATE messages SET response_to = ?, request_key = ? WHERE id = ?",
    )
    .run(user.id, "key", answer.id);
  const opened = await openNativeChatSession(applicationId, chatId);
  expect(opened.sessionManager.buildSessionContext().messages).toEqual([]);
  opened.release();
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
  "fails safely for an established %s file without recreating or modifying it",
  async (damage) => {
    const initial = await openNativeChatSession(applicationId, chatId);
    const originalId = initial.sessionManager.getSessionId();
    initial.release();
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

it("releases its lock after an association failure and adopts the initialized header on retry", async () => {
  store
    .db()
    .$client.exec(
      "CREATE TRIGGER reject_native_association BEFORE UPDATE OF native_session_id ON conversations BEGIN SELECT RAISE(ABORT, 'synthetic association failure'); END",
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
