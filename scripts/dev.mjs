// Starts a paired development application and testing dashboard, plus the Pi
// worker and a Drizzle Studio on the same database.
//
// The worker was a second terminal, and forgetting it was invisible in the
// product: a message was accepted, sat in the queue, and looked exactly like
// a reply being written. It is started here, from one resolved environment, so
// the three processes cannot disagree about which database they are on.
//
// It stays a separate process. It holds an exclusive lock, it drains the model
// adapter before releasing it, and a crash must take its own process with it
// rather than a thread inside the web server. `npm run worker` still starts one
// on its own for debugging.
//
// SQLite is a file, not a service: starting the application opens the database
// and starts nothing you could browse. Studio is a separate process that serves
// whichever database its own environment resolves, so one started by hand in
// another checkout will happily show you another checkout's rows. Starting it
// here, from this environment, is what makes the application's Database link
// open the rows the application is using.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import {
  environmentVariables,
  resolveEnvironment,
  WORKER_BUSY_EXIT,
} from "./dev-environment.mjs";
import {
  DETACH_FORCED_EXIT,
  drainWorker,
  retainedRefusal,
  stopRequest,
} from "./retained-state.mjs";
import { holdWorker } from "./worker-socket.mjs";
const resolved = resolveEnvironment();
// A retained application's records are opened by the runtime attached to them
// and by nothing else; the studio below would open them writable, so this is
// decided before any child starts.
const refusal = retainedRefusal(resolved.database);
if (refusal) {
  console.error(refusal);
  process.exit(2);
}
const shared = environmentVariables(resolved);
const nextArgs = process.argv.slice(2);
/**
 * Started by `retained-application.mjs attach`: this pair is a retained
 * application's runtime, and stopping it is a detach. The children then get
 * their own process group, so the terminal's Ctrl-C reaches the attach
 * command and this launcher, which stop them in order, rather than every
 * process at once.
 */
const attached = Boolean(process.env.HALLVI_RUNTIME_ID);
/** How long a detach waits for Pi to finish what it is doing. */
const DETACH_LIMIT_MS = 5 * 60_000;

function portNumber(value, label) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(`${label} must be a TCP port from 1 to 65535.`);
  return port;
}

function commandPort(args) {
  for (let index = args.length - 1; index >= 0; index--) {
    const arg = args[index];
    if (arg.startsWith("--port=")) return arg.slice("--port=".length);
    if (arg === "--port" || arg === "-p") return args[index + 1];
  }
  return undefined;
}

function available(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

async function freePort(preferred) {
  for (let port = preferred; port <= Math.min(preferred + 19, 65535); port++)
    if (await available(port)) return port;
  return undefined;
}

// A configured app port is an identity: failing is safer than silently linking
// the dashboard to a different controller. Unconfigured worktrees take the next
// free port, so several paired runs can coexist.
const requestedAppPort = commandPort(nextArgs) ?? process.env.PORT;
const appPreferred = portNumber(requestedAppPort ?? 3000, "App port");
const appPort = requestedAppPort
  ? (await available(appPreferred)) && appPreferred
  : await freePort(appPreferred);
if (!appPort) throw new Error(`App port ${appPreferred} is unavailable.`);

const dashboardPreferred = portNumber(
  process.env.HALLVI_DASHBOARD_PORT ?? 4317,
  "Dashboard port",
);
const dashboardPort = process.env.HALLVI_DASHBOARD_PORT
  ? (await available(dashboardPreferred)) && dashboardPreferred
  : await freePort(dashboardPreferred);
if (!dashboardPort)
  throw new Error(`Dashboard port ${dashboardPreferred} is unavailable.`);

console.log(`Hallvi: http://127.0.0.1:${appPort}`);
console.log(`Developer dashboard: http://127.0.0.1:${dashboardPort}`);

// A studio is a convenience; the application is the point. Without a port the
// application starts anyway and simply offers no Database link.
const preferred = portNumber(
  process.env.HALLVI_STUDIO_PORT ?? 4983,
  "Studio port",
);
const port = await freePort(preferred);
if (port) console.log(`Studio on port ${port}, reading ${resolved.database}`);
else console.warn(`No free studio port from ${preferred}: no Database link.`);

/** Children this launcher started, and therefore the only ones it may stop. */
const children = new Set();
let stopping = false;

function start(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...shared, ...extra },
    detached: attached,
  });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (attached && !stopping)
      console.warn(
        `${args.at(-1)?.endsWith("worker.ts") ? "The worker" : `${args[0]}`} exited ${signal ? `on ${signal}` : `with code ${code}`}.`,
      );
  });
  return child;
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}

