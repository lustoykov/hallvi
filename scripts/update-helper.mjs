// The update itself, running outside Hallvi.
//
// By the time this matters, the program that asked for it is gone: it stops
// the service, replaces the directory the interface and the worker were
// running from, and starts them again. So it runs from a copy of itself, in a
// service of its own, and everything it knows it writes to the attempt file —
// that file is the only way the new Hallvi can say what happened while it was
// not there.
//
// The order is the safety. Nothing that can fail is left until after the
// service has stopped: the manifest is checked again from its own bytes, the
// package is downloaded and hashed, unpacked, and read back to confirm it is
// the release the manifest named. Only then does the worker stop taking work,
// and only then does `install.sh` replace anything — and that installer keeps
// the old program until the new one has started, so a failure here leaves a
// working Hallvi behind.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { request } from "node:http";
import { connect } from "node:net";
import { userInfo } from "node:os";
import { join } from "node:path";

import { installedPorts } from "./installed-ports.mjs";
import {
  currentPlatform,
  downloadPackage,
  packageFor,
  programSchemaVersion,
  ReleaseRefusal,
  reopen,
} from "./release-source.mjs";
import { stateFiles } from "./state-location.mjs";
import { readAttempt, recordPhase } from "./update-attempt.mjs";
import { retireHelper } from "./update-service.mjs";
import { workerSocketPath } from "./worker-socket.mjs";

const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
};
const data = flag("data");
const program = flag("program");
if (!data || !program) {
  console.error("update-helper needs --data and --program.");
  process.exit(2);
}
const state = stateFiles(data);
const mac = process.platform === "darwin";
const say = (line) => console.log(`${new Date().toISOString()} ${line}`);

const run = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: "utf8", ...options });

