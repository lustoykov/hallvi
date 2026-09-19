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
  messageSeen,
  messageAdmitted,
  writeReply,
  settleConversation,
  stopConversation,
  waitingMessages,
  interruptConversations,
  chatSnapshot,
} from "../../../src/server/pi-conversation";
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
  delete globalThis.__hallviDb;
}
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-storage-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
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
/** What the worker records when Pi reads a message: a reply opens under it. */
function read(id: string) {
  return messageSeen(id)!;
}
const waitingIds = () => waitingMessages().map(({ message }) => message.id);

it("loads creation, settings and the partial reply after reopening the database", () => {
  expect(store.getApplication(app)?.repositoryId).toBe(123);
  expect(store.getChat(chat)?.kind).toBe("main");
  expect(operatorSettings(app).permissionMode).toBe("pi-decides");
  saveOperatorSettings(app, { permissionMode: "always-ask", host: null });
  const request = randomUUID();
  const sent = sendChatMessage(app, chat, "Inspect this repository", request);
  expect(
    sendChatMessage(app, chat, "Inspect this repository", request).id,
  ).toBe(sent.id);
  expect(sent.status).toBe("waiting");
  expect(store.getChat(chat)?.status).toBe("working");
  const reply = read(sent.id);
  writeReply(reply.id, "I’m inspecting the source.");
  reopen();
  expect(operatorSettings(app).permissionMode).toBe("always-ask");
  expect(store.getChat(chat)?.status).toBe("working");
  expect(
    chatSnapshot(app, chat)
      .messages.slice(-2)
      .map((m) => m.status),
  ).toEqual(["delivered", "running"]);
  expect(chatSnapshot(app, chat).messages.at(-1)).toMatchObject({
    body: "I’m inspecting the source.",
    responseTo: sent.id,
  });
  writeReply(reply.id, "Inspection finished.");
  settleConversation(chat, "completed");
  reopen();
  expect(store.getChat(chat)?.status).toBe("idle");
  expect(store.getMessage(reply.id)).toMatchObject({
    status: "completed",
    body: "Inspection finished.",
  });
});
it("keeps what waits across an interruption without replaying interrupted work", () => {
  // The transcript is ordered by when things happened, so time has to pass.
  vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
  const messageSeen = (...args: Parameters<typeof read>) => {
    vi.advanceTimersByTime(1_000);
    return read(...args);
  };
  const first = sendChatMessage(app, chat, "First task", randomUUID());
  const running = messageSeen(first.id);
  const second = sendChatMessage(app, chat, "Second task", randomUUID());
  const third = sendChatMessage(app, chat, "Third task", randomUUID(), "steer");
  expect(waitingIds()).toEqual([second.id, third.id]);

  interruptConversations();
  expect(store.getMessage(running.id)?.status).toBe("interrupted");
  expect(store.getChat(chat)?.status).toBe("interrupted");
  // Pi never read these. They still wait, in order, as the owner sent them.
  expect(waitingIds()).toEqual([second.id, third.id]);
  expect(store.getMessage(third.id)?.delivery).toBe("steer");

  // Read in turn, each closes what Pi wrote before it and opens its own.
  const resumed = messageSeen(second.id);
  expect(store.getChat(chat)?.status).toBe("working");
  const last = messageSeen(third.id);
  expect(store.getMessage(resumed.id)?.status).toBe("completed");
  expect(
    chatSnapshot(app, chat)
      .messages.slice(-6)
      .map((m) => m.id),
  ).toEqual([first.id, running.id, second.id, resumed.id, third.id, last.id]);
});

