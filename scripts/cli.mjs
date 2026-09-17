// The `server-guy` command of an installation: start, stop and inspect the
// background service, and say how to reach it from another machine.
//
// One rule keeps it understandable: `start` means running now and after every
// restart of the machine, `stop` means stopped until the next `start`. There
// is no third state in which it is stopped now but comes back by itself.
//
// The service is the current user's own — a launchd agent on macOS, a systemd
// user unit on Linux — so nothing here needs root, and the service reads the
// same home directory the person does.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { forwardedPorts, installedPorts } from "./installed-ports.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
const data = resolve(
  process.env.SERVER_GUY_DATA_DIR?.trim() ||
    join(home, ".local", "share", "server-guy"),
);
const mac = process.platform === "darwin";
const LABEL = "com.server-guy";
const UNIT = "server-guy.service";
const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
const unit = join(home, ".config", "systemd", "user", UNIT);
const log = join(data, "logs", "service.log");
const domain = `gui/${userInfo().uid}`;

// A service does not inherit a shell's PATH, and Server Guy runs ssh, git and
// docker. The person's PATH at `start` is kept, ahead of the usual places.
const path = [
  ...new Set([
    ...(process.env.PATH ?? "").split(":").filter(Boolean),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]),
].join(":");

const environment = { PATH: path, SERVER_GUY_DATA_DIR: data };

// The installation's own settings, the port among them. The service reads the
// same file, so this command and the service cannot disagree about the port.
const settings = join(data, "server-guy.env");
if (existsSync(settings)) process.loadEnvFile(settings);

function run(command, args, { quiet = false } = {}) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0 && !quiet)
    throw new Error(
      `${command} ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`,
    );
  return result;
}

