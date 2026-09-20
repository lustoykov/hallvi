// Proposing a change back to the owner's repository: a real workspace, Pi's
// real file tools, the real publishing code, and GitHub's API answered from
// memory so every write it would make is visible and countable.
//
// What this protects: the diff published is the one Pi made against the
// revision it was given, the branch the application deploys from is never
// written to, a file the copy only holds redacted is never written back, an
// installation without write permission is told which permission is missing,
// and a pull request that fails after the branch exists says so and is not
// duplicated on the retry.
import * as sdk from "@earendil-works/pi-coding-agent";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../../temporary-root.mjs";
import * as api from "../../../src/server/github-api";
import {
  PiWorkspace,
  piWorkspaceTools,
} from "../../../src/server/pi-workspace";
import { proposeRepositoryChanges } from "../../../src/server/github-proposal";

vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof api>()),
  githubJson: vi.fn(),
}));
vi.mock("../../../src/server/github-connection", async (original) => ({
  ...(await original<object>()),
  connectedGithubCredential: async () => ({
    connection: {
      id: "connection",
      mode: "app",
      slug: "hallvi-test",
      account: { id: 7, login: "qa" },
    },
    token: TOKEN,
  }),
}));

const TOKEN = "ghu_private-access-token";
const BASE = "a".repeat(40);
const secret = `ghp_${"D".repeat(36)}`;
const json = vi.mocked(api.githubJson);

/** The repository as GitHub holds it, and every write aimed at it. */
type Fake = {
  defaultBranch: string;
  permissions: Record<string, string>;
  files: Map<string, string>;
  /** Upstream paths the repository holds with the executable bit set. */
  executable: Set<string>;
  refs: Map<string, string>;
  blobs: Map<string, Buffer>;
  trees: Map<string, Array<{ path: string; mode: string; sha: string }>>;
  commits: Map<string, { tree: string; parents: string[]; message: string }>;
  pulls: Array<{ number: number; head: string; base: string; title: string }>;
  /** Set to make the next pull-request creation fail. */
  refusePulls?: string;
  /** Set when the repository is too large for GitHub to list in one go. */
  truncatedTree?: boolean;
  calls: string[];
};
let github: Fake;
let root: string;

const sha = (value: string) =>
  createHash("sha1").update(value).digest("hex").slice(0, 40);