it("Stop settles what waits as never started, and nothing delivers it later", () => {
  const active = sendChatMessage(app, chat, "Active task", randomUUID());
  const reply = read(active.id);
  const followUp = sendChatMessage(
    app,
    chat,
    "Use that result next",
    randomUUID(),
  );

  stopConversation(app, chat);

  expect(store.getMessage(reply.id)?.status).toBe("cancelled");
  expect(store.getMessage(followUp.id)).toMatchObject({
    status: "cancelled",
    body: "Use that result next",
    error: "Not started because the conversation was stopped.",
  });
  expect(store.getChat(chat)?.status).toBe("idle");
  expect(waitingIds()).toEqual([]);
  // Pi was already reading it as Stop landed: it is refused, not run.
  expect(messageSeen(followUp.id)).toBeNull();
  expect(store.getMessage(followUp.id)?.status).toBe("cancelled");
  // Nor does a restart find anything to pick up.
  interruptConversations();
  expect(waitingIds()).toEqual([]);
  expect(store.getChat(chat)?.status).toBe("idle");
});
it("never routes again what Pi has acknowledged taking, across an interruption", () => {
  const first = sendChatMessage(app, chat, "Deploy the app", randomUUID());
  read(first.id);
  const held = sendChatMessage(app, chat, "Then publish it", randomUUID());
  const unsent = sendChatMessage(app, chat, "And tidy up", randomUUID());
  // The acknowledgment: Pi took it, and named the entry it keeps it under.
  messageAdmitted(held.id, "entry-7");
  expect(waitingIds()).toEqual([unsent.id]);

  interruptConversations();

  // Both still wait where the owner can see them. Only the one Hallvi still
  // holds is Hallvi's to hand over; the other is restored by Pi, same id.
  expect(store.getChat(chat)?.status).toBe("interrupted");
  expect(store.getMessage(held.id)).toMatchObject({
    status: "waiting",
    nativeEntryId: "entry-7",
  });
  expect(waitingIds()).toEqual([unsent.id]);
  // Stop settles all of it, the interrupted reply included, so the worker
  // ends Pi's operation instead of resuming it.
  stopConversation(app, chat);
  expect(
    chatSnapshot(app, chat)
      .messages.slice(-4)
      .map((m) => m.status),
  ).toEqual(["delivered", "cancelled", "cancelled", "cancelled"]);
  expect(waitingIds()).toEqual([]);
});
it("shares one outcome between chat and two views while keeping working knowledge unsurfaced", () => {
  const asked = sendChatMessage(app, chat, "Inspect", randomUUID());
  const turn = read(asked.id);
  const hidden = saveInformation(app, {
    title: "Build note",
    body: "Use the repository lockfile.",
  });
  const record = saveInformation(app, {
    title: "Application verified",
    body: "HTTP check passed.",
    evidence: [{ type: "message", id: asked.id }],
    establishedAt: "2026-09-12T12:00:00.000Z",
    presentation: {
      views: ["overview", "deployment"],
      role: "outcome",
      status: "verified",
      url: "https://example.com",
      checks: [
        {
          key: "http",
          label: "HTTP responds",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "application", id: "qa-app" },
        },
      ],
    },
  });
  attachMessageBlock(app, turn.id, {
    type: "saved-information",
    id: record.id,
  });
  writeReply(turn.id, "Here is the result.");
  settleConversation(chat, "completed");
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
  const turn = read(sendChatMessage(app, chat, "Inspect", randomUUID()).id);
  writeReply(turn.id, "Started");
  reopen();
  interruptConversations();
  expect(store.getChat(chat)?.status).toBe("interrupted");
  expect(store.getMessage(turn.id)).toMatchObject({
    status: "interrupted",
    body: "Started",
  });
  expect(waitingIds()).toEqual([]);
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

it("persists typed deployment/access facts and shares edits without duplicating records", () => {
  const deployment = saveInformation(app, {
    title: "Application deployed",
    body: "The deployment is recorded.",
    presentation: {
      checks: [
        {
          key: "http",
          label: "HTTP responded",
          status: "passed",
          claim: "reachability",
          basis: "observed",
          about: { kind: "application", id: "qa-app" },
        },
      ],
      views: ["overview", "deployment"],
      role: "outcome",
      content: {
        kind: "deployment",
        repositoryUrl: "https://github.com/qa/app",
        revision: "abcdef0123456789",
        image: "app:candidate",
        server: "fixture-server",
        changes: ["Added container packaging"],
      },
    },
  })!;
  const access = saveInformation(app, {
    title: "Private access ready",
    body: "Open on the controller PC.",
    presentation: {
      views: ["overview", "deployment"],
      role: "status",
      url: "http://127.0.0.1:8080",
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 8080,
        remotePort: 80,
      },
    },
  })!;
  expect(
    listInformation(app).find((r) => r.id === deployment.id)?.presentation
      ?.content,
  ).toMatchObject({ kind: "deployment", image: "app:candidate" });
  // What the check was about survives the round trip, which is what places
  // it on a lane; `subject` used to carry this and named a column instead.
  expect(
    listInformation(app).find((r) => r.id === deployment.id)?.presentation
      ?.checks[0].about,
  ).toEqual({ kind: "application", id: "qa-app" });
  saveInformation(
    app,
    {
      ...access,
      presentation: {
        ...access.presentation!,
        url: "http://127.0.0.1:8081",
        content: {
          kind: "application-access",
          mode: "private",
          server: "fixture-server",
          localPort: 8081,
          remotePort: 80,
        },
      },
    },
    access.id,
  );
  expect(
    listInformation(app).filter(
      (r) => r.presentation?.content?.kind === "application-access",
    ),
  ).toHaveLength(1);
  expect(
    listInformation(app).find((r) => r.id === access.id)?.presentation?.url,
  ).toBe("http://127.0.0.1:8081");
});

it("rejects malformed typed records before saving them", () => {
  const base = {
    title: "Access",
    body: "",
    presentation: {
      views: ["overview"],
      role: "status",
      url: "http://example.com",
      content: {
        kind: "application-access",
        mode: "private",
        server: "fixture-server",
        localPort: 8080,
        remotePort: 80,
      },
    },
  };
  expect(() => saveInformation(app, base)).toThrow("127.0.0.1");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: "http://127.0.0.1:8081" },
    }),
  ).toThrow("localPort");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: { ...base.presentation, url: undefined },
    }),
  ).toThrow("browser URL");
  expect(() =>
    saveInformation(app, {
      ...base,
      presentation: {
        ...base.presentation,
        content: { kind: "arbitrary-html", html: "<script>" },
      },
    }),
  ).toThrow();
  expect(listInformation(app)).toHaveLength(0);
});
