import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  buildLearningCatalog,
  createLearning,
  learningSources,
} from "../../dashboard/learning.ts";
import { createDashboard } from "../../dashboard/server";
import type { RebuildInput } from "../../dashboard/learning-rebuild.ts";

const temporary: string[] = [];
const sources = () =>
  Object.fromEntries(
    learningSources.map((path) => [path, readFileSync(path, "utf8")]),
  );
function fixture() {
  vi.stubEnv("HALLVI_LEARNING_DB_PATH", "");
  const root = mkdtempSync(join(tmpdir(), "hallvi-learning-"));
  temporary.push(root);
  execFileSync("git", ["init", "-q", root]);
  for (const [path, content] of Object.entries(sources())) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}
afterEach(() => {
  for (const root of temporary.splice(0)) rmSync(root, { recursive: true });
  vi.unstubAllEnvs();
});

function commit(root: string) {
  execFileSync("git", ["add", ...learningSources], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
}

it("rebuilds merged main daily, preserves mastery, retires old facts, and publishes only valid output", async () => {
  const root = fixture();
  const initialRevision = commit(root);
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", root], { cwd: root });
  let now = Date.now();
  let mode = "unchanged";
  const run = vi.fn(async ({ previous, snapshot }: RebuildInput) => {
    // Agent gets immutable tracked code, never a dirty checkout or app state.
    expect(readFileSync(join(snapshot, "CONTEXT.md"), "utf8")).not.toContain(
      "LOCAL_ONLY",
    );
    expect(() => readFileSync(join(snapshot, ".env"))).toThrow();
    if (mode === "invalid") return { summary: "missing catalog" };
    const newer = buildLearningCatalog(
      Object.fromEntries(
        learningSources.map((file) => [
          file,
          readFileSync(join(snapshot, file), "utf8"),
        ]),
      ),
    );
    const changed = newer.questions.find(
      (q) => q.id === "concept:session-owner",
    )!;
    const draft = Object.fromEntries(
      Object.entries(changed).filter(([key]) => key !== "version"),
    );
    return {
      summary: "Reviewed code.",
      graph: previous.graph,
      upsert: mode === "changed" ? [draft] : [],
      retire: mode === "changed" ? ["tool:save_information"] : [],
    };
  });
  const first = createLearning(root, { now: () => now, run });
  const initial = first.state();
  for (const id of [
    "concept:session-owner",
    "table:conversations",
    "tool:save_information",
  ]) {
    const q = initial.questions.find((q) => q.id === id)!;
    first.act({ action: "answer", id, version: q.version, selected: q.answer });
  }
  writeFileSync(join(root, ".env"), "PRIVATE_FIXTURE=not-a-real-secret");
  const originalContext = readFileSync(join(root, "CONTEXT.md"), "utf8");
  writeFileSync(join(root, "CONTEXT.md"), originalContext + "\nLOCAL_ONLY\n");
  first.rebuild(false);
  await first.settled();
  expect(first.state().refresh.revision).toBe(initialRevision);
  expect(
    first.state().questions.filter((q) => q.status === "learned"),
  ).toHaveLength(3);
  first.rebuild(false);
  await first.settled();
  expect(run).toHaveBeenCalledTimes(1);
  now += 24 * 60 * 60 * 1000 + 1;
  first.rebuild(false);
  await first.settled();
  // Unchanged main never spends a model call.
  expect(run).toHaveBeenCalledTimes(1);
  expect(first.state().refresh.message).toMatch(/not changed/);
  first.rebuild(true);
  await first.settled();
  // Manual rebuild is always a fresh review.
  expect(run).toHaveBeenCalledTimes(2);
  writeFileSync(
    join(root, "CONTEXT.md"),
    originalContext.replace("worker.sock", "new-owner.sock"),
  );
  const changedRevision = commit(root);
  mode = "changed";
  first.rebuild(true);
  await first.settled();
  const changed = first.state();
  expect(changed.refresh.revision).toBe(changedRevision);
  expect(
    changed.questions.find((q) => q.id === "concept:session-owner")?.status,
  ).toBe("changed");
  expect(
    changed.questions.find((q) => q.id === "table:conversations")?.status,
  ).toBe("learned");
  expect(
    changed.history.find((row) => row.question.id === "tool:save_information")
      ?.reason,
  ).toBe("removed");
  expect(first.source("CONTEXT.md", changedRevision)).toContain(
    "new-owner.sock",
  );
  expect(() => first.source(".env", changedRevision)).toThrow(/Unknown/);
  expect(() => first.source("package.json", changedRevision)).toThrow(
    /Unknown/,
  );
  const catalogVersion = changed.sourceVersion;
  mode = "invalid";
  first.rebuild(true);
  await first.settled();
  expect(first.state().refresh.status).toBe("failed");
  expect(first.state().sourceVersion).toBe(catalogVersion);
  // Restart sees the last good catalog and an error, not half a replacement.
  expect(createLearning(root).state().sourceVersion).toBe(catalogVersion);
  first.rebuild(false);
  await first.settled();
  // A failed check does not retry every poll.
  expect(run).toHaveBeenCalledTimes(4);
});

it("shares a rebuild lock across servers and stops a job without publishing partial output", async () => {
  const root = fixture();
  commit(root);
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", root], { cwd: root });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const run = vi.fn(async ({ signal }: RebuildInput) => {
    entered();
    await new Promise<void>((resolve) =>
      signal.addEventListener("abort", () => resolve(), { once: true }),
    );
    return {};
  });
  const first = createLearning(root, { run });
  const other = createLearning(root, { run });
  first.rebuild(true);
  await started;
  expect(other.rebuild(true).status).toBe("running");
  expect(run).toHaveBeenCalledTimes(1);
  first.stop();
  await first.settled();
  expect(other.state().refresh.status).toBe("failed");
  expect(other.state().refresh.revision).toBeNull();
  expect(other.state().refresh.message).toMatch(/stopped/);
});