function answer(path: string, options?: { method?: string; body?: unknown }) {
  const method = options?.method ?? "GET";
  github.calls.push(`${method} ${path}`);
  const body = options?.body as Record<string, never> | undefined;
  const repo = "qa/app";
  const match = (pattern: RegExp) => pattern.exec(path);
  if (path === `/repos/${repo}`)
    return {
      id: 4242,
      full_name: repo,
      default_branch: github.defaultBranch,
      permissions: { push: true, admin: true },
    };
  if (path.startsWith("/user/installations?"))
    return {
      installations: [
        {
          id: 99,
          app_slug: "hallvi-test",
          account: { id: 7, login: "qa" },
          permissions: github.permissions,
          repository_selection: "selected",
          suspended_at: null,
        },
      ],
    };
  if (path.startsWith("/user/installations/99/repositories"))
    return { repositories: [{ id: 4242 }] };
  if (match(/^\/repos\/qa\/app\/git\/ref\/heads\/(.+)$/)) {
    const name = decodeURIComponent(
      match(/^\/repos\/qa\/app\/git\/ref\/heads\/(.+)$/)![1],
    );
    const tip = github.refs.get(name);
    return tip ? { object: { sha: tip } } : null;
  }
  const compare = match(/^\/repos\/qa\/app\/compare\/([^.]+)\.\.\.(.+)$/);
  if (compare) {
    const [, from, to] = compare;
    // Only commits this test made descend from BASE, and they all do; what
    // the branch carries beyond the revision is what publishing looks at.
    const carried: Array<{ commit: { message: string } }> = [];
    for (let at = to; at !== from && github.commits.has(at);) {
      const commit = github.commits.get(at)!;
      carried.unshift({ commit: { message: commit.message } });
      at = commit.parents[0];
    }
    return {
      status: from === to ? "identical" : "ahead",
      total_commits: carried.length,
      commits: carried,
    };
  }
  const contents = match(/^\/repos\/qa\/app\/contents\/(.+)\?ref=(.+)$/);
  if (contents) {
    const file = decodeURIComponent(contents[1]);
    const at = decodeURIComponent(contents[2]);
    // A published commit is read back through the tree it recorded.
    const known = github.commits.get(at);
    const content = known
      ? (github.trees.get(known.tree) ?? []).find(
          (entry) => entry.path === file,
        )
      : undefined;
    if (content)
      return {
        type: "file",
        encoding: "base64",
        content: github.blobs.get(content.sha)!.toString("base64"),
        sha: content.sha,
      };
    const upstream = github.files.get(file);
    return upstream === undefined
      ? null
      : {
          type: "file",
          encoding: "base64",
          content: Buffer.from(upstream).toString("base64"),
          sha: sha(upstream),
        };
  }
  const listing = match(/^\/repos\/qa\/app\/git\/trees\/(.+)\?recursive=1$/);
  if (listing) {
    if (github.truncatedTree) return { truncated: true, tree: [] };
    const known = github.commits.get(decodeURIComponent(listing[1]));
    return {
      truncated: false,
      tree: known
        ? (github.trees.get(known.tree) ?? []).map((entry) => ({
            path: entry.path,
            mode: entry.mode,
            type: "blob",
          }))
        : [...github.files.keys()].map((path) => ({
            path,
            mode: github.executable.has(path) ? "100755" : "100644",
            type: "blob",
          })),
    };
  }
  if (match(/^\/repos\/qa\/app\/commits\/(.+)$/))
    return { sha: github.refs.get(github.defaultBranch) ?? BASE };
  if (path === `/repos/${repo}/git/blobs` && method === "POST") {
    const content = Buffer.from(String(body!.content), "base64");
    const id = sha(`blob:${content.toString("utf8")}`);
    github.blobs.set(id, content);
    return { sha: id };
  }
  if (path === `/repos/${repo}/git/trees` && method === "POST") {
    const parent = String(body!.base_tree);
    const inherited = github.commits.get(parent)
      ? (github.trees.get(github.commits.get(parent)!.tree) ?? [])
      : [];
    const entries = [
      ...inherited.filter(
        (entry) =>
          !(body!.tree as unknown as Array<{ path: string }>).some(
            (change) => change.path === entry.path,
          ),
      ),
      ...(body!.tree as unknown as Array<{
        path: string;
        mode: string;
        sha: string;
      }>),
    ];
    const id = sha(`tree:${JSON.stringify(entries)}`);
    github.trees.set(id, entries);
    return { sha: id };
  }
  if (path === `/repos/${repo}/git/commits` && method === "POST") {
    const id = sha(`commit:${JSON.stringify(body)}`);
    github.commits.set(id, {
      tree: String(body!.tree),
      parents: body!.parents as unknown as string[],
      message: String(body!.message),
    });
    return { sha: id };
  }
  if (path === `/repos/${repo}/git/refs` && method === "POST") {
    const name = String(body!.ref).replace("refs/heads/", "");
    github.refs.set(name, String(body!.sha));
    return { ref: body!.ref };
  }
  const update = match(/^\/repos\/qa\/app\/git\/refs\/heads\/(.+)$/);
  if (update && method === "PATCH") {
    github.refs.set(decodeURIComponent(update[1]), String(body!.sha));
    return { ref: update[1] };
  }
  if (path.startsWith(`/repos/${repo}/pulls?`)) {
    const head = decodeURIComponent(path.split("head=")[1]).split(":")[1];
    const into = decodeURIComponent(path.split("base=")[1].split("&")[0]);
    return github.pulls
      .filter((pull) => pull.head === head && pull.base === into)
      .map((pull) => ({
        number: pull.number,
        html_url: `https://github.com/${repo}/pull/${pull.number}`,
      }));
  }
  if (path === `/repos/${repo}/pulls` && method === "POST") {
    if (github.refusePulls)
      throw new api.GithubAccessError(github.refusePulls, "access");
    const number = github.pulls.length + 1;
    github.pulls.push({
      number,
      head: String(body!.head),
      base: String(body!.base),
      title: String(body!.title),
    });
    return { number, html_url: `https://github.com/${repo}/pull/${number}` };
  }
  throw new Error(`Unexpected GitHub request: ${method} ${path}`);
}

