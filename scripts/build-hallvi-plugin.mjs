// Produce a self-contained adapter; no Hallvi state or credentials are copied.
import { build } from "esbuild";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { selectController } from "./controller-client.mjs";
import {
  uiOrigin,
  PLUGIN_VERSION,
  panelResource,
} from "../plugins/hallvi/server.mjs";

const { values } = parseArgs({
  options: {
    controller: { type: "string" },
    "ui-url": { type: "string" },
  },
});
const controller = selectController({ flag: values.controller });
const uiUrl = uiOrigin(values["ui-url"], controller);
const root = resolve("dist/hallvi-plugin");
await mkdir(`${root}/.codex-plugin`, { recursive: true });
await build({
  entryPoints: ["plugins/hallvi/server.mjs"],
  outfile: `${root}/server.mjs`,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
});
await cp("plugins/hallvi/panel.html", `${root}/panel.html`);
await cp("plugins/hallvi/skills", `${root}/skills`, { recursive: true });
// The small mascot of the browser tab, which still reads at an icon's size.
const icon = await readFile("src/app/icon.svg", "utf8");
await writeFile(
  `${root}/icon.svg`,
  icon.replace(
    'viewBox="0 0 40 36"',
    'width="64" height="64" viewBox="-4 -6 48 48"',
  ),
);
const json = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n");
await json(`${root}/.codex-plugin/plugin.json`, {
  name: "hallvi",
  version: PLUGIN_VERSION,
  description: "Operate your self-hosted applications through Hallvi.",
  author: { name: "Hallvi" },
  skills: "./skills/",
  mcpServers: "./.mcp.json",
  interface: {
    displayName: "Hallvi",
    shortDescription: "Operate self-hosted apps",
    longDescription:
      "Connect to an existing Hallvi controller. Inspect applications, send work to its Pi operator, and follow recorded evidence. Approvals remain in Hallvi.",
    developerName: "Hallvi",
    category: "Developer Tools",
    capabilities: ["Read", "Write"],
    logo: "./icon.svg",
    composerIcon: "./icon.svg",
  },
});
await json(`${root}/.mcp.json`, {
  mcpServers: {
    hallvi: {
      command: process.execPath,
      args: ["./server.mjs", "--controller", controller, "--ui-url", uiUrl],
      cwd: ".",
      tool_timeout_sec: 60,
    },
  },
});
await mkdir("dist/.agents/plugins", { recursive: true });
await json("dist/.agents/plugins/marketplace.json", {
  name: "hallvi-poc",
  owner: { name: "Hallvi" },
  plugins: [
    {
      name: "hallvi",
      source: { source: "local", path: "./hallvi-plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    },
  ],
});
const panel = panelResource(await readFile(`${root}/panel.html`, "utf8"));
console.log(
  `Built Hallvi plugin ${PLUGIN_VERSION}: ${root}\nUI resource: ${panel.uri}\nCodex: codex mcp add hallvi -- ${process.execPath} ${root}/server.mjs --controller ${controller} --ui-url ${uiUrl}\nRemote: copy server.mjs and panel.html beside your remote Hallvi, then run with Node 22 over SSH.\nLocal plugin marketplace: ${resolve("dist")}`,
);
