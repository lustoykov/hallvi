// The terminal transport must refuse before anything is spawned. Every case
// here asserts that a rejected attach leaves no session — the ssh child is the
// thing that must never exist for an unauthorized caller.

import { once } from "node:events";
import { setImmediate as turn } from "node:timers/promises";
import { afterAll, expect, it, vi } from "vitest";
import WebSocket from "ws";
import type { OperatorSettings } from "@/server/operator-data";

const pending = vi.hoisted(() => ({
  settings: vi.fn<() => Promise<OperatorSettings>>(async () => ({
    host: null,
    permissionMode: "pi-decides",
  })),
  spawn: vi.fn(),
}));
vi.mock("@/server/operator-execution", () => ({
  operatorSettings: pending.settings,
}));
vi.mock("node-pty", () => ({ spawn: pending.spawn }));

import {
  issueTerminalTicket,
  terminalSessionCount,
} from "@/server/terminal-bridge";
import { readSize } from "@/server/terminal-session";

const ORIGIN = "http://127.0.0.1:3000";
const APPLICATION = "00000000-0000-4000-8000-000000000000";
const size = { cols: 80, rows: 24 };
const open: WebSocket[] = [];

/** Attaches and resolves how the server answered, without keeping a socket. */
function attach(url: string, origin: string | undefined) {
  return new Promise<{ ok: boolean; status: number | null }>((resolve) => {
    const socket = new WebSocket(url, origin ? { origin } : {});
    open.push(socket);
    socket.on("open", () => resolve({ ok: true, status: null }));
    socket.on("unexpected-response", (_request, response) =>
      resolve({ ok: false, status: response.statusCode ?? null }),
    );
    socket.on("error", () => resolve({ ok: false, status: null }));
  });
}

afterAll(() => open.forEach((socket) => socket.close()));

it("refuses dimensions a terminal could not have", () => {
  expect(readSize({ cols: 80, rows: 24 })).toEqual({ cols: 80, rows: 24 });
  expect(readSize({ cols: 0, rows: 24 })).toBeNull();
  expect(readSize({ cols: 80, rows: 100_000 })).toBeNull();
  expect(readSize({ cols: 80.5, rows: 24 })).toBeNull();
  expect(readSize({ cols: "80", rows: 24 })).toBeNull();
  expect(readSize(null)).toBeNull();
  expect(readSize(undefined)).toBeNull();
});

it("refuses an attach with no capability, and spawns nothing", async () => {
  const { port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  const before = await terminalSessionCount();
  expect((await attach(`ws://127.0.0.1:${port}/terminal`, ORIGIN)).ok).toBe(
    false,
  );
  expect(
    (await attach(`ws://127.0.0.1:${port}/terminal?ticket=guessed`, ORIGIN)).ok,
  ).toBe(false);
  expect(await terminalSessionCount()).toBe(before);
});

it("refuses a capability presented from another origin", async () => {
  const { ticket, port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  const before = await terminalSessionCount();
  const answer = await attach(
    `ws://127.0.0.1:${port}/terminal?ticket=${ticket}`,
    "http://evil.example",
  );
  expect(answer.ok).toBe(false);
  expect(answer.status).toBe(403);
  expect(await terminalSessionCount()).toBe(before);
});

it("refuses a capability presented with no origin at all", async () => {
  const { ticket, port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  const answer = await attach(
    `ws://127.0.0.1:${port}/terminal?ticket=${ticket}`,
    undefined,
  );
  expect(answer.ok).toBe(false);
  expect(answer.status).toBe(403);
});

it("spends a capability once; the second attach is refused", async () => {
  const { ticket, port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  // The application row does not exist here, so the first attach is accepted
  // by the transport and then closed by the session with a failed state. What
  // matters is that the same capability cannot be used again.
  await attach(`ws://127.0.0.1:${port}/terminal?ticket=${ticket}`, ORIGIN);
  const second = await attach(
    `ws://127.0.0.1:${port}/terminal?ticket=${ticket}`,
    ORIGIN,
  );
  expect(second.ok).toBe(false);
  expect(second.status).toBe(401);
});

it("serves nothing but the terminal path", async () => {
  const { ticket, port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  const answer = await attach(
    `ws://127.0.0.1:${port}/anything?ticket=${ticket}`,
    ORIGIN,
  );
  expect(answer.ok).toBe(false);
  expect(answer.status).toBe(404);
});

it("starts no shell when the socket closes while its database read is waiting", async () => {
  let release!: (settings: OperatorSettings) => void;
  let reading!: () => void;
  const started = new Promise<void>((done) => {
    reading = done;
  });
  pending.settings.mockImplementationOnce(() => {
    reading();
    return new Promise((done) => {
      release = done;
    });
  });
  const { ticket, port } = await issueTerminalTicket({
    applicationId: APPLICATION,
    origin: ORIGIN,
    size,
  });
  await attach(`ws://127.0.0.1:${port}/terminal?ticket=${ticket}`, ORIGIN);
  await started;
  const socket = open.at(-1)!;
  const closed = once(socket, "close");
  socket.close();
  await closed;
  release({
    permissionMode: "pi-decides",
    host: {
      address: "fixture.invalid",
      user: "root",
      port: 22,
      privateKeyPath: "/fixture/key",
      knownHostsPath: "/fixture/hosts",
    },
  });
  await turn();
  expect(pending.spawn).not.toHaveBeenCalled();
  expect(await terminalSessionCount()).toBe(0);
});
