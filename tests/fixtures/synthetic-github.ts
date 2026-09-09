// An in-memory GitHub for the deterministic tests: identity, pinned commits,
// trees and contents at any known commit, tarballs, the Git Data API for
// publication, pull requests, merges of every method, and compare. Failures
// are injected per path pattern. No imports from src so it can be shared.
import { gzipSync } from "node:zlib";

import { fixtureCommitSha, fixtureFiles } from "./github-responses";
import { fixtureTree, type FixtureFile } from "./repositories";

export class SyntheticGithubError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "access" | "unavailable" = "unavailable",
  ) {
    super(message);
  }
}

interface Commit {
  sha: string;
  message: string;
  parents: string[];
  files: FixtureFile[];
}

interface Pull {
  number: number;
  branch: string;
  base: string;
  draft?: boolean;
  state: "open" | "closed";
  merged: boolean;
  mergedAt: string | null;
  mergeCommitSha: string | null;
  title: string;
  body: string;
}

function hex40(seed: string) {
  let hash = 0x811c9dc5;
  let output = "";
  for (let round = 0; round < 5; round++) {
    for (const character of `${seed}#${round}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    output += hash.toString(16).padStart(8, "0");
  }
  return output;
}

export class SyntheticGithub {
  revision = "1";
  failing: RegExp[] = [];
  calls: string[] = [];
  permissions: Record<string, boolean> = {
    pull: true,
    push: false,
    admin: false,
  };
  installationPermissions: Record<string, string> = {
    contents: "read",
    metadata: "read",
  };
  private commits = new Map<string, Commit>();
  private branches = new Map<string, string>();
  private pulls: Pull[] = [];
  private nextPull = 1;
  private blobs = new Map<string, string>();
  private trees = new Map<
    string,
    Array<{ path: string; sha: string | null }>
  >();

  constructor(private readonly fullName: string) {}

  /** Serializable state, so a disposable app can keep it across requests. */
  snapshot() {
    return {
      revision: this.revision,
      permissions: this.permissions,
      installationPermissions: this.installationPermissions,
      commits: [...this.commits.values()],
      branches: [...this.branches.entries()],
      pulls: this.pulls,
      nextPull: this.nextPull,
      blobs: [...this.blobs.entries()],
      trees: [...this.trees.entries()],
    };
  }

  restore(
    state: Partial<ReturnType<SyntheticGithub["snapshot"]>> | null | undefined,
  ) {
    if (!state) return;
    this.revision = state.revision ?? "1";
    this.permissions = state.permissions ?? this.permissions;
    this.installationPermissions =
      state.installationPermissions ?? this.installationPermissions;
    this.commits = new Map(
      (state.commits ?? []).map((commit) => [commit.sha, commit]),
    );
    this.branches = new Map(state.branches ?? []);
    this.pulls = state.pulls ?? [];
    this.nextPull = state.nextPull ?? 1;
    this.blobs = new Map(state.blobs ?? []);
    this.trees = new Map(state.trees ?? []);
  }

  reset() {
    this.commits.clear();
    this.branches.clear();
    this.pulls = [];
    this.blobs.clear();
    this.trees.clear();
    this.nextPull = 1;
    this.revision = "1";
    this.failing = [];
    this.calls = [];
  }

  /** A collaborator appends to an existing branch, preserving its head. */
  appendToBranch(branch: string, files: FixtureFile[], message: string) {
    const parent = this.headOf(branch)!;
    const sha = hex40(`${parent}:${message}:${JSON.stringify(files)}`);
    this.commits.set(sha, { sha, message, parents: [parent], files });
    this.branches.set(branch, sha);
    return sha;
  }

  private baseSha() {
    return fixtureCommitSha(this.fullName, this.revision);
  }

  private headOf(branch = "main") {
    return (
      this.branches.get(branch) ?? (branch === "main" ? this.baseSha() : null)
    );
  }

  filesAt(sha: string): FixtureFile[] | null {
    const commit = this.commits.get(sha);
    if (commit) return commit.files;
    for (const revision of ["1", "2", "3"])
      if (fixtureCommitSha(this.fullName, revision) === sha)
        return fixtureFiles(this.fullName);
    return null;
  }

  head(branch = "main") {
    return this.headOf(branch);
  }

  pullsFor() {
    return this.pulls;
  }

  /** Merges a pull request into main by the given method. */
  merge(number: number, method: "merge" | "squash" | "rebase") {
    const pull = this.pulls.find((item) => item.number === number);
    if (!pull || pull.merged)
      throw new Error(`Pull #${number} cannot be merged`);
    const headSha = this.headOf(pull.branch)!;
    const head = this.commits.get(headSha)!;
    const base = this.headOf("main")!;
    const sha = hex40(
      `${this.fullName}:merge:${number}:${method}:${headSha}:${base}`,
    );
    const message =
      method === "merge"
        ? `Merge pull request #${number} from ${pull.branch}`
        : method === "squash"
          ? `${pull.title} (#${number})`
          : head.message;
    this.commits.set(sha, {
      sha,
      message,
      parents: method === "merge" ? [base, headSha] : [base],
      files: head.files,
    });
    this.branches.set("main", sha);
    pull.merged = true;
    pull.state = "closed";
    pull.mergedAt = new Date().toISOString();
    pull.mergeCommitSha = sha;
    return sha;
  }

  /** Someone else pushes to main: the head moves without a pull request. */
  pushToMain(files: FixtureFile[], message = "Unrelated push") {
    const base = this.headOf("main")!;
    const sha = hex40(`${this.fullName}:push:${message}:${base}`);
    this.commits.set(sha, { sha, message, parents: [base], files });
    this.branches.set("main", sha);
    return sha;
  }

  /** An external harness pushes a branch, optionally opening a pull
   * request. */
  pushBranch(
    branch: string,
    files: FixtureFile[],
    message: string,
    openPull = true,
  ) {
    const base = this.headOf("main")!;
    const sha = hex40(`${this.fullName}:branch:${branch}:${message}:${base}`);
    this.commits.set(sha, { sha, message, parents: [base], files });
    this.branches.set(branch, sha);
    if (openPull)
      this.pulls.push({
        number: this.nextPull++,
        branch,
        base: "main",
        state: "open",
        merged: false,
        mergedAt: null,
        mergeCommitSha: null,
        title: message,
        body: "",
      });
    return { sha, number: openPull ? this.nextPull - 1 : null };
  }

  private pullBody(pull: Pull) {
    return {
      number: pull.number,
      html_url: `https://github.com/${this.fullName}/pull/${pull.number}`,
      state: pull.state,
      merged: pull.merged,
      merged_at: pull.mergedAt,
      merge_commit_sha: pull.mergeCommitSha,
      head: { sha: this.headOf(pull.branch) ?? "", ref: pull.branch },
      base: { ref: pull.base, sha: this.headOf("main") ?? "" },
      title: pull.title,
    };
  }

  archive(
    sha: string,
    writeTar: (entries: Array<{ path: string; content: Buffer }>) => Buffer,
  ) {
    const files = this.filesAt(sha);
    if (!files)
      throw new SyntheticGithubError(
        "The repository is missing or this login cannot access it.",
        "access",
      );
    return gzipSync(
      writeTar(
        files.map((file) => ({
          path: `${this.fullName.replace("/", "-")}-${sha.slice(0, 7)}/${file.path}`,
          content: Buffer.from(file.content),
        })),
      ),
    );
  }

  async request(
    path: string,
    options: {
      method?: string;
      body?: Record<string, unknown>;
      allowNotFound?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<{ data: unknown; scopes: string[] }> {
    this.calls.push(`${options.method ?? "GET"} ${path}`);
    if (options.signal?.aborted) throw options.signal.reason;
    if (this.failing.some((pattern) => pattern.test(path)))
      throw new SyntheticGithubError("GitHub is unavailable. Try again later.");
    const method = options.method ?? "GET";
    if (path === "/user")
      return { data: { id: 1, login: "fixture" }, scopes: ["repo"] };
    if (path.startsWith("/user/installations?"))
      return {
        data: {
          installations: [
            {
              id: 7,
              app_slug: "server-guy-test",
              account: { id: 2, login: this.fullName.split("/")[0] },
              permissions: {
                contents: this.permissions.push ? "write" : "read",
                pull_requests: this.permissions.push ? "write" : "read",
              },
              repository_selection: "selected",
              suspended_at: null,
            },
          ],
        },
        scopes: [],
      };
    if (path.startsWith("/user/installations/7/repositories"))
      return { data: { repositories: [{ id: 99 }] }, scopes: [] };
    const match = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path);
    if (!match) throw new Error(`Unexpected GitHub path ${path}`);
    const [, fullName, rest = ""] = match;
    if (fullName.toLowerCase() !== this.fullName.toLowerCase())
      throw new SyntheticGithubError(
        "The repository is missing or this login cannot access it. Check its URL and repository access on GitHub.",
        "access",
      );
    if (!rest)
      return {
        data: {
          id: 99,
          full_name: fullName,
          visibility: "private",
          default_branch: "main",
          permissions: this.permissions,
        },
        scopes: ["repo"],
      };
    const [route, query = ""] = rest.split("?");
    const params = new URLSearchParams(query);
    if (route.startsWith("/commits/")) {
      const ref = decodeURIComponent(route.slice("/commits/".length));
      const sha = /^[a-f0-9]{40}$/.test(ref) ? ref : this.headOf(ref);
      if (!sha || !this.filesAt(sha)) {
        if (options.allowNotFound) return { data: null, scopes: [] };
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      }
      const commit = this.commits.get(sha);
      return {
        data: {
          sha,
          commit: { message: commit?.message ?? "Fixture commit" },
          parents: (commit?.parents ?? []).map((parent) => ({ sha: parent })),
        },
        scopes: [],
      };
    }
    if (route.startsWith("/git/trees/") && method === "GET") {
      const sha = route.slice("/git/trees/".length);
      const files = this.filesAt(sha);
      if (!files)
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      return {
        data: {
          sha,
          truncated: false,
          tree: fixtureTree(files).map((entry) => ({
            path: entry.path,
            mode: entry.type === "tree" ? "040000" : "100644",
            type: entry.type,
            sha: entry.sha,
            ...(entry.size !== undefined ? { size: entry.size } : {}),
          })),
        },
        scopes: [],
      };
    }
    if (route.startsWith("/contents/")) {
      const filePath = decodeURIComponent(route.slice("/contents/".length));
      const ref = params.get("ref") ?? "main";
      const sha = /^[a-f0-9]{40}$/.test(ref) ? ref : this.headOf(ref);
      const files = sha ? this.filesAt(sha) : null;
      const file = files?.find((candidate) => candidate.path === filePath);
      if (!file) {
        if (options.allowNotFound) return { data: null, scopes: [] };
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      }
      return {
        data: {
          type: "file",
          encoding: "base64",
          size: Buffer.byteLength(file.content),
          name: filePath.split("/").at(-1),
          path: filePath,
          sha: fixtureTree([file]).find((entry) => entry.path === file.path)!
            .sha,
          content: Buffer.from(file.content).toString("base64"),
        },
        scopes: [],
      };
    }
    if (route.startsWith("/git/ref/")) {
      const ref = decodeURIComponent(route.slice("/git/ref/".length)).replace(
        /^heads\//,
        "",
      );
      const sha = this.branches.get(ref);
      if (!sha) {
        if (options.allowNotFound) return { data: null, scopes: [] };
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      }
      return { data: { object: { sha } }, scopes: [] };
    }
    if (route.startsWith("/git/commits/")) {
      const sha = route.slice("/git/commits/".length);
      const commit = this.commits.get(sha);
      if (!commit && !this.filesAt(sha))
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      return {
        data: {
          sha,
          message: commit?.message ?? "Fixture commit",
          parents: (commit?.parents ?? []).map((parent) => ({ sha: parent })),
          tree: { sha },
        },
        scopes: [],
      };
    }
    if (route.startsWith("/git/refs/") && method === "PATCH") {
      const branch = decodeURIComponent(
        route.slice("/git/refs/".length),
      ).replace(/^heads\//, "");
      const head = this.headOf(branch);
      const next = String(options.body?.sha);
      if (
        options.body?.force !== false ||
        !this.commits.get(next)?.parents.includes(head ?? "")
      )
        throw new SyntheticGithubError(
          "The remote branch changed; non-fast-forward update refused.",
          "access",
        );
      this.branches.set(branch, next);
      return { data: { object: { sha: next } }, scopes: [] };
    }
    if (method === "POST") {
      if (!this.permissions.push)
        throw new SyntheticGithubError(
          "GitHub denied access. Check repository permissions and organization approval.",
          "access",
        );
      const body = options.body ?? {};
      if (route === "/git/blobs") {
        const content = Buffer.from(String(body.content), "base64").toString(
          "utf8",
        );
        const sha = fixtureTree([{ path: "file", content }])[0].sha;
        this.blobs.set(
          sha,
          Buffer.from(String(body.content), "base64").toString("utf8"),
        );
        return { data: { sha }, scopes: [] };
      }
      if (route === "/git/trees") {
        const sha = hex40(`tree:${JSON.stringify(body)}`);
        this.trees.set(sha, [
          ...(this.filesAt(String(body.base_tree))?.map((file) => ({
            path: file.path,
            sha: `base:${String(body.base_tree)}:${file.path}`,
          })) ?? []),
        ]);
        const entries = this.trees.get(sha)!;
        for (const entry of body.tree as Array<{
          path: string;
          sha: string | null;
        }>) {
          const index = entries.findIndex((item) => item.path === entry.path);
          if (index >= 0) entries.splice(index, 1);
          if (entry.sha !== null)
            entries.push({ path: entry.path, sha: entry.sha });
        }
        return { data: { sha }, scopes: [] };
      }
      if (route === "/git/commits") {
        const treeSha = String(body.tree);
        const entries = this.trees.get(treeSha) ?? [];
        const parent = String((body.parents as string[])[0]);
        const baseFiles = this.filesAt(parent) ?? [];
        const files: FixtureFile[] = entries.map((entry) => ({
          path: entry.path,
          content: entry.sha?.startsWith("base:")
            ? (baseFiles.find((file) => file.path === entry.path)?.content ??
              "")
            : (this.blobs.get(entry.sha ?? "") ?? ""),
        }));
        const sha = hex40(
          `commit:${treeSha}:${parent}:${String(body.message)}`,
        );
        this.commits.set(sha, {
          sha,
          message: String(body.message),
          parents: [parent],
          files,
        });
        return { data: { sha }, scopes: [] };
      }
      if (route === "/git/refs") {
        const ref = String(body.ref).replace(/^refs\/heads\//, "");
        if (this.branches.has(ref))
          throw new SyntheticGithubError(
            "GitHub rejected the request as invalid for this repository's current state.",
            "access",
          );
        this.branches.set(ref, String(body.sha));
        return { data: { ref: body.ref }, scopes: [] };
      }
      if (route === "/pulls") {
        const pull: Pull = {
          number: this.nextPull++,
          branch: String(body.head),
          base: String(body.base),
          state: "open",
          merged: false,
          mergedAt: null,
          mergeCommitSha: null,
          draft: body.draft === true,
          title: String(body.title),
          body: String(body.body ?? ""),
        };
        this.pulls.push(pull);
        return { data: this.pullBody(pull), scopes: [] };
      }
    }
    if (route === "/pulls" && method === "GET") {
      const head = params.get("head")?.split(":")[1];
      return {
        data: this.pulls
          .filter((pull) => !head || pull.branch === head)
          .map((pull) => this.pullBody(pull)),
        scopes: [],
      };
    }
    if (route.startsWith("/pulls/")) {
      const pull = this.pulls.find(
        (item) => item.number === Number(route.slice("/pulls/".length)),
      );
      if (!pull)
        throw new SyntheticGithubError(
          "The repository is missing or this login cannot access it.",
          "access",
        );
      return { data: this.pullBody(pull), scopes: [] };
    }
    if (route.startsWith("/compare/")) {
      const [base, head] = decodeURIComponent(
        route.slice("/compare/".length),
      ).split("...");
      const baseSha = /^[a-f0-9]{40}$/.test(base) ? base : this.headOf(base);
      const headSha = /^[a-f0-9]{40}$/.test(head) ? head : this.headOf(head);
      const before = baseSha ? (this.filesAt(baseSha) ?? []) : [];
      const after = headSha ? (this.filesAt(headSha) ?? []) : [];
      const files: Array<{ filename: string; status: string }> = [];
      for (const file of after) {
        const previous = before.find((item) => item.path === file.path);
        if (!previous) files.push({ filename: file.path, status: "added" });
        else if (previous.content !== file.content)
          files.push({ filename: file.path, status: "modified" });
      }
      for (const file of before)
        if (!after.some((item) => item.path === file.path))
          files.push({ filename: file.path, status: "removed" });
      const ahead = headSha
        ? this.ancestors(headSha).includes(baseSha ?? "")
        : false;
      return {
        data: {
          status:
            baseSha === headSha ? "identical" : ahead ? "ahead" : "diverged",
          files,
        },
        scopes: [],
      };
    }
    throw new Error(`Unexpected GitHub path ${path}`);
  }

  private ancestors(sha: string) {
    const seen: string[] = [];
    const stack = [sha];
    while (stack.length) {
      const current = stack.pop()!;
      if (seen.includes(current)) continue;
      seen.push(current);
      for (const parent of this.commits.get(current)?.parents ?? [])
        stack.push(parent);
    }
    return seen;
  }
}
