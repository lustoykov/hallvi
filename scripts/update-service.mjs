// Starting the thing that replaces Hallvi, so that stopping Hallvi does not
// stop it too.
//
// An update has to outlive the program it updates. A child process is not
// enough: both service managers stop a service by killing everything in it —
// launchd the whole job, systemd the whole control group — and a child of the
// interface is in there whatever it does with its process group. So the helper
// is given a service of its own: a second launchd agent on macOS, a transient
// systemd unit on Linux. Stopping `com.hallvi` or `hallvi.service` then has
// nothing to do with it.
//
// It also runs from a copy. The program directory, the bundled Node.js in it
// included, is what the update replaces; a helper still reading modules out of
// it would lose its own runtime halfway through. Everything it needs is copied
// beside the state directory first, and the copy is what runs.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mac = process.platform === "darwin";

export const HELPER_LABEL = "com.hallvi.update";
export const HELPER_UNIT = "hallvi-update";

/** The modules the helper runs on, copied out of the program before it goes. */
const HELPER_FILES = [
  "update-helper.mjs",
  "update-service.mjs",
  "update-attempt.mjs",
  "release-source.mjs",
  "release-trust.mjs",
  "installed-ports.mjs",
  "state-location.mjs",
  "worker-socket.mjs",
];

const run = (command, args) =>
  spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** Whether the helper's own service is still there and running. */
export function helperAlive(attempt) {
  const domain = `gui/${userInfo().uid}`;
  if (attempt?.helper?.kind === "launchd")
    return /state = running/.test(
      run("launchctl", ["print", `${domain}/${attempt.helper.name}`]).stdout ??
        "",
    );
  if (attempt?.helper?.kind === "systemd")
    return (
      run("systemctl", [
        "--user",
        "is-active",
        "--quiet",
        `${attempt.helper.name}.service`,
      ]).status === 0
    );
  return false;
}

function plist(label, node, args, log, environment) {
  const xml = (value) =>
    String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>${label}</string>
    <key>ProgramArguments</key>
    <array>
${[node, ...args].map((value) => `      <string>${xml(value)}</string>`).join("\n")}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      ${Object.entries(environment)
        .map(
          ([key, value]) => `<key>${key}</key><string>${xml(value)}</string>`,
        )
        .join("\n      ")}
    </dict>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>${xml(log)}</string>
    <key>StandardErrorPath</key><string>${xml(log)}</string>
  </dict>
</plist>
`;
}

/**
 * Which service the helper for this attempt will be, before it exists. The
 * attempt file records this *before* the helper is started, so that a Hallvi
 * reading the file in between never mistakes "not started yet" for "died".
 */
export function helperTarget({ data, attempt }) {
  return mac
    ? {
        kind: "launchd",
        name: HELPER_LABEL,
        log: join(data, "logs", "update.log"),
      }
    : {
        kind: "systemd",
        name: `${HELPER_UNIT}-${attempt}`,
        log: join(data, "logs", "update.log"),
      };
}

/**
 * Copies the helper and its runtime out of the program, then starts it as its
 * own service. Returns what the attempt file needs to find it again.
 */
export function startHelper({ data, program, attempt }) {
  const updates = join(data, "updates");
  // A helper that was killed leaves its copy behind; there is only ever one
  // attempt, so anything from an earlier one is finished with.
  if (existsSync(updates))
    for (const name of readdirSync(updates).filter((entry) =>
      entry.startsWith("helper-"),
    ))
      rmSync(join(updates, name), { recursive: true, force: true });
  const staging = join(updates, `helper-${attempt}`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true, mode: 0o700 });
  // The bundled Node.js binary runs on its own; the rest of the runtime
  // directory is libraries this helper does not open.
  const node = join(staging, "node");
  copyFileSync(resolve(program, "..", "node", "bin", "node"), node);
  chmodSync(node, 0o755);
  for (const file of HELPER_FILES)
    copyFileSync(
      join(/* turbopackIgnore: true */ here, file),
      join(staging, file),
    );

  const target = helperTarget({ data, attempt });
  const log = target.log;
  mkdirSync(dirname(log), { recursive: true, mode: 0o700 });
  const args = [
    join(staging, "update-helper.mjs"),
    "--data",
    data,
    "--program",
    program,
  ];
  const environment = {
    PATH: process.env.PATH ?? "/usr/bin:/bin:/usr/sbin:/sbin",
    HOME: process.env.HOME ?? homedir(),
    HALLVI_DATA_DIR: data,
    HALLVI_UPDATE_STAGING: staging,
    ...(process.env.HALLVI_RELEASE_SOURCE
      ? { HALLVI_RELEASE_SOURCE: process.env.HALLVI_RELEASE_SOURCE }
      : {}),
    ...(process.env.HALLVI_RELEASE_KEY
      ? { HALLVI_RELEASE_KEY: process.env.HALLVI_RELEASE_KEY }
      : {}),
    // `systemctl --user` and `launchctl` reach the user's service manager
    // through these; a transient unit does not inherit the session's own.
    ...(process.env.XDG_RUNTIME_DIR
      ? { XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR }
      : {}),
    ...(process.env.DBUS_SESSION_BUS_ADDRESS
      ? { DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS }
      : {}),
  };

  if (mac) {
    const file = join(
      homedir(),
      "Library",
      "LaunchAgents",
      `${HELPER_LABEL}.plist`,
    );
    const domain = `gui/${userInfo().uid}`;
    mkdirSync(dirname(file), { recursive: true });
    run("launchctl", ["bootout", `${domain}/${HELPER_LABEL}`]);
    writeFileSync(file, plist(HELPER_LABEL, node, args, log, environment));
    const started = run("launchctl", ["bootstrap", domain, file]);
    if (started.status !== 0)
      throw new Error(
        `The update helper could not be started: ${(started.stderr || started.stdout).trim()}`,
      );
    return { ...target, staging };
  }

  // A transient unit is in its own control group, so stopping hallvi.service
  // does not reach it, and --collect removes the unit once it has finished.
  const started = run("systemd-run", [
    "--user",
    "--collect",
    `--unit=${target.name}`,
    "--description=Hallvi update",
    "--working-directory",
    data,
    // Where the attempt says it is. Without this the output goes to the
    // journal and the log path Hallvi prints would name nothing.
    `--property=StandardOutput=append:${log}`,
    `--property=StandardError=append:${log}`,
    ...Object.entries(environment).map(
      ([key, value]) => `--setenv=${key}=${value}`,
    ),
    node,
    ...args,
  ]);
  if (started.status !== 0)
    throw new Error(
      `The update helper could not be started: ${(started.stderr || started.stdout).trim()}`,
    );
  return { ...target, staging };
}

/**
 * The helper removing its own service once it has written the outcome. On
 * Linux `--collect` already does this; on macOS an agent that has run stays
 * loaded until something unloads it, and that something is itself.
 */
export function retireHelper() {
  if (!mac) return;
  const file = join(
    homedir(),
    "Library",
    "LaunchAgents",
    `${HELPER_LABEL}.plist`,
  );
  rmSync(file, { force: true });
  run("launchctl", ["bootout", `gui/${userInfo().uid}/${HELPER_LABEL}`]);
}
