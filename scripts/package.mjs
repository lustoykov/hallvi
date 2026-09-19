// Build a platform archive on the machine it will run on. Native dependencies
// are installed here, from the lockfile, never on the recipient's machine.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const NODE_VERSION = "22.23.2";
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const githubClientId =
  process.env.HALLVI_RELEASE_GITHUB_CLIENT_ID?.trim() || null;
const githubSlug = process.env.HALLVI_RELEASE_GITHUB_APP_SLUG?.trim() || null;
if (Boolean(githubClientId) !== Boolean(githubSlug))
  throw new Error("Supply both public release GitHub App values, or neither.");
if (
  (githubClientId && !/^[A-Za-z0-9]+$/.test(githubClientId)) ||
  (githubSlug && !/^[a-z0-9-]+$/.test(githubSlug))
)
  throw new Error("Invalid public release GitHub App client ID or slug.");
const platform =
  process.platform === "darwin" && process.arch === "arm64"
    ? "darwin-arm64"
    : process.platform === "linux" && process.arch === "x64"
      ? "linux-x64"
      : null;
if (!platform)
  throw new Error("Build releases on Apple-silicon macOS or Ubuntu 24.04 x64.");
if (platform === "linux-x64") {
  const release = readFileSync("/etc/os-release", "utf8");
  if (
    !/^ID=ubuntu$/m.test(release) ||
    !/^VERSION_ID="?24\.04"?$/m.test(release)
  )
    throw new Error("Build the Linux release on Ubuntu 24.04 x64.");
}
if (process.versions.node.split(".")[0] !== "22")
  throw new Error("Run npm ci and npm run package with Node.js 22.");

const name = `hallvi-${version}-${platform}`;
const root = join("dist", "package");
const target = join(root, name);
const archive = join("dist", `${name}.tgz`);
const nodeArchive = join(root, "node.tar.gz");
const nodeFile = `node-v${NODE_VERSION}-${platform}.tar.gz`;
const base = `https://nodejs.org/dist/v${NODE_VERSION}`;
const curl = (url, output) =>
  execFileSync("curl", ["-fsSL", url, "-o", output], { stdio: "inherit" });
const sha256 = (file) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

// build.mjs replaces dist/, so finish it before preparing the archive there.
execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });
rmSync(root, { recursive: true, force: true });
mkdirSync(join(target, "node"), { recursive: true });
try {
  curl(`${base}/SHASUMS256.txt`, join(root, "SHASUMS256.txt"));
  const line = readFileSync(join(root, "SHASUMS256.txt"), "utf8")
    .split("\n")
    .find((item) => item.endsWith(`  ${nodeFile}`));
  if (!line) throw new Error(`Node.js does not publish ${nodeFile}.`);
  curl(`${base}/${nodeFile}`, nodeArchive);
  if (sha256(nodeArchive) !== line.slice(0, 64))
    throw new Error("The pinned Node.js runtime failed checksum verification.");
  execFileSync(
    "tar",
    [
      "-xzf",
      nodeArchive,
      "-C",
      join(target, "node"),
      "--strip-components",
      "1",
    ],
    { stdio: "inherit" },
  );
  rmSync(nodeArchive);

  mkdirSync(join(target, "scripts"), { recursive: true });
  mkdirSync(join(target, "dist"));
  for (const path of [
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "scripts/serve.mjs",
    "scripts/cli.mjs",
    "scripts/dev-environment.mjs",
    "scripts/state-location.mjs",
    "scripts/installed-ports.mjs",
    "scripts/pi-workspace",
    "dist/worker.mjs",
    "dist/worker.mjs.map",
    "dist/schema.sql",
    "dist/schema-version.json",
  ])
    cpSync(path, join(target, path), { recursive: true });
  cpSync(".next", join(target, ".next"), {
    recursive: true,
    verbatimSymlinks: true,
    filter: (source) => !/^\.next\/(cache|dev)(\/|$)/.test(source),
  });
  cpSync("scripts/install.sh", join(target, "install.sh"));
  chmodSync(join(target, "install.sh"), 0o755);

  // npm may compile native modules here. The packaged runtime is on PATH, so
  // its ABI matches both modules. install.sh never calls npm.
  execFileSync("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: target,
    env: {
      ...process.env,
      PATH: `${join(process.cwd(), target, "node", "bin")}:${process.env.PATH}`,
    },
    stdio: "inherit",
  });
  execFileSync(
    resolve(target, "node", "bin", "node"),
    [
      "--input-type=module",
      "-e",
      "import Database from 'better-sqlite3'; import pty from 'node-pty'; new Database(':memory:').close(); pty.spawn('/bin/sh', ['-c', 'exit'], {});",
    ],
    { cwd: target, stdio: "inherit" },
  );

  let revision = process.env.HALLVI_SOURCE_REVISION ?? "unknown";
  if (revision !== "unknown" && !/^[0-9a-f]{40}$/.test(revision))
    throw new Error("HALLVI_SOURCE_REVISION must be a full commit SHA.");
  if (revision === "unknown") {
    try {
      const dirty = execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      revision = dirty
        ? "uncommitted"
        : execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim();
    } catch {}
  }
  writeFileSync(
    join(target, "dist", "release.json"),
    `${JSON.stringify({ version, revision, platform, nodeVersion: NODE_VERSION }, null, 2)}\n`,
  );
  writeFileSync(
    join(target, "dist", "github-app.json"),
    `${JSON.stringify({ clientId: githubClientId, slug: githubSlug }, null, 2)}\n`,
  );
  execFileSync(
    "tar",
    [
      ...(process.platform === "darwin" ? ["--no-xattrs"] : []),
      "-czf",
      archive,
      "-C",
      root,
      name,
    ],
    { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
  writeFileSync(`${archive}.sha256`, `${sha256(archive)}  ${name}.tgz\n`);
  cpSync("scripts/bootstrap.sh", join("dist", "install-hallvi.sh"));
  chmodSync(join("dist", "install-hallvi.sh"), 0o755);
  console.log(
    `Packaged ${archive} and its checksum; run dist/install-hallvi.sh to install.`,
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
