import { BACKGROUND_CONTEXT as ctx } from "@earendil-works/chord/context";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import {
  hasConversation,
  openConversation,
  removeNativeSessions,
} from "../../../src/server/pi-sessions";
import { pushTestDatabase } from "../../test-database";

let root: string;
let applicationId: string;
let chatId: string;
let otherChatId: string;
const scope = (chat = chatId) => ({ applicationId, chatId: chat });
const directory = (chat = chatId) =>
  join(root, "pi-sessions", applicationId, chat);
const storePath = (chat = chatId) =>
  join(directory(chat), "conversation.sqlite");

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-native-sessions-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  pushTestDatabase(store.databasePath());
});
beforeEach(async () => {
  for (const application of await store.listApplications())
    await store.deleteApplication(application.id);
  const application = await store.insertApplication({
    name: "test",
    repositoryUrl: "https://github.com/qa/test",
    repositoryOwner: "qa",
    repositoryName: "test",
  });
  applicationId = application.id;
  chatId = (await store.insertChat(applicationId, "Main")).id;
  otherChatId = (await store.insertChat(applicationId, "Other")).id;
});
afterAll(async () => {
  await store.closeDatabase();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

/** Write something to a conversation without asking a model anything. */
async function note(text: string, chat = chatId) {
  const open = await openConversation(scope(chat));
  try {
    const written = await open.conversation.submit(
      { type: "write", entry: { kind: "test.note", data: text } },
      ctx,
    );
    await written.wait(ctx);
  } finally {
    await open.close();
  }
}
async function notes(chat = chatId) {
  const open = await openConversation(scope(chat));
  try {
    return (await open.read()).entries
      .filter((entry) => entry.kind === "test.note")
      .map((entry) => entry.data);
  } finally {
    await open.close();
  }
}
const fingerprint = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");

it("keeps one private store per conversation and reopens it across database restarts", async () => {
  expect(hasConversation(scope())).toBe(false);
  // While it is open, Pi's journal files are private too.
  const open = await openConversation(scope());
  await (
    await open.conversation.submit(
      { type: "write", entry: { kind: "test.note", data: "kept" } },
      ctx,
    )
  ).wait(ctx);
  for (const name of readdirSync(directory()))
    expect(statSync(join(directory(), name)).mode & 0o077).toBe(0);
  await open.close();

  expect(hasConversation(scope())).toBe(true);
  expect(readdirSync(directory())).toEqual(["conversation.sqlite"]);
  for (const path of [
    join(root, "pi-sessions"),
    join(root, "pi-sessions", applicationId),
    directory(),
  ])
    expect(statSync(path).mode & 0o777).toBe(0o700);
  await store.closeDatabase();
  expect(await notes()).toEqual(["kept"]);
  // A conversation's history never leaks into another's.
  expect(await notes(otherChatId)).toEqual([]);
});

it("reads what Pi holds without writing anything or setting anything going", async () => {
  await note("kept");
  const before = fingerprint(storePath());
  const open = await openConversation(scope());
  try {
    const read = await open.read();
    expect(read).toMatchObject({ live: {}, inbox: { items: [] }, tasks: 0 });
    expect((await open.harness.inspect(ctx)).scheduling).toBe("paused");
  } finally {
    await open.close();
  }
  expect(fingerprint(storePath())).toBe(before);
});

it("starts an earlier release's conversation empty and leaves its history where that release reads it", async () => {
  const earlier = [
    join(root, "pi-sessions", applicationId, `${chatId}.jsonl`),
    join(directory(), "--tmp--", "2026-09-20_abc.jsonl"),
  ];
  mkdirSync(join(directory(), "--tmp--"), { recursive: true });
  for (const path of earlier)
    writeFileSync(path, '{"v":4,"kind":"header","id":"abc"}\n', {
      mode: 0o600,
    });
  const before = earlier.map(fingerprint);

  expect(hasConversation(scope())).toBe(false);
  expect(await notes()).toEqual([]);
  await note("new");
  expect(await notes()).toEqual(["new"]);
  expect(earlier.map(fingerprint)).toEqual(before);
});

it("says a store it cannot open is unavailable, and leaves it as it is", async () => {
  mkdirSync(directory(), { recursive: true });
  writeFileSync(
    storePath(),
    "this is not a database, and is long enough to be read as one\n".repeat(
      200,
    ),
  );
  const damaged = fingerprint(storePath());
  await expect(openConversation(scope())).rejects.toMatchObject({
    code: "history-unavailable",
  });
  expect(fingerprint(storePath())).toBe(damaged);

  // A link is never followed out of the conversation's own directory.
  mkdirSync(directory(otherChatId), { recursive: true });
  symlinkSync(join(root, "elsewhere.sqlite"), storePath(otherChatId));
  await expect(openConversation(scope(otherChatId))).rejects.toMatchObject({
    code: "history-unavailable",
  });
  expect(existsSync(join(root, "elsewhere.sqlite"))).toBe(false);
});

it("removes every history an application has", async () => {
  await note("kept");
  expect(existsSync(join(root, "pi-sessions", applicationId))).toBe(true);
  removeNativeSessions(applicationId);
  expect(existsSync(join(root, "pi-sessions", applicationId))).toBe(false);
  expect(hasConversation(scope())).toBe(false);
});

it("rejects cross-application identity and path traversal before creating storage", async () => {
  await expect(
    openConversation({ applicationId: "wrong-app", chatId }),
  ).rejects.toMatchObject({ code: "not-found" });
  await expect(
    openConversation({ applicationId, chatId: "../escape" }),
  ).rejects.toMatchObject({ code: "not-found" });
  expect(existsSync(join(root, "pi-sessions", applicationId))).toBe(false);
});
