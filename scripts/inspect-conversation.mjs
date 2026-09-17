import Database from "better-sqlite3";
import { createServer } from "node:http";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  statSync,
  chmodSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { adoptLegacyEnvironment, stateLocation } from "./legacy-names.mjs";
import { exportFromFile } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/index.js";

const { values } = parseArgs({
  options: {
    application: { type: "string" },
    chat: { type: "string" },
    port: { type: "string", default: "3001" },
  },
});
const identifier = /^[a-zA-Z0-9_-]{1,128}$/;
for (const id of [values.application, values.chat].filter(Boolean))
  if (!identifier.test(id))
    throw new Error("Invalid application or conversation ID.");
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid port.");
const state = () => stateLocation(process.cwd(), { hidden: true });
const databasePath = resolve(
  adoptLegacyEnvironment().HALDUR_DB_PATH ?? state().database,
);
const database = new Database(databasePath, {
  readonly: true,
  fileMustExist: true,
});
const configRoot = resolve(process.env.HALDUR_CONFIG_DIR ?? state().directory);
const assets = join(dirname(fileURLToPath(import.meta.url)), "inspection");
const output = join(
  mkdtempSync(join(tmpdir(), "sg-live-inspection-")),
  "history.html",
);

class NotFound extends Error {}

/**
 * Which conversation a request is looking at: `?application=` and `?chat=`
 * when either is given, otherwise the conversation named at startup,
 * otherwise the newest application's main conversation. Addressing the view
 * by URL is what lets the live bar's selector and the application's
 * Transcript link reach any conversation without restarting the viewer.
 */