beforeEach(() => {
  root = createTemporaryRoot("/tmp/hallvi-proposal-");
  vi.stubEnv("HALLVI_DB_PATH", join(root, "hallvi.db"));
  vi.stubEnv("HALLVI_CONFIG_DIR", root);
  github = {
    defaultBranch: "main",
    permissions: {
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    },
    files: new Map([
      ["src/server.js", "const port = 3000;\n"],
      ["README.md", "# app\n"],
      ["config.yml", `token: ${secret}\n`],
      ["deploy/run.sh", "#!/bin/sh\nnode src/server.js\n"],
    ]),
    executable: new Set<string>(),
    refs: new Map([["main", BASE]]),
    blobs: new Map(),
    trees: new Map(),
    commits: new Map(),
    pulls: [],
    calls: [],
  };
  json.mockReset().mockImplementation(async (path, _token, options) => ({
    data: answer(path, options),
    scopes: [],
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  removeTemporaryRoot(root);
});

/** A real workspace over the repository above, with Pi's real file tools. */
function workspaceOver(chatId: string) {
  const workspace = new PiWorkspace({
    applicationId: "app",
    chatId,
    source: async () => ({
      description: `qa/app@${BASE}`,
      provenance: {
        repository: "qa/app",
        repositoryId: 4242,
        branch: "main",
        commitSha: BASE,
        omitted: [],
      },
      files: [...github.files].map(([path, content]) => ({
        path,
        mode: github.executable.has(path) ? 0o755 : 0o644,
        content: Buffer.from(content),
      })),
    }),
  });
  const byName = new Map(
    piWorkspaceTools(sdk, workspace).map((tool) => [tool.name, tool]),
  );
  const run = (name: string, args: object) =>
    byName.get(name)!.execute(`${name}-call`, args);
  return { workspace, run };
}

/** What the tool does: read the copy's own files, then publish them. */
async function propose(
  workspace: PiWorkspace,
  paths: string[],
  branch = "add-dockerfile",
) {
  const captured = await workspace.capture(paths);
  return proposeRepositoryChanges({
    provenance: captured.provenance!,
    files: captured.files,
    branch,
    title: "Add a Dockerfile so the application can be built",
    body: "The repository had no Dockerfile.",
  });
}

it("publishes exactly the named changes against the revision the copy came from, and never touches the branch the application deploys from", async () => {
  const { workspace, run } = workspaceOver("publish");
  await run("write", {
    path: "Dockerfile",
    content: 'FROM node:22-slim\nCMD ["node", "src/server.js"]\n',
  });
  await run("edit", {
    path: "src/server.js",
    edits: [{ oldText: "3000", newText: "process.env.PORT ?? 3000" }],
  });
  // Investigation leaves things behind that are nobody's business.
  await run("write", { path: "scratch-notes.txt", content: "tried a few\n" });
  await run("write", { path: "node_modules/left.js", content: "junk\n" });

  const outcome = await propose(workspace, [
    "Dockerfile",
    "src/server.js",
    "README.md",
    "node_modules/left.js",
  ]);

  expect(outcome).toMatchObject({
    status: "opened",
    repository: "qa/app",
    base: "main",
    sourceRevision: BASE,
    branch: "hallvi/add-dockerfile",
    pullRequestUrl: "https://github.com/qa/app/pull/1",
  });
  // Added and modified are distinguished; an untouched file is not a change.
  expect(outcome.changes).toEqual([
    { path: "Dockerfile", change: "added" },
    { path: "src/server.js", change: "modified" },
  ]);
  expect(outcome.skipped).toEqual([
    {
      path: "node_modules/left.js",
      reason:
        "It was left out because it is build output or installed dependencies rather than source.",
    },
  ]);

  // The commit sits on the revision Pi was given, not on whatever main holds.
  const commit = github.commits.get(outcome.commit!)!;
  expect(commit.parents).toEqual([BASE]);
  expect(commit.message).toContain(`qa/app@${BASE}`);
  expect(github.trees.get(commit.tree)!.map((entry) => entry.path)).toEqual([
    "Dockerfile",
    "src/server.js",
  ]);

  // The branch is its own; main still points where it did.
  expect(github.refs.get("hallvi/add-dockerfile")).toBe(outcome.commit);
  expect(github.refs.get("main")).toBe(BASE);
  expect(github.pulls).toEqual([
    {
      number: 1,
      head: "hallvi/add-dockerfile",
      base: "main",
      title: "Add a Dockerfile so the application can be built",
    },
  ]);
  await workspace.dispose();
}, 60_000);

it("refuses a file the copy holds only redacted, and one a command left a credential in", async () => {
  const { workspace, run } = workspaceOver("secrets");
  // The copy received config.yml with its credential replaced, so writing it
  // back would put [REDACTED] where the owner's token is.
  expect(await run("read", { path: "config.yml" })).toMatchObject({
    content: [{ text: expect.stringContaining("[REDACTED]") }],
  });
  await run("write", {
    path: "deploy/run.sh",
    content: `#!/bin/sh\nexport GH_TOKEN=${secret}\n`,
  });

  const outcome = await propose(workspace, ["config.yml", "deploy/run.sh"]);
  expect(outcome.status).toBe("no-changes");
  expect(outcome.skipped.map((each) => each.path)).toEqual([
    "config.yml",
    "deploy/run.sh",
  ]);
  expect(outcome.skipped[0].reason).toContain("[REDACTED]");
  expect(outcome.skipped[1].reason).toContain("credential-shaped text");
  // Nothing was published, and the secret reached no request.
  expect(github.refs.size).toBe(1);
  expect(github.blobs.size).toBe(0);
  expect(JSON.stringify(json.mock.calls)).not.toContain(secret);
  await workspace.dispose();
}, 60_000);

it("an installation without write permission says which permission is missing and writes nothing", async () => {
  github.permissions = { contents: "read", metadata: "read" };
  const { workspace, run } = workspaceOver("read-only");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });
  await expect(propose(workspace, ["Dockerfile"])).rejects.toThrow(
    /Contents: read and write or Pull requests: read and write/,
  );
  expect(github.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  await workspace.dispose();
}, 60_000);

it("a pull request that fails after the branch exists reports the branch, and the retry reuses it", async () => {
  github.refusePulls = "GitHub is unavailable. Try again later.";
  const { workspace, run } = workspaceOver("partial");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });

  const first = await propose(workspace, ["Dockerfile"]);
  expect(first).toMatchObject({
    status: "branch-only",
    branch: "hallvi/add-dockerfile",
  });
  expect(first.problem).toContain("hallvi/add-dockerfile");
  expect(first.problem).toContain("will not be made twice");
  expect(github.refs.get("hallvi/add-dockerfile")).toBe(first.commit);
  expect(github.pulls).toEqual([]);

  // Asked again with the same branch: the commit is already there, so there
  // is nothing new to publish, and one pull request is opened, not two.
  github.refusePulls = undefined;
  const retry = await propose(workspace, ["Dockerfile"]);
  expect(retry).toMatchObject({
    status: "opened",
    branch: "hallvi/add-dockerfile",
    commit: first.commit,
    pullRequestNumber: 1,
  });
  expect(retry.changes).toEqual([]);
  expect(github.pulls).toHaveLength(1);

  // And once more, with the pull request already open.
  const again = await propose(workspace, ["Dockerfile"]);
  expect(again).toMatchObject({ status: "reused", pullRequestNumber: 1 });
  expect(github.pulls).toHaveLength(1);
  await workspace.dispose();
}, 60_000);

