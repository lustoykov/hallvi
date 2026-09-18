// Local real-Pi rig: Hallvi's own web app, worker, SQLite records, Pi
// runtime, workspace, Compose resolver, registry pinning and executor, run from
// a copy of this checkout with stand-ins at external boundaries only:
//   - GitHub API (stand-ins/github-api.ts): exact mirrors of public
//     repositories at pinned commits; other public repositories pass through
//     to GitHub read-only and unauthenticated.
//   - Hetzner API (stand-ins/hetzner.ts): a provider that "creates" a server
//     at 127.0.0.1 and keeps its state in the rig directory.
//   - SSH (bin/ssh, first on PATH). Rig A runs each host command with this
//     machine's shell and Docker engine, mapping /opt/hallvi and
//     /run/lock into the rig directory (bin/flock and bin/timeout emulate
//     util-linux and coreutils), and stands-ins/native-compose.ts binds
//     published listeners to loopback, the provider firewall's role. Rig B
//     (--host-container) runs each command unchanged as root in a Linux host
//     container with systemd and its own dockerd (tests/rig/host).
// Retained snapshots, facts and scope checks keep what Pi authored. The
// checkout itself is never modified; the copy, records and host files live
// under tests/results/rig/<name>, which Git ignores. Only the Pi settings file
// is copied; the credential it names is read in place by Pi's runtime.
//
// Usage:
//   SG_RIG_PI_SETTINGS=<pi-settings.json> node tests/rig/rig.mjs <name> <port>
//     [--state-from <another rig root>]   replay: copy records and host files
//     [--host-container <container>]      Rig B: tests/rig/host/start.mjs
import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
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
    "Usage: node tests/rig/rig.mjs <name> <port> [--state-from <dir>] [--host-container <name>]",
  );
const option = (flag) => {
  const index = rest.indexOf(flag);
  return index >= 0 ? rest[index + 1] : null;
};
const port = Number(portText);
const from = option("--state-from") ? resolve(option("--state-from")) : null;
const hostContainer = option("--host-container");
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

// The source is copied on EVERY start, not only a fresh one.
//
// It used to be copied once, when the rig directory was created, and that
// made the rig quietly dishonest: a restart went on serving the snapshot
// taken days earlier, so a page checked in a browser could show behaviour
// from code that no longer existed and a fix could look like it had not
// landed. Recorded state and the host container are what make a restart
// cheap, and those are deliberately left alone below — it is only the
// application source that is refreshed, which takes a moment and removes a
// whole class of false evidence.
{
  mkdirSync(app, { recursive: true });
  // Removed rather than merged, so a file deleted upstream does not live on
  // in the copy and keep being served.
  rmSync(join(app, "src"), { recursive: true, force: true });
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
  if (!existsSync(join(app, "node_modules")))
    symlinkSync(join(source, "node_modules"), join(app, "node_modules"), "dir");
  cpSync(
    join(rig, "stand-ins/github-api.ts.txt"),
    join(app, "src/server/github-api.ts"),
  );
  cpSync(
    join(rig, "stand-ins/hetzner.ts.txt"),
    join(app, "src/server/hetzner.ts"),
  );
  // A real host container publishes through its own port mapping instead.
  if (!hostContainer) {
    renameSync(
      join(app, "src/server/native-compose.ts"),
      join(app, "src/server/native-compose-real.ts"),
    );
    cpSync(
      join(rig, "stand-ins/native-compose.ts.txt"),
      join(app, "src/server/native-compose.ts"),
    );
  }
  // Rewritten on every start, because it answers "what is this rig serving?"
  // and that changes when the source is refreshed.
  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify(
      {
        sourceCopiedAt: new Date().toISOString(),
        createdFresh: fresh,
        commit: git("rev-parse", "HEAD"),
        localChanges: git("status", "--porcelain") !== "",
        replayedFrom: from,
        hostContainer,
        standIns: [
          "github-api.ts",
          "hetzner.ts",
          ...(hostContainer
            ? [`bin/ssh → docker exec ${hostContainer}`]
            : ["native-compose.ts", "bin/ssh", "bin/flock", "bin/timeout"]),
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
      slug: "rig-hallvi",
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
  HALLVI_DB_PATH: join(state, "hallvi.db"),
  HALLVI_LOG_DIR: join(state, "diagnostics"),
  HALLVI_CONFIG_DIR: state,
  PI_CODING_AGENT_DIR: agent,
  HALLVI_GITHUB_CLIENT_ID: "Iv1.rig",
  HALLVI_GITHUB_APP_SLUG: "rig-hallvi",
  NEXT_TELEMETRY_DISABLED: "1",
  HALLVI_TRACING: "0",
  SG_RIG_MIRROR_DIR: join(results, "upstream"),
  SG_RIG_HOST_ROOT: host,
  // With a real sshd published by host/ssh.mjs, the shims stop emulating SSH
  // and run the real client against it, so the product's host-key pinning,
  // key authentication and port forwarding are its own.
  ...(process.env.SG_RIG_SSH_PORT
    ? { SG_RIG_SSH_PORT: process.env.SG_RIG_SSH_PORT }
    : {}),
  ...(hostContainer ? { SG_RIG_HOST_CONTAINER: hostContainer } : {}),
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

console.log(
  JSON.stringify({ root, port, fresh, replayedFrom: from, hostContainer }),
);
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