const xml = (value) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function launchdDefinition() {
  const variables = Object.entries(environment)
    .map(([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`)
    .join("\n      ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${xml(process.execPath)}</string>
      <string>${xml(join(app, "scripts", "serve.mjs"))}</string>
    </array>
    <key>WorkingDirectory</key><string>${xml(app)}</string>
    <key>EnvironmentVariables</key>
    <dict>
      ${variables}
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>${xml(log)}</string>
    <key>StandardErrorPath</key><string>${xml(log)}</string>
  </dict>
</plist>
`;
}

function systemdDefinition() {
  const quoted = (value) => `"${value.replace(/(["\\])/g, "\\$1")}"`;
  return `[Unit]
Description=Server Guy
After=network-online.target

[Service]
ExecStart=${quoted(process.execPath)} ${quoted(join(app, "scripts", "serve.mjs"))}
WorkingDirectory=${app}
${Object.entries(environment)
  .map(([key, value]) => `Environment=${quoted(`${key}=${value}`)}`)
  .join("\n")}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function loaded() {
  return mac
    ? run("launchctl", ["print", `${domain}/${LABEL}`], { quiet: true })
        .status === 0
    : run("systemctl", ["--user", "is-active", UNIT], { quiet: true })
        .status === 0;
}

function lingering() {
  return /Linger=yes/.test(
    run("loginctl", ["show-user", userInfo().username, "-p", "Linger"], {
      quiet: true,
    }).stdout ?? "",
  );
}

/** `launchctl bootout` returns before the job is gone; wait until it is. */
function unload() {
  if (!loaded()) return;
  run("launchctl", ["bootout", `${domain}/${LABEL}`], { quiet: true });
  for (let wait = 0; loaded() && wait < 100; wait++)
    spawnSync("sleep", ["0.2"]);
  if (loaded()) throw new Error("launchd did not stop Server Guy in time.");
}

function start() {
  mkdirSync(dirname(log), { recursive: true, mode: 0o700 });
  if (mac) {
    // launchd appends for ever; keep one previous log instead.
    if (existsSync(log) && statSync(log).size > 10 * 1024 * 1024)
      renameSync(log, `${log}.1`);
    mkdirSync(dirname(plist), { recursive: true });
    unload();
    writeFileSync(plist, launchdDefinition());
    run("launchctl", ["bootstrap", domain, plist]);
  } else {
    mkdirSync(dirname(unit), { recursive: true });
    writeFileSync(unit, systemdDefinition());
    run("systemctl", ["--user", "daemon-reload"]);
    run("systemctl", ["--user", "enable", UNIT]);
    run("systemctl", ["--user", "restart", UNIT]);
    // Without lingering a user's services stop when their last session ends,
    // which on a virtual machine is the moment they close SSH.
    if (!lingering())
      run("loginctl", ["enable-linger", userInfo().username], { quiet: true });
  }
  console.log("Server Guy is starting, and will start with this machine.");
  return status();
}

function stop() {
  if (mac) {
    unload();
    rmSync(plist, { force: true });
  } else if (existsSync(unit)) {
    run("systemctl", ["--user", "disable", "--now", UNIT], { quiet: true });
  }
  console.log(
    "Server Guy is stopped, and stays stopped until: server-guy start",
  );
}

async function answers(url) {
  // The interface takes a moment after the service manager reports it up.
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(2000),
      });
      await response.body?.cancel();
      return true;
    } catch {
      if (!loaded()) return false;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  return false;
}

/** The worker's own beat, read the way the interface reads it. */
function workerAlive() {
  try {
    const beat = JSON.parse(
      readFileSync(
        `${process.env.SERVER_GUY_DB_PATH ?? join(data, "server-guy.db")}.worker-status`,
        "utf8",
      ),
    );
    process.kill(beat.pid, 0);
    return Date.now() - Date.parse(beat.heartbeatAt) < 20_000;
  } catch {
    return false;
  }
}

async function status() {
  const url = `http://127.0.0.1:${installedPorts().web}`;
  const running = loaded();
  if (process.argv.includes("--quiet")) return running ? 0 : 1;
  const release = JSON.parse(
    readFileSync(join(app, "dist", "release.json"), "utf8"),
  );
  console.log(
    `Server Guy ${release.version} (${release.revision.slice(0, 7)})`,
  );
  if (!running) {
    console.log("  service    stopped; it does not start with this machine");
    console.log(`  state      ${data}`);
    return 1;
  }
  const up = await answers(url);
  // The worker writes its first beat a moment after the interface answers.
  for (let wait = 0; up && !workerAlive() && wait < 20; wait++)
    await new Promise((done) => setTimeout(done, 500));
  console.log(
    mac
      ? "  service    running; starts when you log in to this Mac"
      : `  service    running; starts when this machine boots${lingering() ? "" : " — once you log in. For boot without login run: sudo loginctl enable-linger " + userInfo().username}`,
  );
  console.log(`  interface  ${up ? url : "not answering yet"}`);
  console.log(`  Pi worker  ${workerAlive() ? "running" : "not running yet"}`);
  console.log(`  state      ${data}`);
  console.log(`  logs       server-guy logs`);
  if (!up) console.log("Look at `server-guy logs` for the reason.");
  return up ? 0 : 1;
}

function logs() {
  const follow = process.argv.includes("-f");
  const result = mac
    ? spawnSync(
        "tail",
        [follow ? "-f" : "-n", ...(follow ? [] : ["200"]), log],
        {
          stdio: "inherit",
        },
      )
    : spawnSync(
        "journalctl",
        [
          "--user",
          "-u",
          UNIT,
          "-n",
          "200",
          "--no-pager",
          ...(follow ? ["-f"] : []),
        ],
        { stdio: "inherit" },
      );
  return result.status ?? 0;
}

/**
 * What to put on the machine with the browser when Server Guy is on another.
 * Every port is forwarded to the same number because pages name them: the
 * terminal connects to 127.0.0.1 on its port, and a private application link
 * is http://127.0.0.1 on the port it was opened on.
 */
function remote() {
  const target = process.argv[3] ?? `${userInfo().username}@${hostname()}`;
  const [user, address] = target.includes("@")
    ? target.split("@")
    : [userInfo().username, target];
  const ports = installedPorts();
  console.log(`# Add to ~/.ssh/config on the machine with your browser:

Host server-guy
  HostName ${address}
  User ${user}
  ExitOnForwardFailure yes
  ServerAliveInterval 30
${forwardedPorts(ports)
  .map((port) => `  LocalForward ${port} 127.0.0.1:${port}`)
  .join("\n")}

# Then keep this running while you use Server Guy:
#   ssh -N server-guy
# and open http://127.0.0.1:${ports.web}
#
# ${ports.web} is the interface, ${ports.terminal} the browser terminal, and ${ports.privateFirst}-${ports.privateLast} are
# where private application links open. Server Guy listens on this machine's
# loopback only; this SSH connection is the only way in.`);
}

function uninstall() {
  stop();
  if (!mac) {
    rmSync(unit, { force: true });
    run("systemctl", ["--user", "daemon-reload"], { quiet: true });
  }
  rmSync(join(home, ".local", "bin", "server-guy"), { force: true });
  // This file is inside what it removes; Node has already read it.
  rmSync(resolve(app, ".."), { recursive: true, force: true });
  console.log(`Server Guy is removed. Everything it knew is kept:
  ${data}
  ${join(home, ".config", "server-guy")}
Installing again picks it all up. To discard it, delete those two directories.`);
}

const commands = {
  start,
  stop,
  restart: () => (stop(), start()),
  status,
  logs,
  remote,
  uninstall,
};
const command = process.argv[2];
if (Object.hasOwn(commands, command)) {
  try {
    process.exitCode = (await commands[command]()) ?? 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} else {
  console.log(`Usage: server-guy <command>

  start      run in the background now, and whenever this machine starts
  stop       stop, and stay stopped until the next start
  restart    stop, then start
  status     whether the service, the interface and the Pi worker are up
  logs [-f]  what the service has printed
  remote [user@host]
             SSH settings for using this installation from another machine
  uninstall  remove the program and the service; keep all state`);
  process.exitCode = command ? 1 : 0;
}