it("a change named after the deploy branch still lands on a branch of its own", async () => {
  const { workspace, run } = workspaceOver("onto-main");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });
  const outcome = await propose(workspace, ["Dockerfile"], "main");
  expect(outcome.branch).toBe("hallvi/main");
  expect(github.refs.get("main")).toBe(BASE);
  expect(github.pulls[0]).toMatchObject({ head: "hallvi/main", base: "main" });
  await workspace.dispose();
}, 60_000);

it("will not publish against a branch other than the one the copy came from", async () => {
  const { workspace, run } = workspaceOver("moved-default");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });
  // The default branch was renamed while Pi was working.
  github.defaultBranch = "trunk";
  await expect(propose(workspace, ["Dockerfile"])).rejects.toThrow(
    /copy was taken from main[\s\S]*default branch is now trunk/,
  );
  expect(github.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  await workspace.dispose();
}, 60_000);

it("reads a path by one spelling, so a redacted file cannot be published under another", async () => {
  const { workspace, run } = workspaceOver("spellings");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });

  // `./config.yml` is `config.yml`: the copy holds it redacted, and the
  // refusal must not depend on how the path was typed.
  const outcome = await propose(workspace, ["./config.yml", "src//server.js"]);
  expect(outcome.status).toBe("no-changes");
  expect(outcome.skipped).toEqual([
    { path: "config.yml", reason: expect.stringContaining("[REDACTED]") },
  ]);
  expect(github.blobs.size).toBe(0);
  expect(github.refs.size).toBe(1);

  await expect(workspace.capture(["../outside.txt"])).rejects.toThrow(
    /relative path to a file inside the workspace/,
  );
  await expect(workspace.capture([".git/config"])).rejects.toThrow(
    /Git metadata/,
  );
  await workspace.dispose();
}, 60_000);

