// The `hallvi` command of an installation: start, stop and inspect the
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
import { connect } from "node:net";
import { homedir, hostname, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { forwardedPorts, installedPorts } from "./installed-ports.mjs";
import {
  piAccountLocation,
  stateFiles,
  stateLocation,
} from "./state-location.mjs";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = homedir();
let state;
try {
  const chosen = process.env.HALLVI_DATA_DIR?.trim();
  state = chosen
    ? stateFiles(resolve(chosen))
    : stateLocation(join(home, ".local", "share"));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const data = state.directory;
const mac = process.platform === "darwin";
const LABEL = "com.hallvi";
const UNIT = "hallvi.service";
const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
const unit = join(home, ".config", "systemd", "user", UNIT);
const log = join(data, "logs", "service.log");
const domain = `gui/${userInfo().uid}`;

// A service does not inherit a shell's PATH, and Hallvi runs ssh, git and
// docker. The person's PATH at `start` is kept, ahead of the usual places.
const path = [
  ...new Set([
    join(app, "..", "node", "bin"),
    ...(process.env.PATH ?? "").split(":").filter(Boolean),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ]),
].join(":");

const environment = {
  PATH: path,
  HALLVI_DATA_DIR: data,
  HALLVI_MANAGED_SERVICE: "1",
};

// The installation's own settings, the port among them. The service reads the
// same file, so this command and the service cannot disagree about the port.
if (existsSync(state.settings)) process.loadEnvFile(state.settings);

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
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key><false/>
    </dict>
    <key>StandardOutPath</key><string>${xml(log)}</string>
    <key>StandardErrorPath</key><string>${xml(log)}</string>
  </dict>
</plist>
`;
}

function systemdDefinition() {
  const quoted = (value) => `"${value.replace(/(["\\])/g, "\\$1")}"`;
  return `[Unit]
Description=Hallvi

[Service]
ExecStart=${quoted(process.execPath)} ${quoted(join(app, "scripts", "serve.mjs"))}
WorkingDirectory=${app}
${Object.entries(environment)
  .map(([key, value]) => `Environment=${quoted(`${key}=${value}`)}`)
  .join("\n")}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function loaded() {
  return mac
    ? run("launchctl", ["print", `${domain}/${LABEL}`], { quiet: true })
        .status === 0
    : // Enabled is the question, as on macOS: a unit that is failing and being
      // restarted is still a service the owner started.
      run("systemctl", ["--user", "is-enabled", UNIT], { quiet: true })
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
  if (loaded()) throw new Error("launchd did not stop Hallvi in time.");
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
  console.log("Hallvi is starting, and will start with this machine.");
  return status();
}

function stop() {
  if (mac) {
    unload();
    rmSync(plist, { force: true });
  } else if (existsSync(unit)) {
    run("systemctl", ["--user", "disable", "--now", UNIT]);
    if (
      run("systemctl", ["--user", "is-active", "--quiet", UNIT], {
        quiet: true,
      }).status === 0
    )
      throw new Error("systemd did not stop Hallvi; nothing was removed.");
  }
  console.log("Hallvi is stopped, and stays stopped until: hallvi start");
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
      // A page that cannot load its database or modules answers 500.
      return response.status < 500;
    } catch {
      if (!loaded()) return false;
      await new Promise((done) => setTimeout(done, 500));
    }
  }
  return false;
}

/** The worker answers on its socket beside the database, or it is not there. */
function workerAlive() {
  return new Promise((done) => {
    const probe = connect(
      join(dirname(process.env.HALLVI_DB_PATH ?? state.database), "worker.sock"),
    );
    probe.once("connect", () => done(true) ?? probe.destroy());
    probe.once("error", () => done(false));
  });
}

async function status() {
  const url = `http://127.0.0.1:${installedPorts().web}`;
  const running = loaded();
  if (process.argv.includes("--quiet")) return running ? 0 : 1;
  const release = JSON.parse(
    readFileSync(join(app, "dist", "release.json"), "utf8"),
  );
  console.log(`Hallvi ${release.version} (${release.revision.slice(0, 7)})`);
  if (!running) {
    console.log("  service    stopped; it does not start with this machine");
    console.log(`  state      ${data}`);
    return 1;
  }
  const up = await answers(`${url}/applications`);
  // The worker writes its first beat a moment after the interface answers.
  for (let wait = 0; up && !(await workerAlive()) && wait < 20; wait++)
    await new Promise((done) => setTimeout(done, 500));
  console.log(
    mac
      ? "  service    running; starts when you log in to this Mac"
      : `  service    running; starts when this machine boots${lingering() ? "" : " — once you log in. For boot without login run: sudo loginctl enable-linger " + userInfo().username}`,
  );
  console.log(
    `  interface  ${up ? url : "not answering, or answering with errors"}`,
  );
  console.log(`  Pi worker  ${(await workerAlive()) ? "running" : "not running yet"}`);
  console.log(`  state      ${data}`);
  console.log(`  logs       hallvi logs`);
  if (!up) console.log("Look at `hallvi logs` for the reason.");
  if (up) {
    console.log("Open the interface address in a browser on this machine.");
    console.log("From a laptop, run: hallvi remote user@server-address");
  }
  return up && (await workerAlive()) ? 0 : 1;
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
 * What to put on the machine with the browser when Hallvi is on another.
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

Host hallvi
  HostName ${address}
  User ${user}
  ExitOnForwardFailure yes
  ServerAliveInterval 30
${forwardedPorts(ports)
  .map((port) => `  LocalForward 127.0.0.1:${port} 127.0.0.1:${port}`)
  .join("\n")}

# Then keep this running while you use Hallvi:
#   ssh -N hallvi
# and open http://127.0.0.1:${ports.web}
#
# ${ports.web} is the interface, ${ports.terminal} the browser terminal, and ${ports.privateFirst}-${ports.privateLast} are
# where private application links open. Hallvi listens on this machine's
# loopback only; this SSH connection is the only way in.`);
}

function uninstall() {
  // This removes the directory above the program, so be certain that is an
  // installation: run from an unpacked archive or a checkout it would
  // otherwise delete whatever happens to contain them.
  const installed = join(home, ".local", "lib", "hallvi");
  if (app !== join(installed, "app"))
    throw new Error(
      `This is not the installed copy (${join(installed, "app")}); nothing was removed.`,
    );
  stop();
  if (!mac) {
    rmSync(unit, { force: true });
    run("systemctl", ["--user", "daemon-reload"], { quiet: true });
  }
  rmSync(join(home, ".local", "bin", "hallvi"), { force: true });
  // This file is inside what it removes; Node has already read it.
  rmSync(installed, { recursive: true, force: true });
  console.log(`Hallvi is removed. Everything it knew is kept:
  ${data}
  ${dirname(piAccountLocation(home))}
Installing again picks it all up. To discard it, delete those two directories.`);
}

const commands = {
  start,
  stop,
  restart: () => (stop(), start()),
  status,
  url: () => console.log(`http://127.0.0.1:${installedPorts().web}`),
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
  console.log(`Usage: hallvi <command>

  start      run in the background now, and whenever this machine starts
  stop       stop, and stay stopped until the next start
  restart    stop, then start
  status     whether the service, the interface and the Pi worker are up
  url        browser address on the machine using Hallvi
  logs [-f]  what the service has printed
  remote [user@host]
             SSH settings for using this installation from another machine
  uninstall  remove the program and the service; keep all state`);
  process.exitCode = command ? 1 : 0;
}
