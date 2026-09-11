import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  github: vi.fn(),
  deployment: vi.fn(),
  operation: vi.fn(),
  root: "",
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  githubJson: mocks.github,
}));
vi.mock("../../../src/server/github-connection", () => ({
  connectedGithubCredential: async () => ({ token: "ghu_synthetic" }),
}));
vi.mock("../../../src/server/db", async (original) => ({
  ...(await original<typeof import("../../../src/server/db")>()),
  getApplication: () => ({
    id: "app-a",
    repositoryOwner: "linuxserver",
    repositoryName: "docker-bookstack",
  }),
  databasePath: () => join(mocks.root, "server-guy.db"),
}));
vi.mock("../../../src/server/applications", () => ({
  recordedRepositoryId: () => 7,
}));
vi.mock("../../../src/server/deployment-store", () => ({
  applicationDeployment: mocks.deployment,
}));
vi.mock("../../../src/server/operation-store", async (original) => ({
  ...(await original<typeof import("../../../src/server/operation-store")>()),
  operation: mocks.operation,
}));
import {
  compareRepository,
  operationEvidence,
  readRepository,
} from "../../../src/server/pi-evidence";

const signal = new AbortController().signal;
const deployed = "d".repeat(40);
const upstream = "c".repeat(40);
beforeEach(() => {
  mocks.root = mkdtempSync(join(tmpdir(), "sg-evidence-"));
  mocks.deployment.mockReturnValue({ revision: deployed, repositoryId: 7 });
  mocks.github.mockReset().mockImplementation(async (path: string) => {
    const routes: Record<string, unknown> = {
      "/repos/linuxserver/docker-bookstack": {
        id: 7,
        full_name: "linuxserver/docker-bookstack",
        private: false,
      },
      [`/repos/linuxserver/docker-bookstack/contents/Dockerfile?ref=${deployed}`]:
        {
          type: "file",
          encoding: "base64",
          content: Buffer.from("FROM ghcr.io/linuxserver/baseimage").toString(
            "base64",
          ),
          sha: "e".repeat(40),
          size: 34,
          path: "Dockerfile",
        },
      "/repos/BookStackApp/BookStack": {
        id: 1,
        full_name: "BookStackApp/BookStack",
        private: false,
        default_branch: "development",
      },
      "/repos/BookStackApp/BookStack/commits/v26.05.4": { sha: upstream },
      [`/repos/BookStackApp/BookStack/contents/database/migrations?ref=${upstream}`]:
        [
          {
            name: "2026_04_19_add_permission.php",
            path: "database/migrations/2026_04_19_add_permission.php",
            type: "file",
            size: 900,
          },
          { name: ".env", path: "database/migrations/.env", type: "file" },
        ],
      "/repos/BookStackApp/BookStack/compare/v26.03.5...v26.05.4": {
        status: "ahead",
        ahead_by: 2,
        commits: [
          { sha: "1".repeat(40), commit: { message: "Add permission\n\nbody" } },
        ],
        files: [
          {
            filename: "database/migrations/2026_04_19_add_permission.php",
            status: "added",
            additions: 30,
            deletions: 0,
            patch: "+Schema::table('permissions')",
          },
          {
            filename: "app/Http/Kernel.php",
            status: "modified",
            additions: 1,
            deletions: 1,
            patch: "-a\n+b",
          },
        ],
      },
      "/repos/acme/private-notes": { id: 9, private: true },
    };
    if (!(path in routes)) throw new Error(`Unexpected GitHub path ${path}`);
    return { data: routes[path], scopes: [] };
  });
});

