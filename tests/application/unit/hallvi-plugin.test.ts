import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  startHttp,
  createHallviServer,
} from "../../../plugins/hallvi/server.mjs";

const app = "3ee7c9a7-5da8-434a-8222-cccac5089141";
const chat = "798e4859-86dc-43d1-a0fd-b2d2bee3be28";
const key = "ff2394f3-7e8a-4079-b41e-735c5fad35d9";
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
function keep(server: Server) {
  cleanup.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
async function fixture() {
  const requests: {
    method: string;
    url: string;
    body: Record<string, string>;
  }[] = [];
  const accepted = new Map<string, string>();
  const state = {
    loseReply: false,
    unavailable: false,
    status: "waiting-for-approval",
  };
  const http = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    requests.push({ method: req.method!, url: req.url!, body });
    const answer = (status: number, value: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (state.unavailable) return answer(503, {});
    if (req.url === "/api/applications")
      return answer(200, {
        applications: [
          {
            id: app,
            name: "Example site",
            mainChatId: chat,
            permissionMode: "always-ask",
          },
        ],
      });
    if (req.url?.endsWith("/messages")) {
      if (
        accepted.has(body.requestKey) &&
        accepted.get(body.requestKey) !== body.message
      )
        return answer(409, { error: "Different message for existing key." });
      accepted.set(body.requestKey, body.message);
      if (state.loseReply) {
        state.loseReply = false;
        req.socket.destroy();
        return;
      }
      return answer(202, {});
    }
    if (req.url?.endsWith(`/requests/${key}`))
      return answer(200, {
        applicationId: app,
        chatId: chat,
        requestKey: key,
        status: state.status,
        answer: state.status === "completed" ? "The check failed." : null,
        attention:
          state.status === "waiting-for-approval"
            ? {
                kind: "approval",
                reason: "Review GET request",
                page: `/applications/${app}`,
              }
            : null,
        evidence: [{ tool: "server_bash", exitCode: 1, output: "HTTP 503" }],
        evidenceOmitted: 0,
      });
    if (req.url?.endsWith("/inspection"))
      return answer(200, {
        application: {
          id: app,
          name: "Example site",
          permissionMode: "always-ask",
        },
        main: { status: "idle", worker: { alive: true } },
        attention: [],
        records: [],
        executions: [],
      });
    answer(404, {});
  });
  await new Promise<void>((done) => http.listen(0, "127.0.0.1", done));
  return { controller: keep(http), requests, accepted, state };
}
async function connect(controller: string) {
  const http = await startHttp(
    { controller, uiUrl: "http://127.0.0.1:8474" },
    0,
  );
  const url = keep(http);
  const client = new Client({ name: "hallvi-test", version: "1" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${url}/mcp`)),
  );
  cleanup.push(() => client.close());
  const call = async (name: string, args = {}) =>
    (await client.callTool({ name, arguments: args }))
      .structuredContent as Record<string, unknown>;
  return { client, call, url };
}

it("advertises native entrypoints and reads the real panel over MCP", async () => {
  const f = await fixture();
  const { client, call } = await connect(f.controller);
  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "hallvi_apps",
    "hallvi_inspect",
    "hallvi_exec",
    "hallvi_wait",
    "hallvi_open",
    "hallvi_reload_ui",
  ]);
  expect(
    tools.find((tool) => tool.name === "hallvi_exec")?.annotations,
  ).toMatchObject({ destructiveHint: true, readOnlyHint: false });
  expect(
    tools.find((tool) => tool.name === "hallvi_open")?._meta,
  ).toMatchObject({
    "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
  });
  const uri = (
    tools.find((tool) => tool.name === "hallvi_open")?._meta?.ui as {
      resourceUri: string;
    }
  ).resourceUri;
  expect(uri).toMatch(/^ui:\/\/hallvi\/applications-[a-f0-9]{16}\.html$/);
  const panel = await client.readResource({ uri });
  expect("text" in panel.contents[0] ? panel.contents[0].text : "").toContain(
    "ui/update-model-context",
  );
  expect((await call("hallvi_apps")).applications).toEqual([
    expect.objectContaining({
      id: app,
      page: `http://127.0.0.1:8474/applications/${app}?chat=${chat}`,
    }),
  ]);
  expect(await call("hallvi_inspect", { application_id: app })).toMatchObject({
    application: { permissionMode: "always-ask" },
  });
  expect(f.requests.every((request) => request.method === "GET")).toBe(true);
});

it("keeps identity after a lost send reply and never duplicates or approves work", async () => {
  const f = await fixture();
  const { call } = await connect(f.controller);
  f.state.loseReply = true;
  const args = {
    application_id: app,
    request_key: key,
    message: "Check the site; do not change it.",
  };
  const first = await call("hallvi_exec", args);
  expect(first).toMatchObject({
    accepted: null,
    status: null,
    error: { code: "acceptance-unknown" },
  });
  const second = await call("hallvi_exec", args);
  expect(second).toMatchObject({ accepted: true, handle: first.handle });
  expect(f.accepted.size).toBe(1);
  expect(
    f.requests
      .filter((request) => request.method === "POST")
      .map((r) => r.body),
  ).toEqual(
    Array(2).fill({
      message: args.message,
      requestKey: key,
      delivery: "next",
      origin: "cli",
    }),
  );
  expect(await call("hallvi_wait", { handle: first.handle })).toMatchObject({
    status: "waiting-for-approval",
    attention: { kind: "approval" },
  });
  expect(
    await call("hallvi_exec", { ...args, message: "Different request" }),
  ).toMatchObject({ accepted: false });
  expect(
    f.requests.some((request) =>
      /decision|operator|continue|stop/.test(request.url),
    ),
  ).toBe(false);
});