function chosen(parameters) {
  const asked = ["application", "chat"].some((name) => parameters.has(name))
    ? {
        application: parameters.get("application"),
        chat: parameters.get("chat"),
      }
    : { application: values.application, chat: values.chat };
  for (const id of [asked.application, asked.chat].filter(Boolean))
    if (!identifier.test(id))
      throw new NotFound("Invalid application or conversation ID.");
  const applications = database
    .prepare("SELECT id, name FROM applications ORDER BY created_at DESC")
    .all();
  const app = asked.application
    ? applications.find((item) => item.id === asked.application)
    : applications[0];
  if (!app) throw new NotFound("Application not found.");
  // Main first, so an application on its own resolves to its main
  // conversation and the selector lists side chats underneath it.
  const chats = database
    .prepare(
      "SELECT id, title, kind FROM conversations WHERE application_id = ? ORDER BY kind = 'main' DESC, created_at ASC",
    )
    .all(app.id);
  const chat = asked.chat
    ? chats.find((item) => item.id === asked.chat)
    : chats[0];
  if (!chat) throw new NotFound("Conversation not found.");
  return { applications, app, chats, chat };
}
function historyPath(app, chat) {
  return join(dirname(databasePath), "pi-sessions", app.id, `${chat.id}.jsonl`);
}
function version(path) {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}-${stat.size}`;
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}
function snapshot(view) {
  const conversation = database
    .prepare(
      "SELECT status, current_response_id FROM conversations WHERE id = ?",
    )
    .get(view.chat.id);
  const response = conversation?.current_response_id
    ? database
        .prepare("SELECT id, body, status FROM messages WHERE id = ?")
        .get(conversation.current_response_id)
    : null;
  let executions = [];
  if (response?.status === "running") {
    try {
      const executionPath = join(
        configRoot,
        "operator",
        view.app.id,
        "executions",
      );
      executions = readdirSync(executionPath)
        .filter((file) => /^[0-9a-f-]{36}\.json$/.test(file))
        .map((file) =>
          JSON.parse(readFileSync(join(executionPath, file), "utf8")),
        )
        .filter(
          (record) =>
            record.runId === response.id &&
            ["running", "awaiting-approval"].includes(record.status),
        )
        .map(({ id, tool, target, input, output, status }) => ({
          id,
          tool,
          target,
          input,
          output,
          status,
        }));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return {
    version: version(historyPath(view.app, view.chat)),
    application: view.app.name,
    conversation: view.chat.title,
    status: conversation?.status ?? "unavailable",
    response: response?.status === "running" ? response : null,
    executions,
  };
}
function escape(value) {
  return String(value).replace(
    /[&<>"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character],
  );
}
function choices(items, selected, label) {
  return items
    .map(
      (item) =>
        `<option value="${escape(item.id)}"${item.id === selected ? " selected" : ""}>${escape(label(item))}</option>`,
    )
    .join("");
}
function bar(view) {
  return `<header id="live-bar"><strong>Live conversation</strong><label class="live-pick">Application <select id="pick-application">${choices(
    view.applications,
    view.app.id,
    (item) => item.name,
  )}</select></label><label class="live-pick">Conversation <select id="pick-chat">${choices(
    view.chats,
    view.chat.id,
    (item) => (item.kind === "main" ? item.title : `${item.title} · side`),
  )}</select></label><span id="live-status" role="status">Connecting…</span><label><input id="follow-latest" type="checkbox" checked> Follow latest</label><button id="pause-live" type="button">Pause updates</button></header>`;
}
let cached = {};
let queue = Promise.resolve();
/** One export at a time: they share a single output file. */
function serially(work) {
  const result = queue.then(work, work);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
/**
 * The exported conversation with the live stylesheet and script linked.
 * Exporting is the slow step, so it is cached per conversation until the
 * recorded history changes. The live bar is left out and rendered per
 * request, so the selector stays current as applications come and go.
 */
function exported(app, chat, current) {
  const key = `${chat.id}:${current}`;
  return serially(async () => {
    if (cached.key === key) return cached.html;
    let html;
    if (current === "missing")
      html =
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Live conversation</title></head><body><div id="app"><main id="content"><div id="messages">History will appear when Pi starts responding.</div></main></div></body></html>';
    else {
      await exportFromFile(historyPath(app, chat), {
        outputPath: output,
        themeName: "dark",
      });
      chmodSync(output, 0o600);
      html = readFileSync(output, "utf8");
    }
    html = html
      .replace("</head>", '<link rel="stylesheet" href="/live.css"></head>')
      .replace("</body>", '<script src="/live.js"></script></body>');
    cached = { key, html };
    return html;
  });
}
async function historyHtml(view) {
  const current = version(historyPath(view.app, view.chat));
  const html = await exported(view.app, view.chat, current);
  return html.replace(
    "<body>",
    `<body data-history-version="${current}" data-application="${escape(view.app.id)}" data-chat="${escape(view.chat.id)}">${bar(view)}`,
  );
}
const server = createServer(async (request, response) => {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (
    !allowed.includes(request.headers.host) ||
    (request.headers.origin &&
      request.headers.origin !== `http://${request.headers.host}`)
  ) {
    response.writeHead(403);
    response.end("Local same-origin access only.");
    return;
  }
  if (request.method !== "GET") {
    response.writeHead(405);
    response.end("Read-only viewer.");
    return;
  }
  const url = new URL(request.url, `http://${request.headers.host}`);
  const path = url.pathname;
  try {
    let body, type;
    if (path === "/") {
      body = await historyHtml(chosen(url.searchParams));
      type = "text/html";
    } else if (path === "/state") {
      body = JSON.stringify(snapshot(chosen(url.searchParams)));
      type = "application/json";
    } else if (["/live.js", "/live.css"].includes(path)) {
      body = readFileSync(join(assets, path.slice(1)));
      type = path.endsWith(".js") ? "text/javascript" : "text/css";
    } else {
      response.writeHead(404);
      response.end("Not found.");
      return;
    }
    response.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    response.end(body);
  } catch (error) {
    if (error instanceof NotFound) {
      response.writeHead(404);
      response.end(error.message);
      return;
    }
    console.error(
      "Inspector could not read conversation state:",
      error.code ?? error.name,
    );
    response.writeHead(500);
    response.end(
      "Could not read conversation state. Check the inspector terminal.",
    );
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Live conversation: http://127.0.0.1:${port} — pick the application and conversation in the viewer, or open ?application=<id>&chat=<id>`,
  ),
);
