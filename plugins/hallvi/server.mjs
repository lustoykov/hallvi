// An adapter to one named Hallvi controller. No sessions or jobs live here.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import {
  ClientError,
  controllerClient,
  observe,
  parseHandle,
  requestHandle,
  selectController,
} from "../../scripts/controller-client.mjs";
import { projectConversation, projectTraffic } from "./conversation.mjs";

export const PLUGIN_VERSION = "0.2.0";

export function panelResource(html) {
  const version = createHash("sha256").update(html).digest("hex").slice(0, 16);
  return {
    version,
    uri: `ui://hallvi/applications-${version}.html`,
    html: html.replaceAll("__HALLVI_UI_VERSION__", version),
  };
}
const id = z.string().regex(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

export function uiOrigin(value, controller) {
  if (!value) return controller;
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("--ui-url must be an HTTPS or loopback HTTP origin.");
  return url.origin;
}

export function createHallviServer({
  controller,
  uiUrl,
  panelHtml,
  panelPath,
} = {}) {
  controller = selectController({ flag: controller });
  const pageOrigin = uiOrigin(uiUrl, controller);
  const client = controllerClient(controller);
  const server = new McpServer(
    { name: "hallvi", version: PLUGIN_VERSION },
    {
      instructions:
        "Use hallvi_apps then hallvi_inspect to confirm the application and permission mode before submitting work. hallvi_conversation shows what the main operator is doing and recently said. Hallvi's existing Pi operator performs the work. Reuse the same request_key and message after uncertain acceptance; never invent a new key to retry. Follow the handle with hallvi_wait. Completed means Pi finished answering, not verified success. Read answer and evidence. Approval, input, Continue and Stop stay in Hallvi; never bypass a wait.",
    },
  );
  const page = (applicationId, chatId) =>
    `${pageOrigin}/applications/${applicationId}` +
    (chatId ? `?chat=${chatId}` : "");
  const reply = (data, isError = false) => ({
    isError,
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  });
  const errorReply = (error) =>
    reply(
      {
        controller,
        error: {
          code: error instanceof ClientError ? error.code : "adapter-error",
          // Never return unexpected stacks or arbitrary exception payloads.
          message:
            error instanceof ClientError
              ? error.message
              : "The Hallvi adapter could not complete this call.",
        },
      },
      true,
    );
  const tool = (name, config, handler) =>
    server.registerTool(name, config, async (args, extra) => {
      try {
        const data = await handler(args, extra);
        return reply(data, Boolean(data.error));
      } catch (error) {
        return errorReply(error);
      }
    });
  let currentPanel;
  const apps = async (_, { signal }) => ({
    controller,
    ui: { version: currentPanel.version, resourceUri: currentPanel.uri },
    page: pageOrigin,
    applications: (await client.applications({ signal })).map((app) => ({
      ...app,
      page: page(app.id, app.mainChatId),
    })),
  });
  tool(
    "hallvi_apps",
    {
      title: "List Hallvi applications",
      description:
        "List existing applications and their recorded condition. This does not probe servers or establish current health.",
      inputSchema: {},
      annotations: readOnly,
    },
    apps,
  );
  tool(
    "hallvi_inspect",
    {
      title: "Inspect a Hallvi application",
      description:
        "Read application identity, permission mode, pending attention and bounded execution evidence. Optionally read one execution in full. No new model call or server probe.",
      inputSchema: { application_id: id, execution_id: id.optional() },
      annotations: readOnly,
    },
    async ({ application_id, execution_id }, { signal }) => {
      if (execution_id)
        return {
          ...(await client.execution(application_id, execution_id, {
            signal,
          })),
          controller,
          applicationId: application_id,
          page: page(application_id),
        };
      const [inspection, traffic] = await Promise.all([
        client.inspection(application_id, { signal }),
        // Traffic is context: a controller without it still inspects.
        client.traffic(application_id, { signal }).then(projectTraffic, () => ({
          unavailable: true,
        })),
      ]);
      return {
        ...inspection,
        // The controller's pages are its own paths; give the browser's address.
        attention: (inspection.attention ?? []).map((item) => ({
          ...item,
          page: item.page?.startsWith("/")
            ? `${pageOrigin}${item.page}`
            : item.page,
        })),
        traffic,
        controller,
        applicationId: application_id,
        page: page(application_id),
      };
    },
  );
  tool(
    "hallvi_conversation",
    {
      title: "Read the main conversation",
      description:
        "Read the latest turns of an application's main conversation: the owner's requests, what each reply did (calls, targets, status, output excerpts), its words and saved records, and whether the operator is idle, working, waiting for approval or interrupted. Read-only: no model call, no server probe. Pass a previous revision as `known` to learn only whether anything changed.",
      inputSchema: {
        application_id: id,
        turns: z.number().int().min(1).max(20).default(3),
        known: z.string().max(64).optional(),
      },
      annotations: readOnly,
    },
    async ({ application_id, turns, known }, { signal }) => {
      const app = await client.application(application_id, { signal });
      if (!app.mainChatId)
        throw new ClientError(
          "not-found",
          "This application has no main conversation. Open Hallvi to finish setup.",
        );
      const conversation = projectConversation(
        await client.conversation(application_id, app.mainChatId, { signal }),
        { turns },
      );
      const read = {
        controller,
        applicationId: application_id,
        chatId: app.mainChatId,
        page: page(application_id, app.mainChatId),
        readAt: new Date().toISOString(),
        revision: conversation.revision,
        status: conversation.status,
        worker: conversation.worker,
      };
      return conversation.revision === known
        ? { ...read, unchanged: true }
        : { ...read, ...conversation, unchanged: false };
    },
  );
  tool(
    "hallvi_exec",
    {
      title: "Ask Hallvi to operate an application",
      description:
        "Submit a bounded user request to the application's existing Pi operator. May change servers, deploy code, delete data or incur provider costs within the requested scope and Hallvi permission mode. Confirm the app with inspect first. Supply a fresh lowercase UUID request_key, and reuse it with the exact same message after unknown acceptance. Returns promptly after acceptance; use wait for the result. Never include credentials or contributor instructions in the message.",
      inputSchema: {
        application_id: id,
        message: z.string().trim().min(1).max(5000),
        request_key: id,
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
        idempotentHint: true,
      },
      // The panel's composer sends through the same tool and key rules.
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    async ({ application_id, message, request_key }, { signal }) => {
      const budget = AbortSignal.any([signal, AbortSignal.timeout(40_000)]);
      const app = await client.application(application_id, { signal: budget });
      if (!app.mainChatId)
        throw new ClientError(
          "not-found",
          "This application has no main conversation. Open Hallvi to finish setup.",
        );
      const target = {
        controller,
        applicationId: application_id,
        chatId: app.mainChatId,
        requestKey: request_key,
      };
      const result = {
        ...target,
        handle: requestHandle(target),
        page: page(application_id, app.mainChatId),
        status: null,
      };
      try {
        await client.send(
          { ...target, message },
          {
            attempts: 1,
            signal: budget,
          },
        );
        return { ...result, accepted: true };
      } catch (error) {
        const unknown =
          !(error instanceof ClientError) ||
          error.code === "acceptance-unknown" ||
          error.transient;
        // Keep the handle even if the MCP call's observer stopped mid-send.
        return {
          ...result,
          accepted: unknown ? null : false,
          error: {
            code: unknown ? "acceptance-unknown" : error.code,
            message: unknown
              ? "Acceptance is unknown. Follow this handle, or resend the exact same message with the same request_key. Do not create a new request."
              : error.message,
          },
        };
      }
    },
  );
  tool(
    "hallvi_wait",
    {
      title: "Follow a Hallvi request",
      description:
        "Read the outcome of a handle returned by exec. Never submits, approves, continues or cancels work. Optional wait is bounded to 20 seconds; a timeout only stops observing. Completed is not proof of operational success. Read the answer, evidence and omission flags.",
      inputSchema: {
        handle: z.string().max(500),
        timeout_seconds: z.number().int().min(0).max(20).default(0),
      },
      annotations: readOnly,
    },
    async ({ handle, timeout_seconds }, { signal }) => {
      const target = parseHandle(handle, { flag: controller, env: {} });
      const result = {
        ...target,
        handle,
        page: page(target.applicationId, target.chatId),
      };
      try {
        const { outcome, stopped, problem } = await observe(client, target, {
          timeoutMs: timeout_seconds * 1000,
          signal,
        });
        return {
          ...result,
          ...outcome,
          status: problem || stopped === "signal" ? null : outcome?.status,
          lastKnownStatus: problem ? (outcome?.status ?? null) : undefined,
          timedOut: stopped === "timeout",
          error: problem
            ? { code: problem.code, message: problem.message }
            : null,
        };
      } catch (error) {
        return {
          ...result,
          status: null,
          error: {
            code: error instanceof ClientError ? error.code : "read-stopped",
            message:
              "The current outcome is unknown. Follow the same handle again; do not resubmit under a new key.",
          },
        };
      }
    },
  );
  // Capture each revision's bytes: one URI must never return different HTML.
  const revisions = new Map();
  let openTool;
  const openMeta = (uri) => ({
    ui: { resourceUri: uri },
    "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }] },
  });
  function reloadPanel() {
    const next = panelResource(
      panelHtml ??
        readFileSync(
          panelPath ?? new URL("./panel.html", import.meta.url),
          "utf8",
        ),
    );
    const changed = currentPanel?.uri !== next.uri;
    if (changed) {
      if (!revisions.has(next.uri)) {
        const resource = server.registerResource(
          `hallvi-panel-${next.version}`,
          next.uri,
          { mimeType: "text/html;profile=mcp-app" },
          async () => ({
            contents: [
              {
                uri: next.uri,
                mimeType: "text/html;profile=mcp-app",
                text: next.html,
                _meta: {
                  ui: { csp: { connectDomains: [], resourceDomains: [] } },
                },
              },
            ],
          }),
        );
        revisions.set(next.uri, resource);
      }
      currentPanel = next;
      openTool?.update({ _meta: openMeta(next.uri) });
      // Keep a few already-open revisions usable without growing forever.
      while (revisions.size > 8) {
        const oldest = revisions.keys().next().value;
        revisions.get(oldest).remove();
        revisions.delete(oldest);
      }
    }
    return {
      changed,
      version: next.version,
      resourceUri: next.uri,
      message: changed
        ? "The adapter serves the updated panel file; an already-open panel may still show an earlier version. In Codex, open Hallvi in a new chat. If it stays on the earlier version, reconnect the Hallvi plugin. Compare the displayed version with this result. Adapter code and the controller were not restarted."
        : "The adapter already serves this panel file. This does not establish which version the host is displaying or reload adapter code. Compare this version with the panel menu; if they differ, open Hallvi in a new Codex chat or reconnect the plugin.",
    };
  }
  reloadPanel();
  openTool = tool(
    "hallvi_open",
    {
      title: "Open Hallvi",
      description:
        "Open Hallvi beside this conversation or from the sidebar: talk to an application's main operator, follow its work and read the application's condition, traffic and errors. The selected application is shared with this conversation. Approvals, input cards, Continue and Stop stay in Hallvi's page.",
      inputSchema: {},
      annotations: readOnly,
      _meta: openMeta(currentPanel.uri),
    },
    apps,
  );
  tool(
    "hallvi_reload_ui",
    {
      title: "Reload Hallvi UI resource",
      description:
        "Read an installed panel.html update, publish a content-versioned UI resource and notify this MCP connection of the changed tool/resource metadata. Does not execute application work, reconnect MCP, reload adapter code, or restart Hallvi. Reopen the panel after a change; host cache refresh is host-dependent.",
      inputSchema: {},
      annotations: { ...readOnly, readOnlyHint: false, idempotentHint: true },
    },
    async () => reloadPanel(),
  );
  return server;
}

// Only a private loopback listener. Remote Codex uses SSH stdio; ChatGPT uses
// Secure MCP Tunnel. This is not a public, authenticated service endpoint.
export async function startHttp(options, port) {
  const http = createServer(async (req, res) => {
    const actualPort = http.address().port;
    const hosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    if (
      !hosts.includes(req.headers.host) ||
      (req.headers.origin &&
        !hosts.some((host) => req.headers.origin === `http://${host}`))
    ) {
      res.writeHead(403).end("Forbidden host or origin");
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    const server = createHallviServer(options);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end("MCP request failed");
    }
  });
  await new Promise((resolve, reject) => {
    http.once("error", reject);
    http.listen(port, "127.0.0.1", resolve);
  });
  return http;
}

export async function main(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      controller: { type: "string" },
      "ui-url": { type: "string" },
      http: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "Hallvi MCP: node server.mjs --controller http://127.0.0.1:4747 [--ui-url http://127.0.0.1:4747] [--http 4748]\nDefault transport: stdio. HTTP binds only to 127.0.0.1 for private testing.",
    );
    return;
  }
  const controller = selectController({ flag: values.controller });
  const options = {
    controller,
    uiUrl: uiOrigin(values["ui-url"], controller),
  };
  if (values.http !== undefined) {
    const port = Number(values.http);
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("--http requires a port from 1024 to 65535.");
    const http = await startHttp(options, port);
    console.error(`Hallvi MCP listening at http://127.0.0.1:${port}/mcp`);
    const stop = () => {
      http.closeAllConnections();
      http.close();
    };
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
  } else {
    await createHallviServer(options).connect(new StdioServerTransport());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
