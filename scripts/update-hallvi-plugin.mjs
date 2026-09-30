// Update an existing local-marketplace installation, keeping its connection.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    input,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  // Connection diagnostics can contain secrets; do not echo them.
  if (result.error || result.status !== 0)
    throw new Error(
      `${basename(command)} failed (${result.error?.code ?? result.status}). No running process was restarted. Fix the command or connection and retry.`,
    );
  return result.stdout;
}

function connectionTarget(connection, pluginDir) {
  const args = connection.args;
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string"))
    throw new Error("Hallvi connection must have a string argument list.");
  const ssh = basename(connection.command) === "ssh";
  const words = ssh
    ? (args.at(-1) ?? "").split(/\s+/)
    : [connection.command, ...args];
  // Support the documented direct Node/SSH setup; never evaluate shell syntax.
  if (
    ssh &&
    (args.length < 2 || words.some((word) => !/^[\w./:@%+=,-]+$/.test(word)))
  )
    throw new Error(
      "Unsupported SSH command. Use the documented direct Node command with paths without spaces; no files changed.",
    );
  if (
    basename(words[0]) !== "node" ||
    basename(words[1] ?? "") !== "server.mjs"
  )
    throw new Error(
      "Expected a direct Node Hallvi server.mjs connection; no files changed.",
    );
  const options = parseArgs({
    args: words.slice(2),
    options: {
      controller: { type: "string" },
      "ui-url": { type: "string" },
    },
  }).values;
  if (!options.controller)
    throw new Error(
      "Existing connection needs an explicit --controller; no files changed.",
    );
  for (const value of [options.controller, options["ui-url"]].filter(Boolean)) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash)
      throw new Error(
        "Connection URLs must not contain credentials, queries or fragments.",
      );
  }
  if (ssh && !words[1].startsWith("/"))
    throw new Error("SSH adapter path must be absolute.");
  return {
    ssh,
    options,
    node: words[0],
    directory: ssh
      ? dirname(words[1])
      : dirname(resolve(pluginDir, connection.cwd ?? ".", words[1])),
    command: connection.command,
    sshArgs: args.slice(0, -1),
  };
}

// Self-contained so this file operation also runs over existing SSH.
async function remoteFiles(directory, files) {
  const fs = await import("node:fs/promises");
  const { createHash, randomUUID } = await import("node:crypto");
  if (process.versions.node.split(".")[0] !== "22")
    throw new Error("Node 22 required");
  const hashes = {};
  const staged = [];
  try {
    for (const name of ["server.mjs", "panel.html"]) {
      const path = `${directory}/${name}`;
      const current = await fs.readFile(path);
      hashes[name] = createHash("sha256").update(current).digest("hex");
      if (files) {
        const temporary = `${path}.${randomUUID()}.tmp`;
        staged.push([temporary, path]);
        await fs.writeFile(temporary, Buffer.from(files[name], "base64"), {
          flag: "wx",
          mode: 0o600,
        });
      }
    }
    for (const [temporary, path] of staged) await fs.rename(temporary, path);
    if (files)
      for (const name of Object.keys(hashes)) {
        hashes[name] = createHash("sha256")
          .update(await fs.readFile(`${directory}/${name}`))
          .digest("hex");
      }
    return hashes;
  } finally {
    for (const [temporary] of staged) await fs.rm(temporary, { force: true });
  }
}

