// Local real-Pi rig: Server Guy's own web app, worker, SQLite records, Pi
// runtime, workspace, Compose resolver, registry pinning and executor, run from
// a copy of this checkout with stand-ins at external boundaries only:
//   - GitHub API (stand-ins/github-api.ts): exact mirrors of public
//     repositories at pinned commits; other public repositories pass through
//     to GitHub read-only and unauthenticated.
//   - Hetzner API (stand-ins/hetzner.ts): a provider that "creates" a server
//     at 127.0.0.1 and keeps its state in the rig directory.
//   - SSH (bin/ssh, first on PATH): runs each host command with this
//     machine's shell and Docker engine, mapping /opt/server-guy and
//     /run/lock into the rig directory. bin/flock emulates util-linux flock.
// Transport only: stand-ins/native-compose.ts binds published listeners to
// loopback, the provider firewall's role. Retained snapshots, facts and scope
// checks keep what Pi authored. The checkout itself is never modified; the
// copy, records and host files live under tests/results/rig/<name>, which Git
// ignores. Only the Pi settings file is copied; the credential it names is
// read in place by Pi's runtime.
//
// Usage:
//   SG_RIG_PI_SETTINGS=<pi-settings.json> node tests/rig/rig.mjs <name> <port>
//     [--state-from <another rig root>]   replay: copy records and host files
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const rig = dirname(fileURLToPath(import.meta.url));
const source = resolve(rig, "../..");
const [name, portText, ...rest] = process.argv.slice(2);
if (!name || !/^[a-z0-9-]+$/.test(name) || !portText)
  throw new Error(
    "Usage: node tests/rig/rig.mjs <name> <port> [--state-from <dir>]",
  );
const port = Number(portText);
const from = rest[0] === "--state-from" ? resolve(rest[1]) : null;
const results = join(source, "tests/results/rig");
const root = join(results, name);
const app = join(root, "app");
const state = join(root, "state");
const host = join(root, "host");
const agent = join(root, "pi-agent");
const logs = join(root, "logs");
const fresh = !existsSync(app);
if (fresh && from) {
  // Replay: the earlier rig's records and host files, never its app copy.
  cpSync(join(from, "state"), state, { recursive: true });
  cpSync(join(from, "host"), host, { recursive: true });
}
for (const directory of [root, state, host, agent, logs])
  mkdirSync(directory, { recursive: true });

const git = (...args) =>
  execFileSync("git", ["-C", source, ...args], { encoding: "utf8" }).trim();
if (fresh) {
  mkdirSync(app, { recursive: true });
  for (const entry of [
    "src",
    "scripts",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json",
    "drizzle.config.ts",
  ])
    cpSync(join(source, entry), join(app, entry), { recursive: true });
  symlinkSync(join(source, "node_modules"), join(app, "node_modules"), "dir");
  cpSync(
    join(rig, "stand-ins/github-api.ts.txt"),
    join(app, "src/server/github-api.ts"),
  );
  cpSync(
    join(rig, "stand-ins/hetzner.ts.txt"),
    join(app, "src/server/hetzner.ts"),
  );
  renameSync(
    join(app, "src/server/native-compose.ts"),
    join(app, "src/server/native-compose-real.ts"),
  );
  cpSync(
    join(rig, "stand-ins/native-compose.ts.txt"),
    join(app, "src/server/native-compose.ts"),
  );
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        commit: git("rev-parse", "HEAD"),
        localChanges: git("status", "--porcelain") !== "",
        replayedFrom: from,
        standIns: [
          "github-api.ts",
          "hetzner.ts",
          "native-compose.ts",
          "bin/ssh",
          "bin/flock",
        ],
      },
      null,
      2,
    ),
  );
}
if (!existsSync(join(state, "github-connection.json")))
  writeFileSync(
    join(state, "github-connection.json"),
    JSON.stringify({
      id: "00000000-0000-4000-8000-00000000a0d1",
      mode: "app",
      clientId: "Iv1.rig",
      slug: "rig-server-guy",
      token: "ghu_RIG-SYNTHETIC",
      expiresAt: null,
      account: { id: 42, login: "rig-owner" },
      connectedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
if (!existsSync(join(state, "pi-settings.json"))) {
  const settings = process.env.SG_RIG_PI_SETTINGS;
  if (!settings || !existsSync(settings))
    throw new Error("Set SG_RIG_PI_SETTINGS to a saved pi-settings.json.");
  cpSync(settings, join(state, "pi-settings.json"));
}

const env = {
  ...process.env,
  SERVER_GUY_DB_PATH: join(state, "server-guy.db"),
  SERVER_GUY_LOG_DIR: join(state, "diagnostics"),
  SERVER_GUY_CONFIG_DIR: state,
  PI_CODING_AGENT_DIR: agent,
  SERVER_GUY_GITHUB_CLIENT_ID: "Iv1.rig",
  SERVER_GUY_GITHUB_APP_SLUG: "rig-server-guy",
  NEXT_TELEMETRY_DISABLED: "1",
  SERVER_GUY_TRACING: "0",
  SG_RIG_MIRROR_DIR: join(results, "upstream"),
  SG_RIG_HOST_ROOT: host,
  PATH: `${join(rig, "bin")}:${process.env.PATH}`,
};
for (const key of Object.keys(env))
  if (
    /(?:LANGFUSE|OTEL)|(?:API_KEY|AUTH_TOKEN|ACCESS_TOKEN|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY)$/.test(
      key,
    ) ||
    key === "DOCKER_DEFAULT_PLATFORM"
  )
    delete env[key];
if (fresh)
  execFileSync("npm", ["run", "db:push", "--silent"], {
    cwd: app,
    env,
    stdio: "pipe",
  });

let stopping = false;
const children = [];
function launch(label, args) {
  const log = createWriteStream(join(logs, `${label}.log`), { flags: "a" });
  const child = spawn(process.execPath, args, {
    cwd: app,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      log.write(chunk);
      process.stdout.write(`[${label}] ${chunk}`);
    });
  child.on("exit", (code, signal) => {
    log.write(`\n[rig] ${label} exited code=${code} signal=${signal}\n`);
    if (!stopping) shutdown("SIGTERM");
  });
  children.push(child);
}
function shutdown(signal) {
  stopping = true;
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal);
  const wait = setInterval(() => {
    if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) {
      clearInterval(wait);
      process.exit(0);
    }
  }, 200);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => shutdown(signal));

console.log(JSON.stringify({ root, port, fresh, replayedFrom: from }));
launch("worker", ["--import", "tsx", "src/worker.ts"]);
launch("next", [
  join(source, "node_modules/next/dist/bin/next"),
  "dev",
  "--webpack",
  "--hostname",
  "127.0.0.1",
  "--port",
  String(port),
]);
