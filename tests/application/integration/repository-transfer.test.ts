import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import * as store from "../../../src/server/db";
import * as api from "../../../src/server/github-api";
import {
  saveOperatorSettings,
  executionContext,
  listExecutions,
} from "../../../src/server/operator-execution";
import { copyRepositoryToServer } from "../../../src/server/repository-transfer";
import { writeTar } from "../../../src/server/tar";
import { pushTestDatabase } from "../../test-database";

const state = vi.hoisted(() => ({
  token: "ghu_fixture_only_never_on_host",
  calls: [] as string[][],
}));
vi.mock("../../../src/server/github-connection", async (original) => ({
  ...(await original<object>()),
  repositoryCredential: async () => ({
    token: state.token,
    connection: { id: "fixture-connection" },
  }),
  currentGithubConnectionId: () => "fixture-connection",
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<object>()),
  githubJson: vi.fn(),
  githubArchive: vi.fn(),
}));
// Run the actual upload/checksum/extraction script on a disposable local
// directory. Only SSH's transport is replaced, not the bytes or commands.
vi.mock("node:child_process", async (original) => {
  const childProcess = await original<typeof import("node:child_process")>();
  return {
    ...childProcess,
    spawn: (file: string, args: string[], options: object) => {
      if (file !== "ssh") return childProcess.spawn(file, args, options);
      state.calls.push(args);
      return childProcess.spawn("bash", ["-c", args.at(-1)!], options);
    },
  };
});
let root: string;
let applicationId: string;
let chatId: string;
let tip = "a".repeat(40);
const staged: string[] = [];
const binary = Buffer.from([0, 255, 1, 129]);
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-source-test-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "test.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
  const app = store.insertApplication({
    name: "Private app",
    repositoryUrl: "https://github.com/qa/private",
    repositoryOwner: "qa",
    repositoryName: "private",
  });
  applicationId = app.id;
  chatId = store.insertChat(app.id, "Main operator").id;
  saveOperatorSettings(app.id, {
    permissionMode: "bypass",
    host: {
      address: "fixture.invalid",
      user: "root",
      port: 22,
      privateKeyPath: "/fixture/key",
      knownHostsPath: "/fixture/hosts",
    },
  });
  vi.mocked(api.githubJson).mockImplementation(async (path, token) => {
    expect(token).toBe(state.token);
    if (path === "/repos/qa/private")
      return {
        data: { id: 42, full_name: "qa/private", default_branch: "main" },
        scopes: [],
      };
    expect(path).toBe("/repos/qa/private/commits/main");
    return { data: { sha: tip }, scopes: [] };
  });
  vi.mocked(api.githubArchive).mockImplementation(async (repo, sha, token) => {
    expect([repo, sha, token]).toEqual(["qa/private", tip, state.token]);
    return gzipSync(
      writeTar([
        {
          path: "github-root/index.html",
          content: Buffer.from(`release ${sha}`),
        },
        { path: "github-root/assets/icon.bin", content: binary },
        {
          path: "github-root/start.sh",
          content: Buffer.from("#!/bin/sh\necho ok\n"),
          mode: 0o755,
        },
      ]),
    );
  });
});
afterAll(() => {
  for (const path of staged) rmSync(path, { recursive: true, force: true });
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
it("copies private main twice with the same connection, preserves exact files and old source, and records no credential", async () => {
  const copy = async () => {
    const result = await executionContext({ applicationId, chatId }).execute(
      "copy_repository_to_server",
      "connected server",
      { ref: "main" },
      () => copyRepositoryToServer(applicationId, "main"),
      false,
      `copy-${tip}`,
    );
    if ("declined" in result) throw new Error("unexpected decline");
    staged.push(dirname(result.directory));
    return result;
  };
  const first = await copy();
  tip = "b".repeat(40);
  const second = await copy();
  expect(first.commit).toBe("a".repeat(40));
  expect(second.commit).toBe(tip);
  expect(second.directory).not.toBe(first.directory);
  expect(readFileSync(join(first.directory, "index.html"), "utf8")).toBe(
    `release ${first.commit}`,
  );
  expect(readFileSync(join(second.directory, "index.html"), "utf8")).toBe(
    `release ${tip}`,
  );
  expect(readFileSync(join(second.directory, "assets/icon.bin"))).toEqual(
    binary,
  );
  expect(statSync(join(second.directory, "start.sh")).mode & 0o111).toBe(0o111);
  expect(
    JSON.stringify([state.calls, first, second, listExecutions(applicationId)]),
  ).not.toContain(state.token);
  expect(
    listExecutions(applicationId).every(
      (record) => record.status === "succeeded",
    ),
  ).toBe(true);
});
it("does not contact the server when GitHub denies the source download", async () => {
  const before = state.calls.length;
  vi.mocked(api.githubArchive).mockRejectedValueOnce(
    new api.GithubAccessError("Check repository access", "access"),
  );
  await expect(copyRepositoryToServer(applicationId, "main")).rejects.toThrow(
    "Check repository access",
  );
  expect(state.calls).toHaveLength(before);
});
it("rejects an unsafe source path before touching the server", async () => {
  const before = state.calls.length;
  vi.mocked(api.githubArchive).mockResolvedValueOnce(
    gzipSync(
      writeTar([
        { path: "github-root/../escape", content: Buffer.from("bad") },
      ]),
    ),
  );
  await expect(copyRepositoryToServer(applicationId, "main")).rejects.toThrow(
    "Unsafe path",
  );
  expect(state.calls).toHaveLength(before);
});
