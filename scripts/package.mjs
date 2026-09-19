// Assembles the archive a person installs: `dist/hallvi-<version>.tgz`.
//
// The archive holds what runs and nothing that builds it. Dependencies are not
// inside: two of them are native, so `install.sh` installs them on the machine
// they will run on, from the lockfile packed here.
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const name = `hallvi-${version}`;

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
  "scripts/state-location.mjs",
  "scripts/installed-ports.mjs",
  // The workspace bridge runs from here, and the Docker image is built from it.
  "scripts/pi-workspace",
  "dist/worker.mjs",
  "dist/worker.mjs.map",
  "dist/schema.sql",
  "dist/schema-version.json",
])
  cpSync(path, join(target, path), { recursive: true });
cpSync(".next", join(target, ".next"), {
  recursive: true,
  // Next links native and external packages as ../../node_modules/<name>.
  // Copied as written they resolve inside the installation; resolved, they
  // would point back into this checkout.
  verbatimSymlinks: true,
  // Build caches are large and only speed up the next build.
  filter: (source) => !/^\.next\/(cache|dev)(\/|$)/.test(source),
});
cpSync("scripts/install.sh", join(target, "install.sh"));
chmodSync(join(target, "install.sh"), 0o755);

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
// macOS tar would otherwise pack AppleDouble files and extended attributes,
// which GNU tar on Linux warns about once per file.
const mac = process.platform === "darwin";
execFileSync(
  "tar",
  [...(mac ? ["--no-xattrs"] : []), "-czf", archive, "-C", root, name],
  { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } },
);
rmSync(root, { recursive: true, force: true });
console.log(`Packaged ${archive}`);