it("derives current contracts without execution and versions only changed knowledge", () => {
  const input = sources();
  const first = buildLearningCatalog(input);
  const owner = first.questions.find((q) => q.id === "concept:session-owner")!;
  expect(owner.description).toContain("worker.sock");
  expect(
    first.graph.edges.find((edge) => edge.label === "save_information"),
  ).toBeDefined();
  expect(
    first.questions.find((q) => q.id === "table:conversations")?.description,
  ).toContain("nativeSessionId");
  expect(
    first.questions.find((q) => q.id === "tool:save_information")?.answer,
  ).toBe("save_information");
  // Source is parsed, not evaluated; new tool contracts need no second catalog.
  input["src/server/pi.ts"] += `
    throw new Error("The learning page must never run the operator");
    defineTool({
      name: "new_read", label: "Read a new thing",
      description: "Read current metadata.", parameters: {},
    });
  `;
  input["CONTEXT.md"] =
    "\n\n" +
    input["CONTEXT.md"].replace(
      "The worker, as the only process",
      "The worker,\n as the only process",
    );
  const reformatted = buildLearningCatalog(input);
  expect(reformatted.questions.find((q) => q.id === owner.id)?.version).toBe(
    owner.version,
  );
  expect(
    reformatted.questions.find((q) => q.id === "tool:new_read"),
  ).toBeDefined();
  input["CONTEXT.md"] = input["CONTEXT.md"].replace(
    "worker.sock",
    "operator.sock",
  );
  const changed = buildLearningCatalog(input);
  expect(changed.questions.find((q) => q.id === owner.id)?.version).not.toBe(
    owner.version,
  );
  expect(
    changed.questions.find((q) => q.id === "table:conversations")?.version,
  ).toBe(first.questions.find((q) => q.id === "table:conversations")?.version);
  expect(() =>
    buildLearningCatalog({ ...input, "docs/architecture.md": "" }),
  ).toThrow();
});

