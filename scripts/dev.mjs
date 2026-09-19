// Starts everything a development Hallvi needs: the application, the Pi
// worker that carries its conversations, and a Drizzle Studio on the same
// database.
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

import {
  environmentVariables,
  resolveEnvironment,
  WORKER_BUSY_EXIT,
} from "./dev-environment.mjs";
const resolved = resolveEnvironment();
const shared = environmentVariables(resolved);
const preferred = Number(process.env.HALLVI_STUDIO_PORT ?? 4983);

function available(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
}

// Other checkouts run their own studios. Taking the next free port keeps this
// one on this database instead of leaving the link pointing at theirs.
async function studioPort() {
  for (let port = preferred; port < preferred + 20; port++)
    if (await available(port)) return port;
  return undefined;
}

// A studio is a convenience; the application is the point. Without a port the
// application starts anyway and simply offers no Database link.
const port = await studioPort();
if (port) console.log(`Studio on port ${port}, reading ${resolved.database}`);
else console.warn(`No free studio port from ${preferred}: no Database link.`);

/** Children this launcher started, and therefore the only ones it may stop. */
const children = new Set();
let stopping = false;

function start(args, extra = {}) {
  const child = spawn(process.execPath, args, {
    stdio: "inherit",
    env: { ...process.env, ...shared, ...extra },
  });
  children.add(child);
  child.on("exit", () => children.delete(child));
  return child;
}

function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal));

const next = start(
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    ...process.argv.slice(2),
  ],
  // The Database link addresses the studio started above, or is absent.
  { HALLVI_STUDIO_PORT: port ? String(port) : "" },
);
next.on("exit", (code) => {
  stop("SIGTERM");
  process.exitCode ??= code ?? 1;
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
function startWorker() {
  const worker = start(["--import", "tsx", "src/worker.ts"]);
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
