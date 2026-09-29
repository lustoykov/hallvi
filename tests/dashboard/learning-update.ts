import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  buildLearningCatalog,
  digest,
  learningSources,
  type Catalog,
  type Question,
} from "./learning-catalog.ts";

type Published = {
  catalog: Catalog;
  revision: string;
  builtAt: string;
  summary: string;
};
type Checked = { revision: string; at: string };
type Manifest = { revision: string; baseVersion: string; storePath: string };

const git = (root: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16_000_000,
    timeout: 60_000,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  }).trimEnd();

export function learningPath(root: string) {
  return process.env.HALLVI_LEARNING_DB_PATH
    ? resolve(root, process.env.HALLVI_LEARNING_DB_PATH)
    : join(
        resolve(root, git(root, "rev-parse", "--git-common-dir")),
        "hallvi-learning.sqlite",
      );
}
function database(root: string) {
  const path = learningPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("busy_timeout = 5000");
  db.exec(
    "CREATE TABLE IF NOT EXISTS learning_content (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  return db;
}
function read<T>(db: Database.Database, name: string): T | undefined {
  const row = db
    .prepare("SELECT value FROM learning_content WHERE name = ?")
    .get(name) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}
const write = (db: Database.Database, name: string, value: unknown) =>
  db
    .prepare(
      "INSERT INTO learning_content VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value",
    )
    .run(name, JSON.stringify(value));

// Reading the dashboard never creates a store, fetches main or starts a review.
export function readLearningContent(root: string): {
  published?: Published;
  checked?: Checked;
} {
  const path = learningPath(root);
  if (!existsSync(path)) return {};
  const db = new Database(path, { readonly: true });
  try {
    if (
      !db
        .prepare("SELECT 1 FROM sqlite_master WHERE name = 'learning_content'")
        .get()
    )
      return {};
    return db.transaction(() => ({
      published: read<Published>(db, "published"),
      checked: read<Checked>(db, "checked"),
    }))();
  } finally {
    db.close();
  }
}

const text = z.string().min(1).max(5000);
const patchSchema = z.strictObject({
  summary: text,
  upsert: z
    .array(
      z.strictObject({
        id: z
          .string()
          .regex(/^[a-zA-Z0-9:_-]+$/)
          .max(160),
        topic: text,
        title: text,
        prompt: text,
        description: text,
        explanation: text,
        answer: text,
        options: z.array(z.string().min(1).max(500)).min(2).max(4),
        source: z.strictObject({
          path: text,
          line: z.number().int().positive(),
        }),
      }),
    )
    .max(150),
  retire: z.array(z.string()).max(300),
  graph: z.strictObject({
    nodes: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
          label: z.string().min(1).max(100),
        }),
      )
      .min(2)
      .max(20),
    edges: z
      .array(
        z.strictObject({ from: text, to: text, label: z.string().max(100) }),
      )
      .min(1)
      .max(40),
  }),
});

// Export only regular tracked text files, never working edits, runtime state,
// symlinks, dotfiles, credentials or contributor instructions.
const snapshotPath = (path: string) =>
  !path.split("/").some((part) => part.startsWith(".")) &&
  !/(^|\/)(AGENTS|CLAUDE|SKILL)\.md$/.test(path) &&
  !/(^|\/)(package-lock|auth|credentials|secrets)\.json$/i.test(path) &&
  /\.(md|[cm]?js|tsx?|json|sql|ya?ml|toml|sh)$/.test(path);
function sourceFiles(root: string, revision: string) {
  return git(root, "ls-tree", "-r", "-z", revision)
    .split("\0")
    .flatMap((entry) => {
      const match = /^100(?:644|755) blob [a-f0-9]+\t([\s\S]+)$/.exec(entry);
      return match && snapshotPath(match[1]) ? [match[1]] : [];
    });
}
function baseline(
  root: string,
  revision: string,
  previous?: Published,
): Catalog {
  if (previous) return previous.catalog;
  let seed: Catalog;
  try {
    seed = buildLearningCatalog(
      Object.fromEntries(
        learningSources.map((path) => [
          path,
          git(root, "show", `${revision}:${path}`),
        ]),
      ),
    );
  } catch {
    seed = { questions: [], graph: { nodes: [], edges: [] } };
  }
  return {
    ...seed,
    questions: seed.questions.map((q) => ({
      ...q,
      source: { ...q.source, revision },
    })),
  };
}