it("keeps progress across restarts and worktrees, with obsolete versions as history", () => {
  const root = fixture();
  const first = createLearning(root);
  const questions = first.state().questions;
  const owner = questions.find((q) => q.id === "concept:session-owner")!;
  const table = questions.find((q) => q.id === "table:conversations")!;
  first.act({
    action: "answer",
    id: owner.id,
    version: owner.version,
    selected: owner.options.find((option) => option !== owner.answer),
  });
  expect(first.state().questions.find((q) => q.id === owner.id)?.status).toBe(
    "retry",
  );
  first.act({
    action: "answer",
    id: owner.id,
    version: owner.version,
    selected: owner.answer,
  });
  first.act({ action: "archive", id: table.id, version: table.version });
  // A second server and Git worktree must share only learning progress.
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-qm",
      "fixture",
    ],
    { cwd: root },
  );
  const otherRoot = join(root, "sibling");
  execFileSync("git", ["worktree", "add", "--detach", otherRoot], {
    cwd: root,
    stdio: "ignore",
  });
  const other = createLearning(otherRoot);
  expect(other.state().questions.find((q) => q.id === owner.id)?.status).toBe(
    "learned",
  );
  expect(other.state().questions.find((q) => q.id === table.id)?.status).toBe(
    "archived",
  );
  other.act({ action: "restore", id: table.id, version: table.version });
  other.act({
    action: "answer",
    id: table.id,
    version: table.version,
    selected: table.answer,
  });
  expect(
    createLearning(root)
      .state()
      .questions.filter((q) => q.status === "learned"),
  ).toHaveLength(2);
  const contextPath = join(root, "CONTEXT.md");
  const original = readFileSync(contextPath, "utf8");
  writeFileSync(contextPath, original.replace("worker.sock", "new-owner.sock"));
  const updated = first.state();
  expect(updated.questions.find((q) => q.id === owner.id)?.status).toBe(
    "changed",
  );
  expect(updated.questions.find((q) => q.id === table.id)?.status).toBe(
    "learned",
  );
  expect(
    updated.history.find((row) => row.question.id === owner.id)?.reason,
  ).toBe("changed");
  // Another branch retaining the old architecture still regards it as learned.
  expect(other.state().questions.find((q) => q.id === owner.id)?.status).toBe(
    "learned",
  );
  expect(() =>
    first.act({
      action: "answer",
      id: owner.id,
      version: owner.version,
      selected: owner.answer,
    }),
  ).toThrow(/changed or was removed/);
  writeFileSync(
    contextPath,
    original.replace(/^\*\*Session owner\*\*.*\n/m, ""),
  );
  const removed = first.state();
  expect(
    removed.history.find((row) => row.question.id === owner.id)?.reason,
  ).toBe("removed");
  expect(removed.questions.some((q) => q.id === owner.id)).toBe(false);
});

it("serves a protected, live quiz and grades answers against the current source", async () => {
  const root = fixture();
  const dashboard = createDashboard(root);
  dashboard.server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) =>
    dashboard.server.once("listening", resolve),
  );
  const address = dashboard.server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  const origin = `http://127.0.0.1:${address.port}`;
  const headers = {
    "X-Hallvi-Testing-Token": dashboard.token,
    "Content-Type": "application/json",
    Origin: origin,
  };
  try {
    expect((await fetch(origin + "/api/learning")).status).toBe(403);
    expect(
      (
        await fetch(origin + "/api/learning/rebuild", {
          method: "POST",
          body: JSON.stringify({ force: true }),
        })
      ).status,
    ).toBe(403);
    const page = await (await fetch(origin + "/learn")).text();
    expect(page).toContain("Learn Hallvi");
    const state = await (
      await fetch(origin + "/api/learning", { headers })
    ).json();
    const question = state.questions[0];
    const answer = {
      action: "answer",
      id: question.id,
      version: question.version,
      selected: question.answer,
    };
    const response = await fetch(origin + "/api/learning", {
      method: "POST",
      headers,
      body: JSON.stringify(answer),
    });
    expect((await response.json()).correct).toBe(true);
    const saved = await (
      await fetch(origin + "/api/learning", { headers })
    ).json();
    expect(saved.questions[0].status).toBe("learned");
    const changedPath = join(root, "CONTEXT.md");
    writeFileSync(
      changedPath,
      readFileSync(changedPath, "utf8").replace(
        "persistent owner",
        "single persistent owner",
      ),
    );
    const stale = await fetch(origin + "/api/learning", {
      method: "POST",
      headers,
      body: JSON.stringify(answer),
    });
    expect(stale.status).toBe(409);
    expect((await fetch(origin + "/learn/source?file=.env")).status).toBe(404);
    writeFileSync(changedPath, "**Application**: <script>alert(1)</script>\n");
    const source = await (
      await fetch(origin + "/learn/source?file=CONTEXT.md")
    ).text();
    expect(source).toContain("&lt;script&gt;");
    expect(source).not.toContain("<script>alert");
  } finally {
    dashboard.stop();
  }
});
