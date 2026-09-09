import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({
  createPhaseOneApplication: vi.fn(() => ({ created: true, view: {} })),
  createChat: vi.fn(() => ({})),
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
vi.mock("../../../src/server/phase-one", () => ({
  ...effects,
  getPhaseOneOperatorView: () => ({}),
  ExistingApplicationConflictError: class extends Error {},
  NotFoundError: class extends Error {},
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
import { POST as rerun } from "../../../src/app/api/applications/[applicationId]/checks/repository-readable/rerun/route";
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
      approvalMode: "pi-decides",
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
  { name: "rerun", method: "POST", handler: rerun },
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

describe.each(routes)(
  "$name mutation Origin boundary",
  ({ method, handler, body }) => {
    it.each(["https://untrusted.example", "null", "http://127.0.0.1:3999"])(
      "rejects %s before any side effect",
      async (origin) => {
        const request = new NextRequest("http://localhost:3000/api/test", {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            origin,
            host: "127.0.0.1:3000",
            "content-type": "text/plain",
            "x-forwarded-host": "untrusted.example",
          },
        });
        const response = await handler(request, context);
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: "Cross-origin requests are not allowed.",
        });
        for (const effect of Object.values(effects))
          expect(effect).not.toHaveBeenCalled();
      },
    );

    it.each(["http://127.0.0.1:3000", undefined])(
      "accepts matching Origin or an Origin-less local client: %s",
      async (origin) => {
        const request = new NextRequest("http://localhost:3000/api/test", {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
          headers: {
            ...(origin ? { origin } : {}),
            host: "127.0.0.1:3000",
            "content-type": "application/json",
          },
        });
        const response = await handler(request, context);
        expect(response.status).toBeLessThan(300);
        expect(
          Object.values(effects).some((effect) => effect.mock.calls.length),
        ).toBe(true);
      },
    );
  },
);
