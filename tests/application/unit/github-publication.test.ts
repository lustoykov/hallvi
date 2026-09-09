import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ githubJson: vi.fn() }));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof import("../../../src/server/github-api")>()),
  githubJson: mocks.githubJson,
}));

import {
  classifyMerge,
  proposalBranchName,
  publishToGithub,
  verifyPublicationPermissions,
} from "../../../src/server/github-publication";

const BASE = "a".repeat(40);
const request = {
  fullName: "qa/app",
  defaultBranch: "main",
  baseSha: BASE,
  proposalId: "12345678-0000-4000-8000-000000000000",
  branch: proposalBranchName("12345678-0000-4000-8000-000000000000"),
  title: "Make launch-ready: health.path",
  body: "Adds /health",
  changes: [
    { path: "app/main.py", content: "print(1)\n", baseObservationId: "o" },
    { path: "old.txt", content: null, baseObservationId: "p" },
  ],
};

/** A tiny GitHub: refs, blobs, trees, commits and pulls in memory. */
function synthetic(
  initial: {
    refSha?: string;
    refMessage?: string;
    pulls?: Array<{ number: number; state: string; merged?: boolean }>;
  } = {},
) {
  const state = {
    ref: initial.refSha ?? null,
    commits: new Map<string, { message: string; parents?: string[] }>(),
    pulls: initial.pulls ?? [],
    created: [] as string[],
  };
  if (initial.refSha)
    state.commits.set(initial.refSha, { message: initial.refMessage ?? "" });
  mocks.githubJson.mockImplementation(
    async (
      path: string,
      _token: string,
      options?: {
        method?: string;
        body?: Record<string, unknown>;
        allowNotFound?: boolean;
      },
    ) => {
      state.created.push(`${options?.method ?? "GET"} ${path}`);
      if (path.includes("/git/ref/")) {
        if (!state.ref) {
          if (options?.allowNotFound) return { data: null, scopes: [] };
          throw new Error("404");
        }
        return { data: { object: { sha: state.ref } }, scopes: [] };
      }
      if (path.includes("/git/commits/")) {
        const sha = path.split("/").at(-1)!;
        return {
          data: {
            sha,
            message: state.commits.get(sha)?.message ?? "",
            parents: (state.commits.get(sha)?.parents ?? [BASE]).map((sha) => ({
              sha,
            })),
            tree: { sha: "t" },
          },
          scopes: [],
        };
      }
      if (path.endsWith("/git/blobs"))
        return { data: { sha: `blob-${state.created.length}` }, scopes: [] };
      if (path.endsWith("/git/trees"))
        return { data: { sha: "tree-1" }, scopes: [] };
      if (path.endsWith("/git/commits")) {
        const sha = "c".repeat(40);
        state.commits.set(sha, { message: String(options?.body?.message) });
        return { data: { sha }, scopes: [] };
      }
      if (path.endsWith("/git/refs")) {
        state.ref = String(options?.body?.sha);
        return { data: { ref: options?.body?.ref }, scopes: [] };
      }
      if (path.includes("/pulls?head=")) {
        return {
          data: state.pulls.map((pull) => ({
            number: pull.number,
            html_url: `https://github.com/qa/app/pull/${pull.number}`,
            state: pull.state,
            merged: pull.merged ?? false,
            head: { sha: state.ref ?? "", ref: request.branch },
            base: { ref: "main", sha: BASE },
          })),
          scopes: [],
        };
      }
      if (path.endsWith("/pulls")) {
        state.pulls.push({ number: 42, state: "open" });
        return {
          data: {
            number: 42,
            html_url: "https://github.com/qa/app/pull/42",
            state: "open",
            head: { sha: state.ref, ref: request.branch },
            base: { ref: "main", sha: BASE },
          },
          scopes: [],
        };
      }
      throw new Error(`Unexpected ${path}`);
    },
  );
  return state;
}