/**
 * Detaching, in order: the interface stops first, so nothing new is accepted;
 * the worker is asked to hold — it refuses new work and says how much it has
 * in hand — and is stopped once that is nothing, or once the wait has gone on
 * long enough that the person asking has presumably given up on it. Pi keeps
 * whatever a stopped worker was doing, and the exit code says whether the
 * stop was clean: it is not when work was still going on, and not when the
 * worker's status could not be read, because "not known" is not "nothing".
 *
 * A second Ctrl-C stops the worker at once. Only the terminal's own signal
 * counts as that: the attach command forwards a SIGTERM to this launcher on
 * the same Ctrl-C, and a forwarded copy of the first request is not a
 * second one.
 */
let forced = false;
let detaching;
function detach(signal) {
  const request = stopRequest(Boolean(detaching), signal);
  if (request === "ignore") return;
  if (request === "force") {
    console.warn("Stopping the worker without waiting for its work to end.");
    forced = true;
    for (const child of children) child.kill("SIGTERM");
    return;
  }
  stopping = true;
  console.warn(
    `Detaching on ${signal}: the interface stops now, the worker once it is idle.`,
  );
  detaching = (async () => {
    for (const child of children) if (child !== worker) child.kill("SIGTERM");
    const outcome = await drainWorker(() => holdWorker(resolved.database), {
      limitMs: DETACH_LIMIT_MS,
      forced: () => forced,
      say: (line) => console.warn(line),
      wait: (ms) => delay(ms),
    });
    if (outcome !== "idle") forced = true;
    worker?.kill("SIGTERM");
    // A worker whose status could not be read may not be answering signals
    // either; the stop is already recorded as unclean, so it is not left to
    // hold the records for ever.
    const grace = Date.now() + 15_000;
    while (children.size) {
      if (Date.now() > grace)
        for (const child of children) child.kill("SIGKILL");
      await delay(100);
    }
    process.exitCode = forced ? DETACH_FORCED_EXIT : 0;
  })();
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => (attached ? detach(signal) : stop(signal)));

const next = start(
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    ...nextArgs,
    "--port",
    String(appPort),
  ],
  {
    HALLVI_STUDIO_PORT: port ? String(port) : "",
    NEXT_PUBLIC_HALLVI_STUDIO_PORT: port ? String(port) : "",
    NEXT_PUBLIC_HALLVI_DASHBOARD_PORT: String(dashboardPort),
  },
);
next.on("exit", (code) => {
  stop("SIGTERM");
  process.exitCode ??= code ?? 1;
});

const dashboard = start(
  ["--experimental-strip-types", "tests/dashboard/server.ts"],
  {
    HALLVI_DASHBOARD_PORT: String(dashboardPort),
    HALLVI_DEV_APP_PORT: String(appPort),
  },
);
dashboard.on("exit", (code) => {
  if (stopping) return;
  console.error(
    "The developer dashboard stopped; stopping this development pair.",
  );
  stop("SIGTERM");
  process.exitCode ??= code || 1;
});

if (port) {
  const studio = start([
    "node_modules/drizzle-kit/bin.cjs",
    "studio",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
  ]);
  studio.on("exit", (code) => {
    stop("SIGTERM");
    process.exitCode ??= code ?? 1;
  });
}

/**
 * The worker, and what to do when it stops.
 *
 * Three cases, and they want different answers. A worker that stepped aside
 * for a live one is not a failure at all: something is reading the queue, and
 * killing the application over it would be absurd. A worker that crashed gets
 * one restart, said out loud, because the common causes are momentary. A
 * second exit is a real fault, and leaving the application up in front of a
 * queue nobody reads is the state this whole change exists to remove — so the
 * launcher stops the children it started and exits non-zero.
 */
let restarted = false;
let worker;
function startWorker() {
  worker = start(["--import", "tsx", "src/worker.ts"]);
  worker.on("exit", (code, signal) => {
    if (stopping) return;
    if (code === WORKER_BUSY_EXIT) {
      console.warn(
        "Another Pi worker already serves this database; leaving it to that one.",
      );
      return;
    }
    // Stopped cleanly without being asked to: somebody stopped this worker on
    // purpose, usually to run their own. Restarting would fight them, and the
    // conversation already says no worker is running.
    if (code === 0) {
      console.warn(
        "The Pi worker stopped. Conversations say so until one starts again; `npm run worker` starts one.",
      );
      return;
    }
    // A signal is a crash too: killed, out of memory, segfaulted. Reading it
    // as a deliberate stop is how a launcher ends up quietly leaving a queue
    // with nobody on it.
    const how = signal ? `on ${signal}` : `with code ${code}`;
    if (!restarted) {
      restarted = true;
      console.warn(
        `The Pi worker exited ${how}. Starting it once more; conversations wait until it is back.`,
      );
      startWorker();
      return;
    }
    console.error(
      `The Pi worker exited ${how} again. Stopping the application rather than leaving it unable to accept a message.`,
    );
    stop("SIGTERM");
    process.exitCode ??= code ?? 1;
  });
}
startWorker();
