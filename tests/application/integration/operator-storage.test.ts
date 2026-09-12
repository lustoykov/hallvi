import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import {
  createApplication,
  removeApplication,
} from "../../../src/server/applications";
import { getOperatorView } from "../../../src/server/operator-view";
import {
  sendChatMessage,
  claimNextPiRun,
  persistPiDraft,
  completePiRun,
  interruptRunningPiRuns,
  chatRunSnapshot,
} from "../../../src/server/pi-runs";
import {
  saveInformation,
  listInformation,
  retireInformation,
  attachMessageBlock,
} from "../../../src/server/saved-information";
import {
  saveOperatorSettings,
  operatorSettings,
} from "../../../src/server/operator-execution";
import { pushTestDatabase } from "../../test-database";
vi.mock("../../../src/server/github", async (original) => ({
  ...(await original<typeof import("../../../src/server/github")>()),
  inspectGithubRepository: async () => ({
    status: "passed",
    summary: "Repository checked",
    sourceUrl: null,
    raw: { repositoryId: 123 },
  }),
}));
let root: string;
let app: string;
let chat: string;
function reopen() {
  store.db().$client.close();
  delete globalThis.__serverGuyDb;
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "sg-storage-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "test.db"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.SERVER_GUY_DB_PATH!);
});
beforeEach(async () => {
  store.db().$client.exec("DELETE FROM applications");
  app = (
    await createApplication({ repositoryUrl: "https://github.com/example/app" })
  ).application.id;
  chat = store.listApplicationChats(app)[0].id;
});
afterAll(() => {
  reopen();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("loads creation, settings and the partial response after reopening the database", () => {
  expect(store.getApplication(app)?.repositoryId).toBe(123);
  expect(store.getChat(chat)?.kind).toBe("main");
  expect(operatorSettings(app).permissionMode).toBe("pi-decides");
  saveOperatorSettings(app, { permissionMode: "always-ask", host: null });
  const request = randomUUID();
  const accepted = sendChatMessage(
    app,
    chat,
    "Inspect this repository",
    request,
  );
  expect(
    sendChatMessage(app, chat, "Inspect this repository", request).run.id,
  ).toBe(accepted.run.id);
  const turn = claimNextPiRun()!;
  expect(claimNextPiRun()).toBeNull();
  expect(() =>
    sendChatMessage(app, chat, "Another task", randomUUID()),
  ).toThrow("still working");
  persistPiDraft(turn.id, "I’m inspecting the source.");
  reopen();
  expect(operatorSettings(app).permissionMode).toBe("always-ask");
  expect(store.getChat(chat)).toMatchObject({
    status: "working",
    currentResponseId: turn.id,
  });
  expect(chatRunSnapshot(app, chat).messages.at(-1)).toMatchObject({
    body: "I’m inspecting the source.",
    status: "running",
  });
  expect(completePiRun(turn.id, { message: "Inspection finished." })).toBe(
    true,
  );
  reopen();
  expect(store.getChat(chat)).toMatchObject({
    status: "idle",
    currentResponseId: null,
  });
  expect(store.getMessage(turn.id)?.status).toBe("completed");
});
it("shares one outcome between chat and two views while keeping working knowledge unsurfaced", () => {
  sendChatMessage(app, chat, "Inspect", randomUUID());
  const turn = claimNextPiRun()!;
  const hidden = saveInformation(app, {
    title: "Build note",
    body: "Use the repository lockfile.",
  });
  const record = saveInformation(app, {
    title: "Application verified",
    body: "HTTP check passed.",
    evidence: [{ type: "message", id: turn.userMessageId }],
    establishedAt: "2026-09-12T12:00:00.000Z",
    presentation: {
      views: ["overview", "deployment"],
      role: "outcome",
      status: "verified",
      url: "https://example.com",
      checks: [{ label: "HTTP responds", status: "passed" }],
    },
  });
  attachMessageBlock(app, turn.id, {
    type: "saved-information",
    id: record.id,
  });
  completePiRun(turn.id, { message: "Here is the result." });
  reopen();
  const view = getOperatorView(app, chat);
  expect(view.information?.map((r) => r.id)).toEqual([record.id]);
  expect(view.messages.at(-1)?.blocks).toEqual([
    { type: "saved-information", id: record.id },
  ]);
  expect(listInformation(app, "lockfile").map((r) => r.id)).toEqual([
    hidden.id,
  ]);
  saveInformation(app, { title: hidden.title, body: "Use npm ci." }, hidden.id);
  expect(listInformation(app, "npm ci")).toHaveLength(1);
  retireInformation(app, record.id);
  expect(listInformation(app).map((r) => r.id)).toEqual([hidden.id]);
  expect(getOperatorView(app, chat).information?.[0].retiredAt).toBeTruthy();
});
it("marks unfinished work interrupted on worker restart and cascades only application data on removal", () => {
  sendChatMessage(app, chat, "Inspect", randomUUID());
  const turn = claimNextPiRun()!;
  persistPiDraft(turn.id, "Started");
  reopen();
  interruptRunningPiRuns();
  expect(store.getChat(chat)?.status).toBe("interrupted");
  expect(store.getMessage(turn.id)).toMatchObject({
    status: "interrupted",
    body: "Started",
  });
  expect(claimNextPiRun()).toBeNull();
  saveInformation(app, { title: "Note", body: "Saved" });
  removeApplication(app, "example/app");
  for (const table of [
    "applications",
    "conversations",
    "messages",
    "saved_information",
  ])
    expect(
      store.db().$client.prepare(`SELECT count(*) AS n FROM ${table}`).get(),
    ).toEqual({ n: 0 });
});