describe("publication through the Git Data API", () => {
  it("creates one branch and one pull request from the staged files, deletes included", async () => {
    const state = synthetic();
    const receipt = await publishToGithub("token", request);
    expect(receipt).toMatchObject({
      branch: request.branch,
      pullRequestNumber: 42,
      adopted: false,
    });
    expect(state.created.filter((call) => call.startsWith("POST"))).toEqual([
      "POST /repos/qa/app/git/blobs",
      "POST /repos/qa/app/git/trees",
      "POST /repos/qa/app/git/commits",
      "POST /repos/qa/app/git/refs",
      "POST /repos/qa/app/pulls",
    ]);
    expect(state.commits.get("c".repeat(40))?.message).toContain(
      `Server-Guy-Proposal: ${request.proposalId}`,
    );
  });

  it("adopts a branch and pull request an interrupted attempt already created instead of duplicating them", async () => {
    const state = synthetic({
      refSha: "d".repeat(40),
      refMessage: `Earlier\n\nServer-Guy-Proposal: ${request.proposalId}`,
      pulls: [{ number: 7, state: "open" }],
    });
    const receipt = await publishToGithub("token", request);
    expect(receipt).toMatchObject({
      commitSha: "d".repeat(40),
      pullRequestNumber: 7,
      adopted: true,
    });
    expect(state.created.some((call) => call.startsWith("POST"))).toBe(false);
  });

  it("refuses to overwrite a branch that was not created from this proposal", async () => {
    synthetic({ refSha: "e".repeat(40), refMessage: "Someone else's work" });
    await expect(publishToGithub("token", request)).rejects.toThrow(
      /already exists .* could not be identified/,
    );
  });

  it("preserves collaborator commits when recovering a lost publication receipt", async () => {
    const published = "d".repeat(40);
    const collaborator = "e".repeat(40);
    const state = synthetic({
      refSha: collaborator,
      refMessage: "User adds a route",
      pulls: [{ number: 7, state: "open" }],
    });
    state.commits.set(collaborator, {
      message: "User adds a route",
      parents: [published],
    });
    state.commits.set(published, {
      message: `Earlier\n\nServer-Guy-Proposal: ${request.proposalId}`,
      parents: [BASE],
    });
    expect(await publishToGithub("token", request)).toMatchObject({
      commitSha: published,
      pullRequestNumber: 7,
      adopted: true,
    });
    expect(state.ref).toBe(collaborator);
    expect(state.created.some((call) => /^(POST|PATCH)/.test(call))).toBe(
      false,
    );
  });

  it.each(["similar-id", "different-base"])(
    "does not adopt a misleading proposal marker: %s",
    async (kind) => {
      const head = "e".repeat(40);
      const state = synthetic({ refSha: head });
      state.commits.set(head, {
        message: `Server-Guy-Proposal: ${request.proposalId}${kind === "similar-id" ? "-other" : ""}`,
        parents: kind === "different-base" ? ["f".repeat(40)] : [BASE],
      });
      await expect(publishToGithub("token", request)).rejects.toThrow(
        /could not be identified/,
      );
      expect(state.created.some((call) => /^(POST|PATCH)/.test(call))).toBe(
        false,
      );
    },
  );

  it("classifies merge methods from the merge commit", () => {
    expect(
      classifyMerge(
        { message: "Merge pull request #7", parents: ["a", "b"] },
        7,
      ),
    ).toBe("merge");
    expect(
      classifyMerge({ message: "Add health (#7)", parents: ["a"] }, 7),
    ).toBe("squash");
    expect(classifyMerge({ message: "Add health", parents: ["a"] }, 7)).toBe(
      "rebase",
    );
  });

  it("verifies the minimum permissions for each mechanism and reports what was observed", async () => {
    mocks.githubJson.mockImplementation(async (path: string) => {
      if (path === "/repos/qa/app")
        return {
          data: {
            permissions: { push: false, pull: true },
            default_branch: "main",
          },
          scopes: [],
        };
      if (path === "/user/installations?per_page=100&page=1")
        return {
          data: {
            installations: [
              {
                id: 9,
                suspended_at: null,
                permissions: { contents: "read", pull_requests: "none" },
              },
            ],
          },
          scopes: [],
        };
      throw new Error(path);
    });
    const cli = await verifyPublicationPermissions(
      "token",
      "qa/app",
      "cli",
      null,
    );
    expect(cli).toMatchObject({
      ok: false,
      reason: expect.stringContaining("cannot push"),
    });
    const app = await verifyPublicationPermissions("token", "qa/app", "app", 9);
    expect(app.ok).toBe(false);
    expect(app.reason).toContain("contents: read, pull_requests: none");
    expect(app.observed).toMatchObject({ installationId: 9 });
    mocks.githubJson.mockImplementation(async (path: string) => {
      if (path === "/repos/qa/app")
        return {
          data: { permissions: { push: true }, default_branch: "main" },
          scopes: [],
        };
      throw new Error(path);
    });
    expect(
      (await verifyPublicationPermissions("token", "qa/app", "cli", null)).ok,
    ).toBe(true);
  });

  it("finds the exact App installation on a later page using the user-token endpoint", async () => {
    const observed = {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    };
    const paths: string[] = [];
    mocks.githubJson.mockImplementation(async (path: string) => {
      paths.push(path);
      if (path === "/repos/qa/app")
        return { data: { default_branch: "main" }, scopes: [] };
      if (path === "/user/installations?per_page=100&page=1")
        return {
          data: {
            installations: Array.from({ length: 100 }, (_, id) => ({
              id: id + 100,
              suspended_at: null,
              permissions: observed,
            })),
          },
          scopes: [],
        };
      if (path === "/user/installations?per_page=100&page=2")
        return {
          data: {
            installations: [
              { id: 9, suspended_at: null, permissions: observed },
            ],
          },
          scopes: [],
        };
      throw new Error(`Unsupported GitHub endpoint: ${path}`);
    });
    expect(
      await verifyPublicationPermissions("token", "qa/app", "app", 9),
    ).toEqual({
      ok: true,
      reason: null,
      observed: { installationId: 9, permissions: observed },
    });
    expect(paths).toEqual([
      "/repos/qa/app",
      "/user/installations?per_page=100&page=1",
      "/user/installations?per_page=100&page=2",
    ]);
  });

  it.each([false, true])(
    "refuses an unavailable or suspended installation (suspended: %s)",
    async (suspended) => {
      mocks.githubJson.mockImplementation(async (path: string) => {
        if (path === "/repos/qa/app")
          return { data: { default_branch: "main" }, scopes: [] };
        if (path === "/user/installations?per_page=100&page=1")
          return {
            data: {
              installations: [
                {
                  id: suspended ? 9 : 10,
                  suspended_at: suspended ? "2026-09-06T00:00:00Z" : null,
                  permissions: { contents: "write", pull_requests: "write" },
                },
              ],
            },
            scopes: [],
          };
        throw new Error(`Unsupported GitHub endpoint: ${path}`);
      });
      expect(
        await verifyPublicationPermissions("token", "qa/app", "app", 9),
      ).toMatchObject({
        ok: false,
        reason: expect.stringContaining("unavailable or suspended"),
      });
    },
  );
});