it("leaves a branch carrying somebody else's commits alone", async () => {
  const { workspace, run } = workspaceOver("occupied");
  await run("write", { path: "Dockerfile", content: "FROM node:22-slim\n" });
  // A person wrote their own work under the name Pi happens to choose.
  const theirs = sha("commit:theirs");
  github.commits.set(theirs, {
    tree: sha("tree:theirs"),
    parents: [BASE],
    message: "Try a Dockerfile of my own",
  });
  github.trees.set(sha("tree:theirs"), []);
  github.refs.set("hallvi/add-dockerfile", theirs);

  await expect(propose(workspace, ["Dockerfile"])).rejects.toThrow(
    /carries commits Hallvi did not publish/,
  );
  expect(github.refs.get("hallvi/add-dockerfile")).toBe(theirs);
  expect(github.calls.filter((call) => call.startsWith("POST"))).toEqual([]);
  await workspace.dispose();
}, 60_000);

it("making an entrypoint executable is a change, not nothing", async () => {
  const { workspace, run } = workspaceOver("executable");
  expect(
    await run("bash", { command: "chmod +x deploy/run.sh" }),
  ).not.toMatchObject({ isError: true });

  const outcome = await propose(workspace, ["deploy/run.sh"]);
  expect(outcome).toMatchObject({ status: "opened" });
  expect(outcome.changes).toEqual([
    { path: "deploy/run.sh", change: "modified" },
  ]);
  expect(github.trees.get(github.commits.get(outcome.commit!)!.tree)).toEqual([
    {
      path: "deploy/run.sh",
      mode: "100755",
      sha: expect.any(String),
      type: "blob",
    },
  ]);

  // And the bit the repository already has is not a change on its own.
  github.executable.add("deploy/run.sh");
  const { workspace: second } = workspaceOver("executable-already");
  const again = await propose(second, ["deploy/run.sh"], "keep-the-bit");
  expect(again.status).toBe("no-changes");
  await second.dispose();

  // A repository GitHub will not list in one response cannot answer the
  // question, and saying "nothing changed" would be a claim, not a fact.
  github.truncatedTree = true;
  const { workspace: third, run: runThird } = workspaceOver("executable-blind");
  await runThird("bash", { command: "chmod +x deploy/run.sh" });
  const blind = await propose(third, ["deploy/run.sh"], "cannot-tell");
  expect(blind.status).toBe("no-changes");
  expect(blind.skipped[0].reason).toContain("executable bit");
  await third.dispose();
  await workspace.dispose();
}, 60_000);
