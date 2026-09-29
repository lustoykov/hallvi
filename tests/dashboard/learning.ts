import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { z } from "zod";
import {
  buildLearningCatalog,
  digest,
  learningSources,
  type Question,
} from "./learning-catalog.ts";
import { learningPath, readLearningContent } from "./learning-update.ts";
export { buildLearningCatalog, learningSources } from "./learning-catalog.ts";
export type { Question } from "./learning-catalog.ts";
type Saved = {
  id: string;
  version: string;
  question: string;
  selected: string | null;
  attempts: number;
  completedAt: string | null;
  archived: number;
  updatedAt: string;
};
export class LearningError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
const actionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("answer"),
    id: z.string(),
    version: z.string(),
    selected: z.string().max(500),
  }),
  z.strictObject({
    action: z.enum(["archive", "restore"]),
    id: z.string(),
    version: z.string(),
  }),
]);
const key = (q: { id: string; version: string }) => `${q.id}@${q.version}`;

export function createLearning(root: string) {
  let cached: ReturnType<typeof buildLearningCatalog> | undefined;
  let sourceVersion = "";
  const path = () => learningPath(root);
  function catalog(published = readLearningContent(root).published) {
    if (published) {
      sourceVersion = digest(published.catalog);
      return published.catalog;
    }
    const sources = Object.fromEntries(
      learningSources.map((path) => [
        path,
        existsSync(join(root, path))
          ? readFileSync(join(root, path), "utf8")
          : "",
      ]),
    );
    const version = digest(sources);
    if (version !== sourceVersion || !cached) {
      try {
        cached = buildLearningCatalog(sources);
      } catch {
        cached = { questions: [], graph: { nodes: [], edges: [] } };
      }
      sourceVersion = version;
    }
    return cached;
  }
  function read(): Saved[] {
    if (!existsSync(path())) return [];
    const db = new Database(path(), { readonly: true });
    try {
      if (
        !db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'progress'").get()
      )
        return [];
      return db
        .prepare("SELECT * FROM progress ORDER BY updatedAt DESC")
        .all() as Saved[];
    } finally {
      db.close();
    }
  }
  function state() {
    const { published, checked } = readLearningContent(root);
    const current = catalog(published);
    const saved = read();
    const byKey = new Map(saved.map((row) => [key(row), row]));
    const questions = current.questions.map((q) => {
      const row = byKey.get(key(q));
      const changed = saved.some(
        (old) => old.id === q.id && old.version !== q.version,
      );
      return {
        ...q,
        status: row?.archived
          ? "archived"
          : row?.completedAt
            ? "learned"
            : changed
              ? "changed"
              : row?.attempts
                ? "retry"
                : "new",
        attempts: row?.attempts ?? 0,
        completedAt: row?.completedAt ?? null,
      };
    });
    const currentKeys = new Set(current.questions.map(key));
    const currentIds = new Set(current.questions.map((q) => q.id));
    const history = saved.map((row) => ({
      question: JSON.parse(row.question) as Question,
      attempts: row.attempts,
      selected: row.selected,
      completedAt: row.completedAt,
      updatedAt: row.updatedAt,
      reason: !currentKeys.has(key(row))
        ? currentIds.has(row.id)
          ? "changed"
          : "removed"
        : row.archived
          ? "archived"
          : row.completedAt
            ? "learned"
            : "retry",
    }));
    const git = (...args: string[]) => {
      try {
        return execFileSync("git", args, {
          cwd: root,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }).trim();
      } catch {
        return "";
      }
    };
    return {
      sourceVersion,
      questions,
      history,
      graph: current.graph,
      checkedAt: new Date().toISOString(),
      checkout: {
        root,
        branch: git("branch", "--show-current"),
        revision: git("rev-parse", "--verify", "HEAD"),
        dirty: Boolean(git("status", "--porcelain", "--", ...learningSources)),
      },
      progressPath: path(),
      review: {
        revision: published?.revision ?? null,
        builtAt: published?.builtAt ?? null,
        summary: published?.summary ?? null,
        lastCheckedAt: checked?.at ?? null,
        checkedRevision: checked?.revision ?? null,
      },
    };
  }
  function act(body: unknown) {
    const input = actionSchema.parse(body);
    const question = catalog().questions.find(
      (q) => q.id === input.id && q.version === input.version,
    );
    if (!question)
      throw new LearningError(
        "This question changed or was removed. Refresh to learn the current version.",
        409,
      );
    if (input.action === "answer" && !question.options.includes(input.selected))
      throw new LearningError("Choose one of this question's answers.");
    mkdirSync(dirname(path()), { recursive: true });
    const db = new Database(path());
    try {
      db.pragma("busy_timeout = 5000");
      db.exec(`CREATE TABLE IF NOT EXISTS progress (
        id TEXT NOT NULL, version TEXT NOT NULL, question TEXT NOT NULL,
        selected TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        completedAt TEXT, archived INTEGER NOT NULL DEFAULT 0,
        updatedAt TEXT NOT NULL, PRIMARY KEY (id, version)
      )`);
      const correct =
        input.action === "answer" && input.selected === question.answer;
      db.transaction(() => {
        const row = db
          .prepare("SELECT * FROM progress WHERE id = ? AND version = ?")
          .get(input.id, input.version) as Saved | undefined;
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO progress
          (id, version, question, selected, attempts, completedAt, archived, updatedAt)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id, version) DO UPDATE SET
          question=excluded.question, selected=excluded.selected,
          attempts=excluded.attempts, completedAt=excluded.completedAt,
          archived=excluded.archived, updatedAt=excluded.updatedAt`,
        ).run(
          question.id,
          question.version,
          JSON.stringify(question),
          input.action === "answer" ? input.selected : (row?.selected ?? null),
          (row?.attempts ?? 0) + (input.action === "answer" ? 1 : 0),
          row?.completedAt ?? (correct ? now : null),
          input.action === "archive"
            ? 1
            : input.action === "restore"
              ? 0
              : (row?.archived ?? 0),
          now,
        );
      })();
      return {
        correct,
        answer: question.answer,
        explanation: question.explanation,
      };
    } finally {
      db.close();
    }
  }
  function source(file: string, revision: string | null) {
    if (!revision) {
      if (!learningSources.some((path) => path === file))
        throw new LearningError("Unknown learning source", 404);
      return readFileSync(join(root, file), "utf8");
    }
    const { published } = readLearningContent(root);
    const cited = [
      ...(published?.catalog.questions ?? []),
      ...read().map((row) => JSON.parse(row.question) as Question),
    ];
    if (
      !/^[a-f0-9]{40,64}$/.test(revision) ||
      !(
        cited.some(
          (q) => q.source.path === file && q.source.revision === revision,
        ) ||
        (file === "docs/architecture.md" && published?.revision === revision)
      )
    )
      throw new LearningError("Unknown learning source", 404);
    return execFileSync("git", ["show", `${revision}:${file}`], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 8_000_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return {
    state,
    act,
    source,
  };
}
