import { execFileSync } from "node:child_process";
import {
  existsSync,
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
import {
  learningPath,
  prepareLearningUpdate,
  publishLearningUpdate,
} from "../../dashboard/learning-update.ts";

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

// This exercises several real Git snapshots and publications, not a latency budget.
it("publishes scheduled reviews of merged main while preserving unchanged progress and obsolete history", () => {
  const root = fixture();
  const initialRevision = commit(root);
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", root], { cwd: root });
  const learning = createLearning(root);
  const initial = learning.state();
  // Opening the dashboard only reads; it never creates a review or a database.
  expect(existsSync(learningPath(root))).toBe(false);
  for (const id of [
    "concept:session-owner",
    "table:conversations",
    "tool:save_information",
  ]) {
    const q = initial.questions.find((q) => q.id === id)!;
    learning.act({
      action: "answer",
      id,
      version: q.version,
      selected: q.answer,
    });
  }
  writeFileSync(join(root, ".env"), "PRIVATE_FIXTURE=not-a-real-secret");
  const originalContext = readFileSync(join(root, "CONTEXT.md"), "utf8");
  writeFileSync(join(root, "CONTEXT.md"), originalContext + "\nLOCAL_ONLY\n");
  const prepared = prepareLearningUpdate(root);
  if (prepared.status !== "review") throw new Error("Expected review");
  expect(
    readFileSync(join(prepared.snapshot, "CONTEXT.md"), "utf8"),
  ).not.toContain("LOCAL_ONLY");
  expect(existsSync(join(prepared.snapshot, ".env"))).toBe(false);
  const patch = {
    summary: "Reviewed code.",
    graph: initial.graph,
    upsert: [],
    retire: [],
  };
  writeFileSync(prepared.patch, JSON.stringify(patch));
  expect(publishLearningUpdate(root, prepared.directory).revision).toBe(
    initialRevision,
  );
  expect(
    learning.state().questions.filter((q) => q.status === "learned"),
  ).toHaveLength(3);
  expect(prepareLearningUpdate(root).status).toBe("unchanged");
  expect(learning.state().review.lastCheckedAt).toBeTruthy();
  expect(prepareLearningUpdate(root, true).status).toBe("review");

  writeFileSync(
    join(root, "CONTEXT.md"),
    originalContext.replace("worker.sock", "new-owner.sock"),
  );
  const changedRevision = commit(root);
  const newer = prepareLearningUpdate(root);
  if (newer.status !== "review") throw new Error("Expected review");
  const changedQuestion = buildLearningCatalog(
    Object.fromEntries(
      learningSources.map((file) => [
        file,
        readFileSync(join(newer.snapshot, file), "utf8"),
      ]),
    ),
  ).questions.find((q) => q.id === "concept:session-owner")!;
  const draft = Object.fromEntries(
    Object.entries(changedQuestion).filter(([key]) => key !== "version"),
  );
  writeFileSync(
    newer.patch,
    JSON.stringify({
      ...patch,
      upsert: [draft],
      retire: ["tool:save_information"],
    }),
  );
  publishLearningUpdate(root, newer.directory);
  const changed = learning.state();
  expect(changed.review.revision).toBe(changedRevision);
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
  expect(learning.source("CONTEXT.md", changedRevision)).toContain(
    "new-owner.sock",
  );
  expect(() => learning.source(".env", changedRevision)).toThrow(/Unknown/);
  // Previously learned sources remain accessible at their original commit.
  expect(learning.source("CONTEXT.md", initialRevision)).toContain(
    "worker.sock",
  );
  const catalogVersion = changed.sourceVersion;
  const invalid = prepareLearningUpdate(root, true);
  if (invalid.status !== "review") throw new Error("Expected review");
  for (const output of [
    { summary: "missing catalog" },
    { ...patch, upsert: [{ ...draft, source: { path: ".env", line: 1 } }] },
    {
      ...patch,
      upsert: [{ ...draft, source: { path: "CONTEXT.md", line: 999999 } }],
    },
    { ...patch, upsert: [{ ...draft, options: ["wrong", "also wrong"] }] },
    {
      ...patch,
      graph: {
        ...patch.graph,
        edges: [{ from: "missing", to: "missing", label: "invalid" }],
      },
    },
  ]) {
    writeFileSync(invalid.patch, JSON.stringify(output));
    expect(() => publishLearningUpdate(root, invalid.directory)).toThrow();
    expect(createLearning(root).state().sourceVersion).toBe(catalogVersion);
    expect(createLearning(root).state().history).toEqual(changed.history);
  }
}, 15_000);

it("rejects overlapping stale reviews and publishing into a different progress store", () => {
  const root = fixture();
  commit(root);
  execFileSync("git", ["branch", "-M", "main"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", root], { cwd: root });
  const first = prepareLearningUpdate(root);
  const second = prepareLearningUpdate(root);
  if (first.status !== "review" || second.status !== "review")
    throw new Error("Expected reviews");
  const learning = createLearning(root);
  const state = learning.state();
  const patch = {
    summary: "Reviewed code.",
    graph: state.graph,
    upsert: [],
    retire: [],
  };
  for (const prepared of [first, second])
    writeFileSync(prepared.patch, JSON.stringify(patch));
  // An answer saved while the scheduled review is working survives publication.
  const q = state.questions[0];
  learning.act({
    action: "answer",
    id: q.id,
    version: q.version,
    selected: q.answer,
  });
  vi.stubEnv("HALLVI_LEARNING_DB_PATH", "work/wrong-store.sqlite");
  expect(() => publishLearningUpdate(root, first.directory)).toThrow(
    /different learning store/,
  );
  expect(existsSync(learningPath(root))).toBe(false);
  vi.stubEnv("HALLVI_LEARNING_DB_PATH", "");
  publishLearningUpdate(root, second.directory);
  expect(() => publishLearningUpdate(root, first.directory)).toThrow(
    /catalog changed/,
  );
  expect(learning.state().questions[0].status).toBe("learned");
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
    expect(
      (
        await fetch(origin + "/api/learning/rebuild", {
          method: "POST",
          headers,
          body: JSON.stringify({ force: true }),
        })
      ).status,
    ).toBe(404);
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
