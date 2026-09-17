// Builds everything `scripts/serve.mjs` runs, so an installation needs no
// developer tools: the interface, the Pi worker as plain JavaScript, and the
// schema a new database is created from.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const node = (args, options) =>
  execFileSync(process.execPath, args, { stdio: "inherit", ...options });

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");

node(["node_modules/next/dist/bin/next", "build"]);

// Dependencies stay in node_modules: two of them are native, and the rest are
// installed for the machine anyway.
await build({
  entryPoints: ["src/worker.ts"],
  outfile: "dist/worker.mjs",
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  logLevel: "warning",
});

writeFileSync(
  "dist/schema.sql",
  node(["node_modules/drizzle-kit/bin.cjs", "export"], {
    stdio: ["ignore", "pipe", "inherit"],
    // The export reads the schema only, but the configuration file creates the
    // database's directory; keep that out of the checkout's own state.
    env: { ...process.env, SERVER_GUY_DB_PATH: "dist/.export/unused.db" },
  }),
);
rmSync("dist/.export", { recursive: true, force: true });
copyFileSync("src/server/schema-version.json", "dist/schema-version.json");
