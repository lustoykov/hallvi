// Before a deployment selects a revision, Pi's workspace reads the default
// branch through the repository identity a successful access check pinned.
// A later failed or unavailable check does not release that pin.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { pushTestDatabase } from "../../test-database";

const github = vi.hoisted(() => ({ repositoryId: 10 }));
vi.mock("../../../src/server/github-connection", async (original) => ({
  ...(await original<object>()),
  connectedGithubCredential: async () => ({
    connection: { id: "connection" },
    token: "synthetic",
  }),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<object>()),
  githubJson: async (path: string) => ({
    data: path.includes("/commits/")
      ? { sha: "c".repeat(40) }
      : { id: github.repositoryId, default_branch: "main" },
  }),
}));
vi.mock("../../../src/server/execution-tree", async (original) => ({
  ...(await original<object>()),
  fetchBaseTree: async () => ({ files: [], omitted: [] }),
}));
import * as store from "../../../src/server/db";
import { applicationWorkspaceSource } from "../../../src/server/pi-workspace-source";

let root: string, app: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-workspace-source-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "db.sqlite"));
  vi.stubEnv("HALLVI_CONFIG_DIR", join(root, "config"));
  pushTestDatabase(process.env.HALLVI_DB_PATH!);
});
beforeEach(() => {
  store.db().$client.exec("DELETE FROM applications");
  app = store.insertApplication({
    name: "source",
    repositoryUrl: "https://github.com/qa/source",
    repositoryOwner: "qa",
    repositoryName: "source",
  }).id;
  github.repositoryId = 10;
});
afterAll(() => {
  globalThis.__hallviDb?.$client.close();
  delete globalThis.__hallviDb;
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const check = (
  status: "passed" | "failed" | "unavailable",
  raw: Record<string, unknown>,
) =>
  store.insertObservation({
    applicationId: app,
    kind: "github-repository-identity",
    status,
    summary: `Repository check ${status}`,
    sourceLabel: "GitHub repository check",
    sourceUrl: null,
    raw,
  });

it("keeps the identity a successful check pinned after a later check could not record one", async () => {
  check("passed", { connectionId: "connection", repositoryId: 10 });
  check("unavailable", { connectionId: "connection", error: "timeout" });
  await expect(applicationWorkspaceSource(app)).resolves.toMatchObject({
    description: expect.stringContaining(`qa/source@${"c".repeat(40)}`),
  });
  // Another repository now answering to the same owner/name is refused.
  github.repositoryId = 11;
  await expect(applicationWorkspaceSource(app)).rejects.toThrow(
    "identity changed",
  );
});

it("reads the default branch before any successful check has pinned an identity", async () => {
  check("failed", { connectionId: "connection" });
  github.repositoryId = 11;
  await expect(applicationWorkspaceSource(app)).resolves.toMatchObject({
    files: [],
  });
});
