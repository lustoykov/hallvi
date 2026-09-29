import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

import {
  controllerClient,
  observe,
  parseHandle,
  requestHandle,
  selectController,
} from "../../../scripts/controller-client.mjs";

// The client as a caller uses it, against small local servers standing in for
// a controller. What a real controller answers is proved by the CLI journey.
const servers: Server[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers.splice(0).map((server) => {
      server.closeAllConnections();
      return new Promise((done) => server.close(done));
    }),
  );
});

/** A stand-in answering each request in turn; `null` drops the connection. */
async function standIn(
  answers: ((request: IncomingMessage, body: string) => unknown)[],
) {
  const seen: { method: string; url: string; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      seen.push({ method: request.method!, url: request.url!, body });
      const answer = (answers[seen.length - 1] ?? answers.at(-1)!)(
        request,
        body,
      ) as {
        status: number;
        json?: unknown;
        headers?: object;
        /** Answer this long after asking, as a busy controller does. */
        afterMs?: number;
      } | null;
      if (!answer) return request.socket.destroy();
      setTimeout(() => {
        if (response.destroyed) return;
        response.writeHead(answer.status, {
          "content-type": "application/json",
          ...answer.headers,
        });
        response.end(JSON.stringify(answer.json ?? {}));
      }, answer.afterMs ?? 0);
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, seen };
}

const ids = {
  applicationId: "3ee7c9a7-5da8-434a-8222-cccac5089141",
  chatId: "798e4859-86dc-43d1-a0fd-b2d2bee3be28",
  requestKey: "ff2394f3-7e8a-4079-b41e-735c5fad35d9",
};

it("contacts nothing unless the controller is named, on loopback, and the one a handle belongs to", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  expect(() => selectController({ env: {} })).toThrow(
    expect.objectContaining({ code: "controller-missing" }),
  );
  for (const flag of [
    "https://127.0.0.1:4747",
    "http://example.com",
    "http://127.0.0.1:4747/api",
    "http://user:secret@127.0.0.1:4747",
  ])
    expect(() => selectController({ flag, env: {} })).toThrow(
      expect.objectContaining({ code: "controller-invalid" }),
    );
  // The flag wins over the environment, and both are only ever named.
  expect(
    selectController({
      flag: "http://127.0.0.1:5100/",
      env: { HALLVI_CONTROLLER_URL: "http://127.0.0.1:4747" },
    }),
  ).toBe("http://127.0.0.1:5100");

  const handle = requestHandle({ controller: "http://127.0.0.1:5100", ...ids });
  expect(parseHandle(handle, { env: {} })).toEqual({
    controller: "http://127.0.0.1:5100",
    ...ids,
  });
  // A controller named beside a handle must be the handle's own.
  for (const named of [
    { flag: "http://127.0.0.1:4747", env: {} },
    { env: { HALLVI_CONTROLLER_URL: "http://127.0.0.1:4747" } },
  ])
    expect(() => parseHandle(handle, named)).toThrow(
      expect.objectContaining({ code: "controller-conflict" }),
    );
  expect(() => parseHandle(`${handle}?x=1`, { env: {} })).toThrow(
    expect.objectContaining({ code: "handle-invalid" }),
  );
  expect(fetch).not.toHaveBeenCalled();
});

it("asks again under the same key when an answer is lost, and never after a refusal", async () => {
  const lost = await standIn([
    () => null,
    () => ({
      status: 502,
      json: { error: "Hallvi's worker stopped answering." },
    }),
    () => ({ status: 202 }),
  ]);
  const request = { ...ids, message: "Check the application" };
  await expect(
    controllerClient(lost.url).send(request, { pauseMs: 1 }),
  ).resolves.toEqual({ accepted: true });
  expect(lost.seen.map(({ body }) => JSON.parse(body))).toEqual(
    Array(3).fill({
      message: "Check the application",
      requestKey: ids.requestKey,
      delivery: "next",
      origin: "cli",
    }),
  );

  // Never answered: whether Pi has it is not known, and is said so.
  const silent = await standIn([() => null]);
  await expect(
    controllerClient(silent.url).send(request, { pauseMs: 1, attempts: 2 }),
  ).rejects.toMatchObject({ code: "acceptance-unknown" });
  expect(silent.seen).toHaveLength(2);

  // Taken, answer lost, and the retry refused: the refusal is the retry's,
  // so whether Pi has the first send is still not known.
  const unsure = await standIn([
    () => null,
    () => ({ status: 503, json: { error: "The worker is not running." } }),
  ]);
  await expect(
    controllerClient(unsure.url).send(request, { pauseMs: 1 }),
  ).rejects.toMatchObject({ code: "acceptance-unknown" });
  expect(new Set(unsure.seen.map(({ body }) => body)).size).toBe(1);
  // …until a later attempt settles it.
  const settled = await standIn([
    () => null,
    () => ({ status: 503, json: { error: "The worker is not running." } }),
    () => ({ status: 202 }),
  ]);
  await expect(
    controllerClient(settled.url).send(request, { pauseMs: 1 }),
  ).resolves.toEqual({ accepted: true });

  // A refusal with nothing sent before it is the controller's answer: nothing
  // is sent again.
  for (const [status, code] of [
    [409, "refused"],
    [503, "worker-unavailable"],
  ] as const) {
    const refusing = await standIn([
      () => ({ status, json: { error: "No." } }),
    ]);
    await expect(
      controllerClient(refusing.url).send(request, { pauseMs: 1 }),
    ).rejects.toMatchObject({ code });
    expect(refusing.seen).toHaveLength(1);
  }
});

