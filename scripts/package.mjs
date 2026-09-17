// Assembles the archive a person installs: `dist/server-guy-<version>.tgz`.
//
// The archive holds what runs and nothing that builds it. Dependencies are not
// inside: two of them are native, so `install.sh` installs them on the machine
// they will run on, from the lockfile packed here.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const name = `server-guy-${version}`;

execFileSync(process.execPath, ["scripts/build.mjs"], { stdio: "inherit" });

const root = join("dist", "package");
const target = join(root, name);
rmSync(root, { recursive: true, force: true });
mkdirSync(join(target, "scripts"), { recursive: true });
mkdirSync(join(target, "dist"));

for (const path of [
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "scripts/serve.mjs",
  "scripts/cli.mjs",
  "scripts/dev-environment.mjs",
  "scripts/installed-ports.mjs",
  // Pi's workspace image is built from these files at run time.
  "scripts/pi-workspace",
  "dist/worker.mjs",
  "dist/worker.mjs.map",
  "dist/schema.sql",
  "dist/schema-version.json",
])
  cpSync(path, join(target, path), { recursive: true });
cpSync(".next", join(target, ".next"), {
  recursive: true,
  // Build caches are large and only speed up the next build.
  filter: (source) => !/^\.next\/(cache|dev)(\/|$)/.test(source),
});
cpSync("scripts/install.sh", join(target, "install.sh"));

let revision = "unknown";
try {
  revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
} catch {}
writeFileSync(
  join(target, "dist", "release.json"),
  `${JSON.stringify({ version, revision }, null, 2)}\n`,
);

const archive = join("dist", `${name}.tgz`);
execFileSync("tar", ["-czf", archive, "-C", root, name], {
  stdio: "inherit",
  // macOS tar would otherwise add AppleDouble files Linux unpacks as clutter.
  env: { ...process.env, COPYFILE_DISABLE: "1" },
});
rmSync(root, { recursive: true, force: true });
console.log(`Packaged ${archive}`);
