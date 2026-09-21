import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { actualContents, schemaOf } from "../../dashboard/development";
import { createDashboard, dispatchRelease } from "../../dashboard/server";

vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  return {
    ...real,
    execFileSync: vi.fn((...args: Parameters<typeof real.execFileSync>) => {
      if (args[0] === "gh") return "";
      return real.execFileSync(...args);
    }),
  };
});
const temporary: string[] = [];
function fixture() {
  const path = mkdtempSync(join(tmpdir(), "hallvi-dashboard-"));
  temporary.push(path);
  return path;
}
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true });
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it("links a paired dashboard to its controller and reports that controller's database", async () => {
  const root = fixture();
  const path = join(root, "paired.db");
  new Database(path).close();
  vi.stubEnv("HALLVI_DEV_APP_PORT", "60491");
  vi.stubEnv("HALLVI_DB_PATH", path);
  const dashboard = createDashboard(root);
  dashboard.server.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) =>
      dashboard.server.once("listening", resolve),
    );
    const address = dashboard.server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const origin = `http://127.0.0.1:${address.port}`;
    const page = await (await fetch(origin)).text();
    expect(page).toContain('href="http://127.0.0.1:60491/applications"');
    const development = await fetch(`${origin}/api/development`, {
      headers: { "x-hallvi-testing-token": dashboard.token },
    });
    const state = await development.json();
    expect(state.running.address).toBe("http://127.0.0.1:60491");
    expect(state.records.path).toBe(path);
  } finally {
    dashboard.stop();
  }
});

it("reports a schema committed in the WAL while the controller is running", () => {
  const path = join(fixture(), "hallvi.db");
  const writer = new Database(path);
  try {
    writer.pragma("user_version = 15");
    writer.pragma("journal_mode = WAL");
    writer.pragma("wal_autocheckpoint = 0");
    writer.pragma("user_version = 18");
    expect(schemaOf(path)).toBe(18);
  } finally {
    writer.close();
  }
});

it("reads a dependency archive whose path listing exceeds Node's default buffer", () => {
  const root = fixture();
  const archive = join(root, "hallvi.tgz");
  // Empty tar entries are enough to reproduce the real package's long listing.
  execFileSync("python3", [
    "-c",
    `
import sys, tarfile
with tarfile.open(sys.argv[1], "w:gz") as archive:
    for i in range(16000):
        archive.addfile(tarfile.TarInfo("hallvi/node_modules/dependency/" + "a" * 80 + str(i)))
`,
    archive,
  ]);
  expect(actualContents(archive)).toHaveLength(16000);
});

it("dispatches the displayed commit via its branch and rejects stale selections", () => {
  const root = fixture();
  execFileSync("git", ["init", "-b", "release-candidate", root]);
  writeFileSync(join(root, "package.json"), '{"version":"0.1.0"}');
  execFileSync("git", ["add", "package.json"], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: root },
  );
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  expect(dispatchRelease(root, "0.1.0", revision).started).toBe(true);
  const commands = vi
    .mocked(execFileSync)
    .mock.calls.filter(([command]) => command === "gh");
  expect(commands).toHaveLength(1);
  expect(commands[0][1]).toEqual([
    "workflow",
    "run",
    "release.yml",
    "--repo",
    "lustoykov/hallvi",
    "--ref",
    "release-candidate",
    "-f",
    "version=0.1.0",
    "-f",
    "channel=alpha",
    "-f",
    `expected_revision=${revision}`,
  ]);
  vi.clearAllMocks();
  expect(dispatchRelease(root, "0.1.0", "0".repeat(40)).started).toBe(false);
  expect(dispatchRelease(root, "0.2.0", revision).started).toBe(false);
  execFileSync("git", ["checkout", "--detach"], { cwd: root });
  expect(dispatchRelease(root, "0.1.0", revision).started).toBe(false);
  expect(
    vi.mocked(execFileSync).mock.calls.some(([command]) => command === "gh"),
  ).toBe(false);
});