it("preserves completed-but-unsuccessful, pending, and unknown outcomes", async () => {
  const f = await fixture();
  const { call } = await connect(f.controller);
  const { handle } = await call("hallvi_exec", {
    application_id: app,
    request_key: key,
    message: "Check the site",
  });
  f.state.status = "working";
  expect(await call("hallvi_wait", { handle })).toMatchObject({
    status: "working",
    timedOut: true,
  });
  f.state.status = "completed";
  expect(await call("hallvi_wait", { handle })).toMatchObject({
    status: "completed",
    answer: "The check failed.",
    evidence: [{ exitCode: 1 }],
  });
  f.state.unavailable = true;
  expect(await call("hallvi_wait", { handle })).toMatchObject({
    status: null,
    error: { code: "worker-unavailable" },
  });
});

it("rejects other controllers, invalid IDs, and browser-origin requests before forwarding", async () => {
  const f = await fixture();
  const { client, call, url } = await connect(f.controller);
  const other = `http://127.0.0.1:1/api/applications/${app}/chats/${chat}/requests/${key}`;
  expect(await call("hallvi_wait", { handle: other })).toMatchObject({
    error: { code: "controller-conflict" },
  });
  expect(
    (
      await client.callTool({
        name: "hallvi_exec",
        arguments: {
          application_id: "../secrets",
          request_key: key,
          message: "check",
        },
      })
    ).isError,
  ).toBe(true);
  expect(
    (
      await fetch(`${url}/mcp`, {
        method: "POST",
        headers: {
          Origin: "https://untrusted.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(f.requests).toHaveLength(0);
});

it("runs the adapter over stdio, the transport used locally and through SSH", async () => {
  const f = await fixture();
  const client = new Client({ name: "stdio-test", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["plugins/hallvi/server.mjs", "--controller", f.controller],
      stderr: "pipe",
    }),
  );
  cleanup.push(() => client.close());
  expect(
    (await client.callTool({ name: "hallvi_apps", arguments: {} }))
      .structuredContent,
  ).toMatchObject({ controller: f.controller, applications: [{ id: app }] });
});

it("reloads UI on the same MCP connection, preserves revision bytes and recovers from a missing update", async () => {
  const f = await fixture();
  const dir = await mkdtemp(join(tmpdir(), "hallvi-panel-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const panelPath = join(dir, "panel.html");
  await writeFile(
    panelPath,
    "<h1>First UI</h1><small>__HALLVI_UI_VERSION__</small>",
  );
  const server = createHallviServer({ controller: f.controller, panelPath });
  cleanup.push(() => server.close());
  const client = new Client({ name: "ui-reload-test", version: "1" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  cleanup.push(() => client.close());
  const uri = async () => {
    const { tools } = await client.listTools();
    return (
      tools.find((tool) => tool.name === "hallvi_open")?._meta?.ui as {
        resourceUri: string;
      }
    ).resourceUri;
  };
  const first = await uri();
  const firstResource = await client.readResource({ uri: first });
  let changed = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    changed++;
  });
  await writeFile(
    panelPath,
    "<h1>Second UI</h1><small>__HALLVI_UI_VERSION__</small>",
  );
  const updated = await client.callTool({
    name: "hallvi_reload_ui",
    arguments: {},
  });
  const second = await uri();
  expect(second).not.toBe(first);
  expect(updated.structuredContent).toMatchObject({
    changed: true,
    resourceUri: second,
  });
  expect(changed).toBe(1);
  expect(await client.readResource({ uri: first })).toEqual(firstResource);
  const newResource = await client.readResource({ uri: second });
  const content = newResource.contents[0];
  const html = "text" in content ? content.text : "";
  expect(html).toContain("Second UI");
  expect(html).not.toContain("__HALLVI_UI_VERSION__");
  expect(
    (await client.callTool({ name: "hallvi_reload_ui", arguments: {} }))
      .structuredContent,
  ).toMatchObject({ changed: false, resourceUri: second });
  expect(changed).toBe(1);
  await rm(panelPath);
  expect(
    (await client.callTool({ name: "hallvi_reload_ui", arguments: {} }))
      .isError,
  ).toBe(true);
  expect(await uri()).toBe(second);
  expect(await client.readResource({ uri: second })).toEqual(newResource);
  expect(
    (await client.callTool({ name: "hallvi_apps", arguments: {} })).isError,
  ).toBe(false);
  await writeFile(panelPath, "<h1>Third UI</h1>");
  expect(
    (await client.callTool({ name: "hallvi_reload_ui", arguments: {} }))
      .isError,
  ).toBe(false);
  expect(await uri()).not.toBe(second);
});