it("refuses a redirect rather than following it", async () => {
  const elsewhere = await standIn([() => ({ status: 200, json: {} })]);
  const redirecting = await standIn([
    (request) => ({
      status: 307,
      headers: { location: `${elsewhere.url}${request.url}` },
    }),
  ]);
  await expect(
    controllerClient(redirecting.url).applications(),
  ).rejects.toMatchObject({ code: "redirected" });
  expect(elsewhere.seen).toEqual([]);
});

it("never reads a failed read as a state, and says a request Pi dropped was cancelled only when it was seen", async () => {
  const outcome = (status: string) => ({
    status: 200,
    json: { ...ids, status, operation: null, evidence: [] },
  });
  const missing = () => ({
    status: 404,
    json: { error: "No such request.", missing: "request" },
  });
  const restarting = await standIn([
    outcome.bind(null, "queued"),
    () => ({ status: 503, json: { error: "The worker is not running." } }),
    () => null,
    outcome.bind(null, "completed"),
  ]);
  const target = { controller: restarting.url, ...ids };
  const options = { pollMs: 1, patienceMs: 5_000 };
  await expect(
    observe(controllerClient(restarting.url), target, options),
  ).resolves.toMatchObject({ outcome: { status: "completed" }, stopped: null });

  const dropped = await standIn([outcome.bind(null, "queued"), missing]);
  await expect(
    observe(
      controllerClient(dropped.url),
      { ...target, controller: dropped.url },
      options,
    ),
  ).resolves.toMatchObject({
    outcome: { status: "cancelled", dropped: expect.stringMatching(/Stop/) },
  });

  // Never seen: it was never accepted, or dropped before this looked.
  const unknown = await standIn([missing]);
  await expect(
    observe(
      controllerClient(unknown.url),
      { ...target, controller: unknown.url },
      options,
    ),
  ).rejects.toMatchObject({ code: "request-not-found" });

  // A slow answer does not hold the wait past its time: the watch ends as a
  // timeout, and Pi's work is not touched.
  const slow = await standIn([
    () => ({ ...outcome("working"), afterMs: 1_000 }),
  ]);
  const client = controllerClient(slow.url);
  const began = Date.now();
  await expect(
    observe(client, { ...target, controller: slow.url }, { timeoutMs: 20 }),
  ).resolves.toEqual({ outcome: null, stopped: "timeout" });
  expect(Date.now() - began).toBeLessThan(500);
  // Zero asks for the state once, so that one read is let finish.
  await expect(
    observe(client, { ...target, controller: slow.url }, { timeoutMs: 0 }),
  ).resolves.toMatchObject({
    outcome: { status: "working" },
    stopped: "timeout",
  });
  // Out of time while reads fail: said, not passed off as the last state.
  const failing = await standIn([
    outcome.bind(null, "working"),
    () => ({ status: 503, json: { error: "The worker is not running." } }),
  ]);
  await expect(
    observe(
      controllerClient(failing.url),
      { ...target, controller: failing.url },
      { timeoutMs: 200, pollMs: 1 },
    ),
  ).resolves.toMatchObject({
    outcome: { status: "working" },
    stopped: "timeout",
    problem: { code: "worker-unavailable" },
  });

  // Still failing after the patience runs out: not known, never a state.
  const down = await standIn([() => null]);
  await expect(
    observe(
      controllerClient(down.url),
      { ...target, controller: down.url },
      { pollMs: 1, patienceMs: 20 },
    ),
  ).rejects.toMatchObject({ code: "unreachable" });
});
