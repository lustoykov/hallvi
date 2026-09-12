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
import { exportFromFile } from "../node_modules/@earendil-works/pi-coding-agent/dist/core/export-html/index.js";

const { values } = parseArgs({
  options: {
    application: { type: "string" },
    chat: { type: "string" },
    port: { type: "string", default: "3001" },
  },
});
for (const id of [values.application, values.chat].filter(Boolean))
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id))
    throw new Error("Invalid application or conversation ID.");
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid port.");
const databasePath = resolve(
  process.env.SERVER_GUY_DB_PATH ?? ".server-guy/server-guy.db",
);
const database = new Database(databasePath, {
  readonly: true,
  fileMustExist: true,
});
const app = values.application
  ? database
      .prepare("SELECT id, name FROM applications WHERE id = ?")
      .get(values.application)
  : database
      .prepare(
        "SELECT id, name FROM applications ORDER BY created_at DESC LIMIT 1",
      )
      .get();
if (!app) throw new Error("Application not found.");
const chat = values.chat
  ? database
      .prepare(
        "SELECT id, title FROM conversations WHERE application_id = ? AND id = ?",
      )
      .get(app.id, values.chat)
  : database
      .prepare(
        "SELECT id, title FROM conversations WHERE application_id = ? AND kind = 'main'",
      )
      .get(app.id);
if (!chat) throw new Error("Conversation not found.");
const historyPath = join(
  dirname(databasePath),
  "pi-sessions",
  app.id,
  `${chat.id}.jsonl`,
);
const executionPath = join(
  resolve(process.env.SERVER_GUY_CONFIG_DIR ?? ".server-guy"),
  "operator",
  app.id,
  "executions",
);
const assets = join(dirname(fileURLToPath(import.meta.url)), "inspection");
const output = join(
  mkdtempSync(join(tmpdir(), "sg-live-inspection-")),
  "history.html",
);
function version() {
  try {
    const stat = statSync(historyPath);
    return `${stat.mtimeMs}-${stat.size}`;
  } catch (error) {
    if (error.code === "ENOENT") return "missing";
    throw error;
  }
}
function snapshot() {
  const conversation = database
    .prepare(
      "SELECT status, current_response_id FROM conversations WHERE id = ?",
    )
    .get(chat.id);
  const response = conversation?.current_response_id
    ? database
        .prepare("SELECT id, body, status FROM messages WHERE id = ?")
        .get(conversation.current_response_id)
    : null;
  let executions = [];
  if (response?.status === "running") {
    try {
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
    version: version(),
    application: app.name,
    conversation: chat.title,
    status: conversation?.status ?? "unavailable",
    response: response?.status === "running" ? response : null,
    executions,
  };
}
let cachedVersion;
let cachedHtml;
let exporting;
async function historyHtml() {
  if (exporting) await exporting;
  const current = version();
  if (cachedVersion === current) return cachedHtml;
  exporting = (async () => {
    let html;
    if (current === "missing")
      html =
        '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Live conversation</title></head><body><div id="app"><main id="content"><div id="messages">History will appear when Pi starts responding.</div></main></div></body></html>';
    else {
      await exportFromFile(historyPath, {
        outputPath: output,
        themeName: "dark",
      });
      chmodSync(output, 0o600);
      html = readFileSync(output, "utf8");
    }
    html = html
      .replace("</head>", '<link rel="stylesheet" href="/live.css"></head>')
      .replace(
        "<body>",
        `<body data-history-version="${current}"><header id="live-bar"><strong>Live conversation</strong><span id="live-status" role="status">Connecting…</span><label><input id="follow-latest" type="checkbox" checked> Follow latest</label><button id="pause-live" type="button">Pause updates</button></header>`,
      )
      .replace("</body>", '<script src="/live.js"></script></body>');
    cachedHtml = html;
    cachedVersion = current;
  })();
  try {
    await exporting;
  } finally {
    exporting = undefined;
  }
  return cachedHtml;
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
  const path = new URL(request.url, `http://${request.headers.host}`).pathname;
  try {
    let body, type;
    if (path === "/") {
      body = await historyHtml();
      type = "text/html";
    } else if (path === "/state") {
      body = JSON.stringify(snapshot());
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
    `Live conversation: http://127.0.0.1:${port} — ${app.name} / ${chat.title}`,
  ),
);