function remote(target, files) {
  const code = `const fs = require('node:fs'); const input = JSON.parse(fs.readFileSync(0, 'utf8')); (${remoteFiles.toString()})(input.directory, input.files).then(r => console.log(JSON.stringify(r))).catch(() => process.exit(1));`;
  return JSON.parse(
    run(
      target.command,
      [...target.sshArgs, `${quote(target.node)} -e ${quote(code)}`],
      JSON.stringify({ directory: target.directory, files }),
    ),
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      "marketplace-dir": {
        type: "string",
        default: resolve(homedir(), ".local/share/hallvi-plugin-marketplace"),
      },
      bundle: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(
      "npm run plugin:update -- [--marketplace-dir PATH] [--bundle PATH] [--dry-run]\nBuild and update an existing Hallvi plugin. Preserve its connection; never restart Codex or Hallvi. --bundle installs an already built bundle. --dry-run validates/builds without installing.",
    );
    return;
  }
  if (process.versions.node.split(".")[0] !== "22") {
    // Homebrew may expose a newer default beside the required Node 22.
    for (const node of [
      "/opt/homebrew/opt/node@22/bin/node",
      "/usr/local/opt/node@22/bin/node",
    ]) {
      const version = spawnSync(node, ["--version"], { encoding: "utf8" });
      if (version.status === 0 && version.stdout.startsWith("v22.")) {
        const result = spawnSync(node, process.argv.slice(1), {
          stdio: "inherit",
        });
        process.exitCode = result.status ?? 1;
        return;
      }
    }
    throw new Error("Use Node.js 22 to update the plugin.");
  }
  const marketplace = resolve(values["marketplace-dir"]);
  const catalog = await json(
    resolve(marketplace, ".agents/plugins/marketplace.json"),
  );
  const entry = catalog.plugins.find((plugin) => plugin.name === "hallvi");
  if (entry?.source?.source !== "local" || !/^[\w-]+$/.test(catalog.name))
    throw new Error("Expected Hallvi in an existing local marketplace.");
  const destination = resolve(marketplace, entry.source.path);
  if (!destination.startsWith(marketplace + sep))
    throw new Error("Plugin must be inside its marketplace.");
  const connectionBytes = await readFile(resolve(destination, ".mcp.json"));
  const target = connectionTarget(
    JSON.parse(connectionBytes).mcpServers.hallvi,
    destination,
  );
  const before = target.ssh
    ? remote(target)
    : await remoteFiles(target.directory);
  const bundle = values.bundle
    ? resolve(values.bundle)
    : resolve(root, "dist/hallvi-plugin");
  if (!values.bundle)
    run(process.execPath, [
      "scripts/build-hallvi-plugin.mjs",
      "--controller",
      target.options.controller,
      "--ui-url",
      target.options["ui-url"] ?? target.options.controller,
    ]);
  const manifest = await json(resolve(bundle, ".codex-plugin/plugin.json"));
  if (manifest.name !== "hallvi")
    throw new Error("Bundle is not a Hallvi plugin.");
  const files = Object.fromEntries(
    await Promise.all(
      ["server.mjs", "panel.html"].map(async (name) => [
        name,
        await readFile(resolve(bundle, name)),
      ]),
    ),
  );
  const expected = Object.fromEntries(
    Object.entries(files).map(([name, bytes]) => [name, hash(bytes)]),
  );
  const version = expected["panel.html"].slice(0, 16);
  console.log(
    `Hallvi ${manifest.version}; UI ${version}; ${target.ssh ? "SSH" : "local"} adapter. Connection settings preserved.`,
  );
  if (values["dry-run"]) {
    console.log("Dry run complete. No installed files changed.");
    return;
  }

  // Stage the complete marketplace copy before replacing any installed file.
  const staging = await mkdtemp(resolve(marketplace, ".hallvi-update-"));
  try {
    await cp(bundle, staging, { recursive: true });
    await writeFile(resolve(staging, ".mcp.json"), connectionBytes);
    if (target.ssh) {
      const actual = remote(
        target,
        Object.fromEntries(
          Object.entries(files).map(([name, bytes]) => [
            name,
            bytes.toString("base64"),
          ]),
        ),
      );
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error("Remote bundle verification failed; retry the update.");
    } else if (target.directory !== destination) {
      await remoteFiles(
        target.directory,
        Object.fromEntries(
          Object.entries(files).map(([name, bytes]) => [
            name,
            bytes.toString("base64"),
          ]),
        ),
      );
    }
    // Preserve .mcp.json and unrelated owner files.
    for (const name of [
      "server.mjs",
      "panel.html",
      "icon.svg",
      ".codex-plugin/plugin.json",
      "skills/operate/SKILL.md",
    ]) {
      const path = resolve(destination, name);
      const temporary = `${path}.update-${process.pid}`;
      try {
        await cp(resolve(staging, name), temporary);
        await rename(temporary, path);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    // Codex owns version selection and its cache layout.
    const installed = JSON.parse(
      run("codex", ["plugin", "add", `hallvi@${catalog.name}`, "--json"]),
    );
    if (installed.version !== manifest.version || !installed.installedPath)
      throw new Error("Codex did not install the expected version; retry.");
    for (const directory of [destination, installed.installedPath]) {
      for (const [name, expectedHash] of Object.entries(expected))
        if (hash(await readFile(resolve(directory, name))) !== expectedHash)
          throw new Error("Installed bundle verification failed; retry.");
      if (
        !(await readFile(resolve(directory, ".mcp.json"))).equals(
          connectionBytes,
        )
      )
        throw new Error(
          "Connection changed during update; inspect it before reconnecting.",
        );
    }
    console.log(
      `Updated marketplace, ${target.ssh ? "remote adapter and " : ""}Codex installation. Expected UI: ${version}.`,
    );
    console.log(
      before["server.mjs"] !== expected["server.mjs"]
        ? "Adapter code changed. Restart Codex once, then open Hallvi from the sidebar."
        : "Adapter code unchanged. Call hallvi_reload_ui, then close and reopen Hallvi. Restart Codex if the panel still shows an older UI version.",
    );
    console.log(
      "Installed files are updated; the already-open desktop panel has not been verified.",
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