export function prepareLearningUpdate(root: string, force = false) {
  try {
    git(
      root,
      "fetch",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    );
  } catch {
    throw new Error(
      "Could not fetch origin/main. The saved catalog is unchanged. Check the remote and network, then retry.",
    );
  }
  const revision = git(
    root,
    "rev-parse",
    "--verify",
    "refs/remotes/origin/main^{commit}",
  );
  const db = database(root);
  let previous: Published | undefined;
  try {
    previous = db
      .transaction(() => {
        write(db, "checked", { revision, at: new Date().toISOString() });
        return read<Published>(db, "published");
      })
      .immediate();
  } finally {
    db.close();
  }
  if (!force && previous?.revision === revision)
    return { status: "unchanged" as const, revision };
  const scratch = join(root, "work");
  mkdirSync(scratch, { recursive: true });
  const directory = mkdtempSync(join(scratch, "learning-update-"));
  try {
    const files = sourceFiles(root, revision);
    if (!files.length)
      throw new Error("Main contains no readable architecture sources.");
    const snapshot = join(directory, "source");
    mkdirSync(snapshot);
    const archive = join(directory, "source.tar");
    git(
      root,
      "archive",
      "--format=tar",
      "-o",
      archive,
      revision,
      "--",
      ...files,
    );
    execFileSync("tar", ["-xf", archive, "-C", snapshot], {
      timeout: 60_000,
      stdio: "pipe",
    });
    rmSync(archive);
    const manifest: Manifest = {
      revision,
      baseVersion: digest(previous ?? null),
      storePath: learningPath(root),
    };
    writeFileSync(
      join(directory, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    writeFileSync(
      join(directory, "previous.json"),
      JSON.stringify(baseline(root, revision, previous), null, 2),
    );
    writeFileSync(
      join(directory, "schema.json"),
      JSON.stringify(z.toJSONSchema(patchSchema), null, 2),
    );
    return {
      status: "review" as const,
      revision,
      directory,
      snapshot,
      previous: join(directory, "previous.json"),
      schema: join(directory, "schema.json"),
      patch: join(directory, "patch.json"),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function publishLearningUpdate(root: string, directory: string) {
  const manifest = z
    .strictObject({
      revision: z.string().regex(/^[a-f0-9]{40,64}$/),
      baseVersion: z.string(),
      storePath: z.string(),
    })
    .parse(JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8")));
  if (manifest.storePath !== learningPath(root))
    throw new Error(
      "This review belongs to a different learning store. Use the same repository and HALLVI_LEARNING_DB_PATH as prepare.",
    );
  const raw = readFileSync(join(directory, "patch.json"), "utf8");
  if (raw.length > 2_000_000) throw new Error("Catalog patch is too large.");
  const patch = patchSchema.parse(JSON.parse(raw));
  const current = readLearningContent(root).published;
  if (digest(current ?? null) !== manifest.baseVersion)
    throw new Error(
      "The catalog changed during this review. Prepare a fresh update before publishing.",
    );
  const previous = baseline(root, manifest.revision, current);
  const questions = new Map(previous.questions.map((q) => [q.id, q]));
  const ids = patch.upsert.map((q) => q.id);
  if (
    new Set(ids).size !== ids.length ||
    new Set(patch.retire).size !== patch.retire.length ||
    patch.retire.some((id) => !questions.has(id) || ids.includes(id))
  )
    throw new Error("Duplicate or unknown question IDs in update.");
  const files = new Set(sourceFiles(root, manifest.revision));
  for (const id of patch.retire) questions.delete(id);
  for (const q of patch.upsert) {
    if (
      !files.has(q.source.path) ||
      q.source.line >
        git(root, "show", `${manifest.revision}:${q.source.path}`).split("\n")
          .length
    )
      throw new Error("A question cites an unknown source or line.");
    if (
      !q.options.includes(q.answer) ||
      new Set(q.options).size !== q.options.length
    )
      throw new Error("A question has invalid answer choices.");
    const next: Question = {
      ...q,
      source: { ...q.source, revision: manifest.revision },
      version: digest([q.prompt, q.answer, q.description, q.explanation]),
    };
    questions.set(q.id, next);
  }
  const nodes = new Set(patch.graph.nodes.map((node) => node.id));
  if (
    nodes.size !== patch.graph.nodes.length ||
    patch.graph.edges.some(
      (edge) => !nodes.has(edge.from) || !nodes.has(edge.to),
    )
  )
    throw new Error("The architecture map has invalid connections.");
  if (questions.size < 1 || questions.size > 300)
    throw new Error("The update has an invalid number of questions.");
  const published: Published = {
    catalog: { questions: [...questions.values()], graph: patch.graph },
    revision: manifest.revision,
    builtAt: new Date().toISOString(),
    summary: patch.summary,
  };
  const db = database(root);
  try {
    db.transaction(() => {
      // Manual and scheduled reviews may overlap. Only a patch based on the
      // still-current catalog can publish; progress is never rewritten.
      if (
        digest(read<Published>(db, "published") ?? null) !==
        manifest.baseVersion
      )
        throw new Error(
          "The catalog changed during this review. Prepare a fresh update before publishing.",
        );
      write(db, "published", published);
    }).immediate();
  } finally {
    db.close();
  }
  return {
    status: "published" as const,
    revision: published.revision,
    questions: questions.size,
    builtAt: published.builtAt,
    summary: published.summary,
  };
}
