// Starts the application and, beside it, a Drizzle Studio on the same
// database.
//
// SQLite is a file, not a service: starting the application opens
// `.server-guy/server-guy.db` and starts nothing you could browse. Studio is
// a separate process that serves whichever database its own environment
// resolves, so one started by hand in another checkout will happily show you
// another checkout's rows. Starting it here, from this environment, is what
// makes the application's Database link open the rows the application is
// using.
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

// `.server-guy/server-guy.db` unless this controller was pointed elsewhere.
// Naming the file rather than letting the studio resolve its own is what
// makes the two agree: the studio opens what the application opened, and the
// line printed below says which file that was.
const database = resolve(
  process.env.SERVER_GUY_DB_PATH ?? ".server-guy/server-guy.db",
);
const preferred = Number(process.env.SERVER_GUY_STUDIO_PORT ?? 4983);

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
if (port) console.log(`Studio on port ${port}, reading ${database}`);
else console.warn(`No free studio port from ${preferred}: no Database link.`);
const children = [
  spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--hostname",
      "127.0.0.1",
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        SERVER_GUY_STUDIO_PORT: port ? String(port) : "",
      },
    },
  ),
];
if (port)
  children.push(
    spawn(
      process.execPath,
      [
        "node_modules/drizzle-kit/bin.cjs",
        "studio",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        stdio: "inherit",
        env: { ...process.env, SERVER_GUY_DB_PATH: database },
      },
    ),
  );

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill(signal);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => stop(signal));
for (const child of children)
  child.on("exit", (code) => {
    stop("SIGTERM");
    process.exitCode ??= code ?? 1;
  });
