import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture(ssh = true) {
  const root = await mkdtemp(resolve(tmpdir(), "hallvi-plugin-update-"));
  scratch.push(root);
  const marketplace = resolve(root, "marketplace");
  const plugin = resolve(marketplace, "hallvi-plugin");
  const bundle = resolve(root, "bundle");
  const remote = resolve(root, "remote");
  const bin = resolve(root, "bin");
  for (const dir of [
    resolve(marketplace, ".agents/plugins"),
    remote,
    bin,
    ...[plugin, bundle].flatMap((path) => [
      resolve(path, ".codex-plugin"),
      resolve(path, "skills/operate"),
    ]),
  ])
    await mkdir(dir, { recursive: true });
  for (const dir of [plugin, bundle, remote])
    for (const name of ["server.mjs", "panel.html"])
      await writeFile(
        resolve(dir, name),
        `${dir === bundle ? "new" : "old"} ${name}`,
      );
  for (const dir of [plugin, bundle]) {
    await writeFile(
      resolve(dir, ".codex-plugin/plugin.json"),
      JSON.stringify({
        name: "hallvi",
        version: dir === bundle ? "0.2.0" : "0.1.1",
      }),
    );
    await writeFile(resolve(dir, "icon.svg"), "icon");
    await writeFile(resolve(dir, "skills/operate/SKILL.md"), "skill");
  }
  await writeFile(resolve(plugin, "owner-note.txt"), "keep");
  await writeFile(
    resolve(marketplace, ".agents/plugins/marketplace.json"),
    JSON.stringify({
      name: "fixture",
      plugins: [
        {
          name: "hallvi",
          source: { source: "local", path: "./hallvi-plugin" },
        },
      ],
    }),
  );
  const connection = JSON.stringify(
    {
      mcpServers: {
        hallvi: ssh
          ? {
              command: resolve(bin, "ssh"),
              args: [
                "-T",
                "fixture-host",
                `${process.execPath} ${remote}/server.mjs --controller http://127.0.0.1:15447 --ui-url http://127.0.0.1:8474`,
              ],
              startup_timeout_sec: 30,
            }
          : {
              command: process.execPath,
              args: ["./server.mjs", "--controller", "http://127.0.0.1:15447"],
              cwd: ".",
            },
      },
    },
    null,
    2,
  );
  await writeFile(resolve(plugin, ".mcp.json"), connection);
  await writeFile(
    resolve(bundle, ".mcp.json"),
    "must never replace the connection",
  );
  // Run the remote Node program locally, without a network connection.
  await writeFile(resolve(bin, "ssh"), '#!/bin/sh\nexec /bin/sh -c "$3"\n', {
    mode: 0o755,
  });
  await writeFile(
    resolve(bin, "codex"),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$UPDATE_CALL_LOG"\nprintf \'{"version":"0.2.0","installedPath":"%s"}\\n\' "$UPDATE_PLUGIN"\n',
    { mode: 0o755 },
  );
  const invoke = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [
        "scripts/update-hallvi-plugin.mjs",
        "--marketplace-dir",
        marketplace,
        "--bundle",
        bundle,
        ...args,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          UPDATE_CALL_LOG: resolve(root, "codex-call"),
          UPDATE_PLUGIN: plugin,
        },
      },
    );
  return { root, plugin, remote, bin, connection, invoke };
}

test.each([true, false])(
  "updates an existing installation and preserves its connection (SSH=%s)",
  async (ssh) => {
    const f = await fixture(ssh);
    const preview = f.invoke("--dry-run");
    expect(preview.status, preview.stderr).toBe(0);
    expect(await readFile(resolve(f.plugin, "server.mjs"), "utf8")).toBe(
      "old server.mjs",
    );
    await expect(readFile(resolve(f.root, "codex-call"))).rejects.toThrow();
    const update = f.invoke();
    expect(update.status, update.stderr).toBe(0);
    expect(update.stdout).toContain("Adapter code changed");
    expect(await readFile(resolve(f.plugin, ".mcp.json"), "utf8")).toBe(
      f.connection,
    );
    expect(await readFile(resolve(f.plugin, "owner-note.txt"), "utf8")).toBe(
      "keep",
    );
    for (const dir of ssh ? [f.plugin, f.remote] : [f.plugin])
      expect(await readFile(resolve(dir, "panel.html"), "utf8")).toBe(
        "new panel.html",
      );
    expect(await readFile(resolve(f.root, "codex-call"), "utf8")).toBe(
      "plugin\nadd\nhallvi@fixture\n--json\n",
    );
    const again = f.invoke();
    expect(again.status, again.stderr).toBe(0);
    expect(again.stdout).toContain("Adapter code unchanged");
  },
);

test("SSH failure leaves the marketplace alone and never invokes install", async () => {
  const f = await fixture();
  await writeFile(
    resolve(f.bin, "ssh"),
    "#!/bin/sh\necho secret-diagnostic >&2\nexit 255\n",
    { mode: 0o755 },
  );
  const result = f.invoke();
  expect(result.status).toBe(1);
  expect(result.stderr).not.toContain("secret-diagnostic");
  expect(await readFile(resolve(f.plugin, "server.mjs"), "utf8")).toBe(
    "old server.mjs",
  );
  expect(await readFile(resolve(f.plugin, ".mcp.json"), "utf8")).toBe(
    f.connection,
  );
  await expect(readFile(resolve(f.root, "codex-call"))).rejects.toThrow();
});
