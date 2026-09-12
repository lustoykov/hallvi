// The transport the browser terminal attaches to.
//
// A WebSocket needs to own its connection for as long as the shell lives, which
// an ordinary route handler cannot do, so the bridge runs its own loopback
// server inside the controller process. No shell is spawned before a browser
// presents a one-use capability that the application endpoint issued for its
// own origin, application and size.

import { createServer, type Server } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

import {
  TerminalSession,
  hostFor,
  readSize,
  type Size,
  type TerminalTarget,
} from "./terminal-session";

const TICKET_MS = 20_000;
const HEARTBEAT_MS = 15_000;
const SILENCE_MS = 45_000;

interface Ticket {
  value: string;
  applicationId: string;
  origin: string;
  size: Size;
  expires: number;
}

interface Bridge {
  server: Server;
  sockets: WebSocketServer;
  port: number;
  tickets: Map<string, Ticket>;
  sessions: Map<string, TerminalSession>;
}

// Next re-evaluates modules on reload; the bridge must outlive that.
const store = globalThis as unknown as { __sgTerminal?: Promise<Bridge> };

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function start(): Promise<Bridge> {
  const server = createServer((_request, response) => {
    response.writeHead(426).end("This endpoint speaks WebSocket only.");
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });
  const bridge: Bridge = {
    server,
    sockets,
    port: 0,
    tickets: new Map(),
    sessions: new Map(),
  };

  server.on("upgrade", (request, socket, head) => {
    const refuse = (code: number, reason: string) => {
      socket.write(`HTTP/1.1 ${code} ${reason}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    let url: URL;
    try {
      url = new URL(request.url ?? "/", "http://127.0.0.1");
    } catch {
      return refuse(400, "Bad Request");
    }
    if (url.pathname !== "/terminal") return refuse(404, "Not Found");
    const presented = url.searchParams.get("ticket") ?? "";
    const ticket = bridge.tickets.get(presented);
    // One use, and only ever from the origin the endpoint issued it to.
    if (!ticket || !equal(ticket.value, presented))
      return refuse(401, "Unauthorized");
    bridge.tickets.delete(presented);
    if (ticket.expires < Date.now()) return refuse(401, "Unauthorized");
    if ((request.headers.origin ?? "") !== ticket.origin)
      return refuse(403, "Forbidden");

    sockets.handleUpgrade(request, socket, head, (socketConnection) =>
      open(bridge, socketConnection, ticket),
    );
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  bridge.port = typeof address === "object" && address ? address.port : 0;
  return bridge;
}

function bridge() {
  store.__sgTerminal ??= start();
  return store.__sgTerminal;
}

function refuse(socket: WebSocket, detail: string) {
  socket.send(
    JSON.stringify({
      type: "state",
      state: { name: "failed", failure: "credentials", detail },
    }),
  );
  socket.close(1000);
}

function open(state: Bridge, socket: WebSocket, ticket: Ticket) {
  // Resolving the target can fail — a removed application, unreadable
  // settings. That is an answer to this socket, never a throw inside the
  // upgrade handler, which would take the whole bridge down.
  let host: ReturnType<typeof hostFor>;
  try {
    host = hostFor(ticket.applicationId);
  } catch {
    return refuse(
      socket,
      "This application could not be read, so no shell was started.",
    );
  }
  if (!host) {
    return refuse(socket, "No server is connected to this application.");
  }

  const id = randomBytes(16).toString("hex");
  const session = new TerminalSession(
    id,
    ticket.applicationId,
    host,
    ticket.size,
  );
  state.sessions.set(id, session);

  const listener = {
    output: (chunk: Buffer) => {
      if (socket.readyState === socket.OPEN)
        socket.send(chunk, { binary: true });
    },
    state: (value: unknown) => {
      if (socket.readyState === socket.OPEN)
        socket.send(JSON.stringify({ type: "state", state: value }));
    },
  };
  socket.send(
    JSON.stringify({
      type: "ready",
      id,
      target: session.target satisfies TerminalTarget,
    }),
  );
  session.attach(listener);

  let alive = true;
  socket.on("pong", () => (alive = true));
  const heartbeat = setInterval(() => {
    if (!session.checkTarget()) return socket.close(1000);
    if (!alive) return socket.terminate();
    alive = false;
    socket.ping();
  }, HEARTBEAT_MS);
  // A half-open connection must not keep a shell alive forever.
  const silence = setTimeout(() => socket.terminate(), SILENCE_MS);
  socket.on("pong", () => silence.refresh());

  socket.on("message", (data, isBinary) => {
    silence.refresh();
    if (!session.checkTarget()) return socket.close(1000);
    if (isBinary) return session.write(data as Buffer);
    let message: { type?: string; size?: unknown };
    try {
      message = JSON.parse(String(data));
    } catch {
      return;
    }
    if (message.type === "resize") {
      const size = readSize(message.size);
      if (size) session.resize(size);
      return;
    }
    if (message.type === "disconnect") socket.close(1000);
  });

  const finish = () => {
    clearInterval(heartbeat);
    clearTimeout(silence);
    session.detach(listener);
    session.dispose();
    state.sessions.delete(id);
  };
  socket.on("close", finish);
  socket.on("error", finish);
}

/** Issues the one-use capability a browser needs before any shell exists. */
export async function issueTerminalTicket(input: {
  applicationId: string;
  origin: string;
  size: Size;
}) {
  const state = await bridge();
  const now = Date.now();
  for (const [key, value] of state.tickets)
    if (value.expires < now) state.tickets.delete(key);
  const value = randomBytes(32).toString("hex");
  state.tickets.set(value, { ...input, value, expires: now + TICKET_MS });
  return { ticket: value, port: state.port, expiresInMs: TICKET_MS };
}

/** For tests: the live session count, so disposal can be asserted. */
export async function terminalSessionCount() {
  return (await bridge()).sessions.size;
}
