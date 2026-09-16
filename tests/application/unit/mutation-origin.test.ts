import { NextRequest } from "next/server";
import { assertSameOrigin } from "@/server/schemas";
import { beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({
  createApplication: vi.fn(() => ({
    created: true,
    application: { id: "app" },
  })),
  createChat: vi.fn(() => ({ id: "chat" })),
  sendChatMessage: vi.fn(() => ({})),
  archiveChat: vi.fn(() => ({})),
  observeRepository: vi.fn(() => ({})),
  removeApplication: vi.fn(() => ({})),
  choosePiSetup: vi.fn(),
  updatePiPreferences: vi.fn(),
  start: vi.fn(() => ({ id: "attempt" })),
  cancel: vi.fn(() => ({ id: "attempt" })),
  disconnect: vi.fn(),
}));
vi.mock("../../../src/server/applications", () => ({
  ...effects,
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class extends Error {},
}));
vi.mock("../../../src/server/operator-view", () => ({
  getOperatorView: () => ({}),
}));
vi.mock("../../../src/server/pi-configuration", async (original) => ({
  ...(await original<object>()),
  choosePiSetup: effects.choosePiSetup,
  updatePiPreferences: effects.updatePiPreferences,
}));
vi.mock("../../../src/server/pi-setup", () => ({
  getPiSetupStatus: () => ({}),
  piLoginCoordinator: effects,
}));
vi.mock("../../../src/server/pi-runs", () => ({
  sendChatMessage: effects.sendChatMessage,
}));

import { POST as application } from "../../../src/app/api/applications/route";
import { DELETE as remove } from "../../../src/app/api/applications/[applicationId]/route";
import { POST as chat } from "../../../src/app/api/applications/[applicationId]/chats/route";
import { POST as message } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/messages/route";
import { POST as archive } from "../../../src/app/api/applications/[applicationId]/chats/[chatId]/archive/route";
import { POST as repositoryCheck } from "../../../src/app/api/applications/[applicationId]/repository-check/route";
import {
  POST as setup,
  PATCH as preferences,
  DELETE as disconnect,
} from "../../../src/app/api/pi/setup/route";
import { POST as login } from "../../../src/app/api/pi/setup/login/route";
import { DELETE as cancel } from "../../../src/app/api/pi/setup/login/[attemptId]/route";

const context = {
  params: Promise.resolve({
    applicationId: "app",
    chatId: "chat",
    attemptId: "attempt",
  }),
};
const model = { modelId: "gpt-5.6-sol", reasoningEffort: "high" };
const routes = [
  {
    name: "application",
    method: "POST",
    handler: application,
    body: {
      repositoryUrl: "https://github.com/qa/example",
      requestKey: "00000000-0000-4000-8000-000000000099",
    },
  },
  { name: "chat", method: "POST", handler: chat, body: {} },
  {
    name: "message",
    method: "POST",
    handler: message,
    body: {
      message: "Hello",
      requestKey: "00000000-0000-4000-8000-000000000001",
    },
  },
  { name: "archive", method: "POST", handler: archive },
  { name: "repository check", method: "POST", handler: repositoryCheck },
  { name: "setup", method: "POST", handler: setup, body: { mode: "separate" } },
  { name: "preferences", method: "PATCH", handler: preferences, body: model },
  { name: "login", method: "POST", handler: login, body: model },
  { name: "cancel", method: "DELETE", handler: cancel },
  {
    name: "disconnect",
    method: "DELETE",
    handler: disconnect,
    body: { confirm: "disconnect" },
  },
  {
    name: "remove",
    method: "DELETE",
    handler: remove,
    body: { repository: "qa/example" },
  },
];

beforeEach(() => vi.clearAllMocks());

// The rule itself lives in one function, so it is proved here once, against
// the request shapes a browser or a page on another site can actually send.
describe("the same-origin guard", () => {
  const guard = (headers: Record<string, string>) => () =>
    assertSameOrigin(
      new Request("http://localhost:3000/api/test", {
        method: "POST",
        headers,
      }),
    );
  const local = { host: "127.0.0.1:3000" };

  it.each([
    ["another site", "https://untrusted.example"],
    ["an opaque origin", "null"],
    ["the same host on another port", "http://127.0.0.1:3999"],
    ["http where the page is https", "https://127.0.0.1:3000"],
  ])("refuses %s", (_label, origin) => {
    expect(guard({ ...local, origin })).toThrow(
      "Cross-origin requests are not allowed.",
    );
  });

  it("allows the page it served, and a local client that sends no Origin", () => {
    expect(guard({ ...local, origin: "http://127.0.0.1:3000" })).not.toThrow();
    expect(guard(local)).not.toThrow();
  });

  it("reads the browser's own Host and never X-Forwarded-Host", () => {
    // Trusting the forwarded header would let any proxy name itself the
    // destination and make every Origin match.
    expect(
      guard({
        ...local,
        origin: "http://untrusted.example",
        "x-forwarded-host": "untrusted.example",
      }),
    ).toThrow("Cross-origin requests are not allowed.");
    expect(guard({ host: "untrusted.example" })).toThrow(
      "This controller only accepts loopback hosts.",
    );
  });
});

// And every mutation route is behind it: one hostile request each, because a
// route that forgot the guard is the failure this catches.
describe.each(routes)("$name", ({ method, handler, body }) => {
  const send = (headers: Record<string, string>) =>
    handler(
      new NextRequest("http://localhost:3000/api/test", {
        method,
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { host: "127.0.0.1:3000", ...headers },
      }),
      context,
    );

  it("refuses another site's request before any side effect", async () => {
    const refused = await send({
      origin: "https://untrusted.example",
      // text/plain is the form that needs no preflight, so it is the one a
      // hostile page would use.
      "content-type": "text/plain",
      "x-forwarded-host": "untrusted.example",
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({
      error: "Cross-origin requests are not allowed.",
    });
    for (const effect of Object.values(effects))
      expect(effect).not.toHaveBeenCalled();
  });
});