/** Asks the running worker one question over the socket beside the database. */
function askWorker(action, body, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const asked = request(
      {
        socketPath: workerSocketPath(state.database),
        agent: false,
        path: `/${action}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout,
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          try {
            const answer = JSON.parse(text || "null");
            response.statusCode === 200
              ? resolve(answer)
              : reject(new Error(answer?.error ?? "The worker refused."));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    asked.on("timeout", () =>
      asked.destroy(new Error("The worker did not answer.")),
    );
    asked.on("error", reject);
    asked.end(JSON.stringify(body ?? {}));
  });
}

/** Whether the service is loaded now, the way the installer asks it. */
function serviceRunning() {
  return mac
    ? run("launchctl", ["print", `gui/${userInfo().uid}/com.hallvi`]).status ===
        0
    : run("systemctl", ["--user", "is-enabled", "hallvi.service"]).status ===
        0 ||
        run("systemctl", ["--user", "is-active", "--quiet", "hallvi.service"])
          .status === 0;
}

async function interfaceRevision(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/host`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return typeof body?.revision === "string" ? body.revision : null;
  } catch {
    return null;
  }
}

/** The worker answers on its socket beside the database, or it is not there. */
function workerAnswering() {
  return new Promise((done) => {
    const probe = connect(workerSocketPath(state.database));
    probe.once("connect", () => (done(true), probe.destroy()));
    probe.once("error", () => done(false));
  });
}

async function main() {
  const attempt = readAttempt(data);
  if (!attempt) throw new Error("There is no update attempt to carry out.");

  // The manifest is read again here, from its own bytes and its own
  // signature, rather than trusted because the interface said so.
  const manifest = reopen({
    document: attempt.candidate.document,
    signature: attempt.candidate.signature,
    channel: attempt.candidate.channel,
  });
  const platform = currentPlatform();
  const entry = packageFor(manifest, platform);
  if (attempt.to?.revision && attempt.to.revision !== manifest.revision)
    throw new ReleaseRefusal(
      "The release changed between choosing it and installing it.",
    );

  // A schema the installed database cannot be read by is refused here, before
  // anything is downloaded. `install.sh` refuses it again from the unpacked
  // archive, against the real database; this only saves the download and says
  // so in words the owner can act on.
  const schema = programSchemaVersion(program);
  if (schema !== null && manifest.schemaVersion !== schema) {
    recordPhase(
      data,
      "blocked",
      `Hallvi ${manifest.version} keeps its records in schema ${manifest.schemaVersion} and this one uses schema ${schema}. There is no migration between them yet, so nothing was downloaded and nothing was changed.`,
    );
    say("blocked: schema");
    return;
  }

  const downloads = join(data, "updates");
  mkdirSync(downloads, { recursive: true, mode: 0o700 });
  const archive = join(downloads, entry.file);

  recordPhase(data, "downloading", `Downloading Hallvi ${manifest.version}.`);
  say(`downloading ${entry.url}`);
  let last = 0;
  await downloadPackage(entry, archive, {
    onProgress: (read, size) => {
      const percent = Math.floor((read / size) * 100);
      if (percent >= last + 10) {
        last = percent;
        recordPhase(
          data,
          "downloading",
          `Downloading Hallvi ${manifest.version} — ${percent}%.`,
          {
            progress: percent,
          },
        );
      }
    },
  });

  recordPhase(
    data,
    "verifying",
    "Checking the package against the signed release.",
  );
  const unpacked = join(downloads, `unpacked-${attempt.id}`);
  rmSync(unpacked, { recursive: true, force: true });
  mkdirSync(unpacked, { recursive: true, mode: 0o700 });
  const extracted = run("tar", [
    "-xzf",
    archive,
    "-C",
    unpacked,
    "--no-same-owner",
  ]);
  if (extracted.status !== 0)
    throw new ReleaseRefusal(
      `The verified package could not be unpacked: ${extracted.stderr}`,
    );
  const inside = readdirSync(unpacked);
  const folder = `hallvi-${manifest.version}-${platform}`;
  if (inside.length !== 1 || inside[0] !== folder)
    throw new ReleaseRefusal(
      `The package does not contain ${folder}; nothing was installed.`,
    );
  const root = join(unpacked, folder);
  for (const needed of [
    "install.sh",
    join("dist", "release.json"),
    join("node", "bin", "node"),
  ])
    if (!existsSync(join(root, needed)))
      throw new ReleaseRefusal(
        `The package is missing ${needed}; nothing was installed.`,
      );
  const inner = JSON.parse(
    readFileSync(join(root, "dist", "release.json"), "utf8"),
  );
  if (
    inner.version !== manifest.version ||
    inner.revision !== manifest.revision ||
    inner.platform !== platform
  )
    throw new ReleaseRefusal(
      "The package inside does not describe the release the manifest names; nothing was installed.",
    );

  // Everything that can be checked has been checked. Now, and not before,
  // the worker is asked to stop taking work — and asked in the same breath
  // whether any is still going on, so that nothing can start in between.
  const wasRunning = serviceRunning();
  let held = false;
  if (wasRunning) {
    try {
      // The worker's own request shape: `{ scope, message }`.
      const answer = await askWorker("hold", { message: { minutes: 20 } });
      held = true;
      if (answer?.busy > 0) {
        await askWorker("release", {}).catch(() => undefined);
        recordPhase(
          data,
          "blocked",
          `Pi is working in ${answer.busy} conversation${answer.busy === 1 ? "" : "s"}. The package is downloaded and checked; start the update again when that work has finished.`,
        );
        say("blocked: work in progress");
        return;
      }
    } catch (error) {
      // No worker to ask is not a reason to stop: the service may be up
      // without one, and the installer stops the pair either way.
      say(`worker hold: ${error instanceof Error ? error.message : error}`);
    }
  }

  recordPhase(
    data,
    "installing",
    `Installing Hallvi ${manifest.version}. Hallvi stops for a moment and comes back on the same address.`,
  );
  say(`installing ${folder}`);
  const installed = run("sh", [join(root, "install.sh")], {
    cwd: data,
    stdio: ["ignore", "inherit", "pipe"],
    env: { ...process.env, HALLVI_USE: "here" },
  });
  if (installed.status !== 0) {
    if (held) await askWorker("release", {}).catch(() => undefined);
    throw new Error(
      `The installer refused, and Hallvi ${attempt.from?.version ?? "as it was"} is still installed: ${
        (installed.stderr ?? "").trim().split("\n").slice(-3).join(" ") ||
        "see the update log"
      }`,
    );
  }

  if (!wasRunning) {
    recordPhase(
      data,
      "completed",
      `Hallvi ${manifest.version} is installed. It was stopped before the update and stays stopped: hallvi start`,
      {
        to: {
          ...attempt.to,
          version: manifest.version,
          revision: manifest.revision,
        },
      },
    );
    return;
  }

  recordPhase(data, "reconnecting", "Waiting for Hallvi to answer again.");
  // The installation's own port, from its own settings file: an update must
  // come back where the owner left it, tunnel and all.
  if (existsSync(state.settings)) {
    try {
      process.loadEnvFile(state.settings);
    } catch {}
  }
  const port = installedPorts().web;
  // Done means the new program is answering, not that the files were swapped:
  // the interface has to say the revision that was installed, and the worker
  // has to be there to take a message.
  for (let attemptNumber = 0; attemptNumber < 120; attemptNumber++) {
    const revision = await interfaceRevision(port);
    if (revision === manifest.revision && (await workerAnswering())) {
      recordPhase(
        data,
        "completed",
        `Hallvi ${manifest.version} is running on ${`http://127.0.0.1:${port}`}.`,
        {
          to: {
            ...attempt.to,
            version: manifest.version,
            revision: manifest.revision,
          },
        },
      );
      say("completed");
      return;
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(
    `Hallvi ${manifest.version} was installed but did not report itself running within four minutes. Look at hallvi status and hallvi logs.`,
  );
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  say(`failed: ${message}`);
  recordPhase(data, "failed", message);
} finally {
  // The archive and the unpacked copy are a hundred megabytes that have done
  // their job. The attempt file is what the next Hallvi reads.
  const finished = readAttempt(data);
  rmSync(join(data, "updates", `unpacked-${finished?.id}`), {
    recursive: true,
    force: true,
  });
  for (const name of readdirSync(join(data, "updates")).filter((entry) =>
    entry.endsWith(".tgz"),
  ))
    rmSync(join(data, "updates", name), { force: true });
  retireHelper();
}
