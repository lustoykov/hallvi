// The default workspace, directly on this computer: Pi's real tools in a
// real child process, no Docker. Proves the precautions the product claims —
// no Hallvi credentials in the environment, file tools confined to the
// folder — and that cancellation kills the command's process tree. It does
// not, and cannot, prove isolation: there is none.
import * as sdk from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../../temporary-root.mjs";
import { readTar } from "../../../src/server/tar";
import {
  cleanupPiWorkspaces,
  PiWorkspace,
  piWorkspaceTools,
} from "../../../src/server/pi-workspace";

const variables = [
  "DOCKER_HOST",
  "GH_TOKEN",
  "HALLVI_CONFIG_DIR",
  "HALLVI_DB_PATH",
  "HALLVI_PROBE_TOKEN",
] as const;
const saved = Object.fromEntries(
  variables.map((name) => [name, process.env[name]]),
);
const secret = `ghp_${"D".repeat(36)}`;
let root: string;

beforeEach(() => {
  root = createTemporaryRoot("/tmp/hallvi-pi-direct-");
  process.env.HALLVI_DB_PATH = join(root, "hallvi.db");
  process.env.HALLVI_CONFIG_DIR = root;
  process.env.HALLVI_PROBE_TOKEN = secret;
  process.env.GH_TOKEN = secret;
});

afterEach(() => {
  for (const name of variables)
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  removeTemporaryRoot(root);
});

const file = (path: string, content: string) => ({
  path,
  mode: 0o644,
  content: Buffer.from(content),
});

function tools(workspace: PiWorkspace) {
  const byName = new Map(
    piWorkspaceTools(sdk, workspace).map((tool) => [tool.name, tool]),
  );
  // Output text, or the error Pi receives as tool feedback.
  return (name: string, args: object, signal?: AbortSignal) =>
    byName
      .get(name)!
      .execute(`${name}-call`, args, signal)
      .then(
        (result) =>
          result.content
            .map((part) => ("text" in part ? part.text : ""))
            .join("\n"),
        (error: Error) => `Error: ${error.message}`,
      );
}

it("runs Pi's tools in a scratch folder without Hallvi's credentials and keeps file tools inside it", async () => {
  // Hallvi's own configuration, beside its database.
  const configuration = join(root, "hallvi.env");
  writeFileSync(configuration, `CLOUDFLARE_API_TOKEN=${secret}\n`);
  const workspace = new PiWorkspace({
    applicationId: "app-direct",
    runId: "run-direct",
    source: async () => ({
      description: "qa/example@abc123",
      files: [
        file("README.md", "Start with node src/server.js\n"),
        file("src/server.js", "export const port = 3000;\n"),
        file(".env", `TOKEN=${secret}\n`),
      ],
    }),
  });
  expect(workspace.isolation).toBe("direct");
  expect(await workspace.unavailable()).toBeNull();
  const run = tools(workspace);

  const listing = await run("ls", {});
  expect(listing).toContain("README.md");
  expect(listing).not.toContain(".env");
  expect(await run("read", { path: ".hallvi-source.txt" })).toContain(
    "qa/example@abc123",
  );
  await run("edit", {
    path: "src/server.js",
    edits: [{ oldText: "3000", newText: "8080" }],
  });
  expect(await run("bash", { command: "cat src/server.js; pwd" })).toMatch(
    /8080[\s\S]*hallvi-workspaces/,
  );
  expect(await run("grep", { pattern: "8080" })).toContain("src/server.js");

  // Nothing Hallvi was started with reaches the command.
  const environment = await run("bash", { command: "env" });
  expect(environment).not.toContain(secret);
  expect(environment).not.toMatch(/^HALLVI_|^GH_TOKEN/m);

  // File tools refuse Hallvi's files, directly or through a link.
  await run("bash", { command: `ln -s ${configuration} linked.env` });
  for (const [name, args] of [
    ["read", { path: configuration }],
    ["read", { path: "linked.env" }],
    ["grep", { pattern: "TOKEN", path: root }],
    ["ls", { path: "~" }],
    ["write", { path: configuration, content: "changed" }],
  ] as const)
    expect(await run(name, args)).toMatch(/^Error: .*outside the workspace/);
  expect(readFileSync(configuration, "utf8")).toContain(secret);

  // The folder is recorded as an opaque archive, then removed.
  const folder = workspace.path;
  await workspace.dispose();
  expect(existsSync(folder)).toBe(false);
  const journal = join(root, "pi-workspaces", workspace.id);
  const archived = readTar(readFileSync(join(journal, "workspace.tar")));
  expect(archived.map((entry) => entry.path)).toContain("src/server.js");
  expect(archived.map((entry) => entry.path)).not.toContain("linked.env");
  expect(readFileSync(join(journal, "events.jsonl"), "utf8")).not.toContain(
    secret,
  );
}, 60_000);