it("reads this application's pinned repository and public upstream projects at exact commits, never another private repository", async () => {
  // This application's repository defaults to the deployed revision.
  await expect(
    readRepository("app-a", { path: "Dockerfile" }, signal),
  ).resolves.toMatchObject({
    revision: deployed,
    kind: "file",
    text: "FROM ghcr.io/linuxserver/baseimage",
  });
  await expect(
    readRepository(
      "app-a",
      {
        repository: "BookStackApp/BookStack",
        ref: "v26.05.4",
        path: "database/migrations/",
      },
      signal,
    ),
  ).resolves.toMatchObject({
    revision: upstream,
    kind: "directory",
    entries: [
      { name: "2026_04_19_add_permission.php", type: "file", size: 900 },
    ],
  });
  // Patches only under the named path.
  const compared = await compareRepository(
    "app-a",
    {
      repository: "BookStackApp/BookStack",
      base: "v26.03.5",
      head: "v26.05.4",
      path: "database/migrations",
    },
    signal,
  );
  expect(compared.commits).toEqual([`${"1".repeat(12)} Add permission`]);
  expect(compared.files.map((file) => "patch" in file)).toEqual([true, false]);
  await expect(
    readRepository("app-a", { repository: "acme/private-notes" }, signal),
  ).rejects.toThrow("public repositories");
  mocks.deployment.mockReturnValue({ revision: deployed, repositoryId: 8 });
  await expect(
    readRepository("app-a", { path: "Dockerfile" }, signal),
  ).rejects.toThrow("identity changed");
});

it("returns an operation's attempts, the events of its time and only its own planning journal", () => {
  const journal = (workspace: string, runId: string, events: object[]) => {
    mkdirSync(join(mocks.root, "pi-workspaces", workspace), {
      recursive: true,
    });
    writeFileSync(
      join(mocks.root, "pi-workspaces", workspace, "events.jsonl"),
      events
        .map((event) =>
          JSON.stringify({
            at: "2026-09-11T12:42:00.000Z",
            applicationId: "app-a",
            runId,
            workspaceId: workspace,
            ...event,
          }),
        )
        .join("\n") + "\n",
    );
  };
  journal("w1", "op-1", [
    { type: "tool-start", name: "inspect_runtime", args: {} },
    {
      type: "tool-end",
      name: "inspect_runtime",
      result: {
        content: [{ type: "text", text: "10-admin: line 1: ?php: not found" }],
      },
    },
    { type: "model-stop", stopReason: "error", error: "overloaded" },
  ]);
  journal("w2", "op-2", [{ type: "tool-error", name: "x", error: "other" }]);
  mocks.operation.mockReturnValue({
    id: "op-1",
    applicationId: "app-a",
    title: "Release 5d9c1a8",
    kind: "change",
    state: "failed",
    source: { type: "release", id: "deployment" },
    startedAt: "2026-09-11T12:40:00.000Z",
    updatedAt: "2026-09-11T12:49:00.000Z",
    summary: "The agent stopped",
  });
  mocks.deployment.mockReturnValue({
    events: [
      { at: "2026-09-11T12:39:00.000Z", message: "Earlier work" },
      { at: "2026-09-11T12:42:00.000Z", message: "Release feedback: failed" },
    ],
    lifecycle: {
      attempts: [
        {
          operationId: "op-1",
          kind: "release",
          outcome: "failed",
          releaseId: "f".repeat(64),
          startedAt: "2026-09-11T12:41:00.000Z",
          finishedAt: "2026-09-11T12:43:00.000Z",
          remoteResult: { phase: "verify", exitCode: 1, at: "" },
          error: "Behavior check failed",
        },
        { operationId: "op-2", releaseId: "0".repeat(64) },
      ],
    },
  });
  const evidence = operationEvidence("app-a", "op-1");
  expect(evidence.attempts).toEqual([
    {
      kind: "release",
      outcome: "failed",
      release: "f".repeat(12),
      startedAt: "2026-09-11T12:41:00.000Z",
      finishedAt: "2026-09-11T12:43:00.000Z",
      hostResult: "verify exited 1",
      error: "Behavior check failed",
    },
  ]);
  expect(evidence.events).toEqual([
    "2026-09-11T12:42:00 Release feedback: failed",
  ]);
  const planning = evidence.planning as { sessions: number; entries: string };
  expect(planning.sessions).toBe(1);
  expect(planning.entries).toContain("?php: not found");
  expect(planning.entries).toContain("model stopped: error (overloaded)");
  expect(planning.entries).not.toContain("other");
  expect(() => operationEvidence("app-b", "op-1")).toThrow("No operation");
});