it("cancelling a command kills its process tree and ends the workspace without replay", async () => {
  const workspace = new PiWorkspace({
    applicationId: "app-direct",
    runId: "run-cancel",
  });
  const run = tools(workspace);
  const cancel = new AbortController();
  const long = run(
    "bash",
    { command: "sleep 600 & echo $! > background.pid; sleep 600" },
    cancel.signal,
  );
  const pidFile = join(workspace.path, "background.pid");
  await vi.waitFor(
    () => expect(readFileSync(pidFile, "utf8").trim()).toMatch(/^\d+$/),
    { timeout: 20_000, interval: 100 },
  );
  const background = Number(readFileSync(pidFile, "utf8"));
  cancel.abort();
  expect(await long).toMatch(/^Error:/);
  expect(() => process.kill(background, 0)).toThrow(
    expect.objectContaining({ code: "ESRCH" }),
  );
  expect(existsSync(workspace.path)).toBe(false);
  expect(await run("bash", { command: "true" })).toMatch(
    /This workspace has ended/,
  );
}, 60_000);

it("with Docker chosen and unavailable, withdraws the workspace with a reason and never runs here", async () => {
  writeFileSync(
    join(root, "workspace.json"),
    JSON.stringify({ isolation: "docker" }),
  );
  process.env.DOCKER_HOST = `unix://${join(root, "no-docker.sock")}`;
  const workspace = new PiWorkspace({
    applicationId: "app-direct",
    runId: "run-docker",
  });
  const reason = await workspace.unavailable();
  expect(reason).toMatch(/Docker isolation is selected[\s\S]*Start Docker/);
  expect(workspace.prompt(reason)).toContain("withdrawn");
  const target = join(root, "touched");
  expect(
    await tools(workspace)("bash", { command: `touch ${target}` }),
  ).toMatch(/Docker isolation is selected/);
  expect(existsSync(target)).toBe(false);

  // An unreadable choice is not read as the default.
  writeFileSync(join(root, "workspace.json"), "{");
  const unreadable = new PiWorkspace({
    applicationId: "app-direct",
    runId: "run-unreadable",
  });
  expect(await unreadable.unavailable()).toMatch(/Settings → Workspace/);
  expect(await tools(unreadable)("ls", {})).toMatch(/^Error: /);
});

it("cleanup removes only this installation's folders left by a stopped worker", async () => {
  process.env.DOCKER_HOST = "tcp://127.0.0.1:1";
  const owner = createHash("sha256")
    .update(process.env.HALLVI_DB_PATH!)
    .digest("hex")
    .slice(0, 16);
  const base = join(tmpdir(), "hallvi-workspaces");
  const stale = join(base, `${owner}-999999999-stale`);
  const live = join(base, `${owner}-${process.pid}-live`);
  const other = join(base, `0000000000000000-999999999-other`);
  for (const folder of [stale, live, other])
    mkdirSync(folder, { recursive: true });
  try {
    await cleanupPiWorkspaces();
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(live)).toBe(true);
    expect(existsSync(other)).toBe(true);
  } finally {
    for (const folder of [live, other]) removeFolder(folder);
  }
});

function removeFolder(folder: string) {
  // Only the two fixtures this test created.
  if (!/hallvi-workspaces\/[0-9a-f]{16}-\d+-(live|other)$/.test(folder))
    throw new Error(`Refusing to remove ${folder}`);
  rmSync(folder, { recursive: true, force: true });
}
