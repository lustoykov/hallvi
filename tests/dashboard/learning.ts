import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Database from "better-sqlite3";
import ts from "typescript";
import { z } from "zod";

// Read source, never import the operator or open its application database.
export const learningSources = [
  "CONTEXT.md",
  "docs/architecture.md",
  "src/server/pi.ts",
  "src/server/db-schema.ts",
] as const;
type Source = { path: string; line: number };
export type Question = {
  id: string;
  version: string;
  topic: string;
  title: string;
  prompt: string;
  description: string;
  explanation: string;
  answer: string;
  options: string[];
  source: Source;
};
type Draft = Omit<Question, "version" | "options">;
type Graph = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label: string }[];
};
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
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const plain = (value: string) =>
  value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/\[([^\]]+)\]\([^\n]*?\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|[.,;:]|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

function definitions(source: string): Draft[] {
  const lines = source.split("\n");
  const result: Draft[] = [];
  let topic = "";
  for (let index = 0; index < lines.length; index++) {
    const heading = /^## (.+)/.exec(lines[index]);
    if (heading) topic = heading[1];
    if (topic === "Retired and optional terms") continue;
    const match = /^\*\*([^*]+)\*\*[^:]*:\s*(.+)/.exec(lines[index]);
    if (!match) continue;
    const line = index + 1;
    let definition = match[2];
    while (lines[index + 1]?.trim()) definition += " " + lines[++index];
    const title = plain(match[1]);
    result.push({
      id: `concept:${slug(title)}`,
      topic,
      title,
      prompt: "Which Hallvi concept does this describe?",
      description: plain(definition),
      explanation: plain(definition),
      answer: title,
      source: { path: "CONTEXT.md", line },
    });
  }
  if (!result.length)
    throw new Error("No definitions found in CONTEXT.md. Check its format.");
  return result;
}

// Compiler syntax trees handle multiline objects and comments without
// executing code. A dynamic contract fails visibly rather than disappearing.
function syntax(path: string, source: string) {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const location = (node: ts.Node): Source => ({
    path,
    line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
  });
  return { file, location };
}
function literal(node: ts.Node | undefined): string {
  if (node && ts.isStringLiteralLike(node)) return node.text;
  if (
    node &&
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  )
    return literal(node.left) + literal(node.right);
  throw new Error("A learning source is no longer a static string.");
}
function toolQuestions(source: string): Draft[] {
  const { file, location } = syntax("src/server/pi.ts", source);
  const result: Draft[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "defineTool"
    ) {
      const object = node.arguments[0];
      if (!object || !ts.isObjectLiteralExpression(object))
        throw new Error("Cannot read a tool definition in pi.ts.");
      const properties = new Map(
        object.properties
          .filter(ts.isPropertyAssignment)
          .map((p) => [p.name.getText(file), p.initializer]),
      );
      const name = literal(properties.get("name"));
      const description = plain(literal(properties.get("description")));
      const firstSentence = description.split(/(?<=[.!?])\s+/)[0];
      result.push({
        id: `tool:${name}`,
        topic: "Operator tools",
        title: literal(properties.get("label")),
        prompt: "Which operator tool has this responsibility?",
        description: firstSentence,
        explanation: description,
        answer: name,
        source: location(node),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!result.length) throw new Error("No operator tools found in pi.ts.");
  return result;
}
function tableQuestions(source: string): Draft[] {
  const { file, location } = syntax("src/server/db-schema.ts", source);
  const result: Draft[] = [];
  function visit(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "sqliteTable"
    ) {
      const name = literal(node.arguments[0]);
      const columns = node.arguments[1];
      if (!columns || !ts.isObjectLiteralExpression(columns))
        throw new Error("Cannot read columns in db-schema.ts.");
      const fields = columns.properties
        .filter(ts.isPropertyAssignment)
        .map((p) => p.name.getText(file));
      const distinctive = fields.filter(
        (field) =>
          !["id", "createdAt", "updatedAt", "applicationId"].includes(field),
      );
      result.push({
        id: `table:${name}`,
        topic: "Controller storage",
        title: name,
        prompt: "Which controller table stores these fields?",
        description: distinctive.join(", "),
        explanation: `${name} stores ${fields.join(", ")}. These fields are read directly from the schema in this checkout.`,
        answer: name,
        source: location(node),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (result.length < 2) throw new Error("Cannot read controller tables.");
  return result;
}

/** The documented overview uses one directed edge per line and [] / [()]. */
export function architectureGraph(source: string): Graph {
  const section = source
    .split(/^## The shape of it\s*$/m)[1]
    ?.split(/^## /m)[0];
  const diagram = section?.match(/```mermaid\s*\n([\s\S]*?)```/)?.[1];
  if (!diagram) throw new Error("Architecture overview diagram is missing.");
  const nodes = new Map<string, string>();
  const edges: Graph["edges"] = [];
  function node(value: string) {
    const match = /^(\w+)(?:\[(?:\((.*)\)|(.*))\])?$/.exec(value.trim());
    if (!match) throw new Error("Unsupported architecture node: " + value);
    const [, id, round, square] = match;
    if (!nodes.has(id) || round || square)
      nodes.set(id, plain(round ?? square ?? id));
    return id;
  }
  for (const line of diagram
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (/^(flowchart|graph) (TD|LR)$/.test(line) || line.startsWith("%%"))
      continue;
    const match = /^(.*?)\s*-->\s*(?:\|([^|]+)\|\s*)?(.*?)$/.exec(line);
    if (!match) throw new Error("Unsupported architecture edge: " + line);
    edges.push({
      from: node(match[1]),
      to: node(match[3]),
      label: plain(match[2] ?? ""),
    });
  }
  if (!edges.length)
    throw new Error("Architecture diagram has no connections.");
  return {
    nodes: [...nodes].map(([id, label]) => ({ id, label })),
    edges,
  };
}

export function buildLearningCatalog(sources: Record<string, string>) {
  const drafts = [
    ...definitions(sources["CONTEXT.md"]),
    ...tableQuestions(sources["src/server/db-schema.ts"]),
    ...toolQuestions(sources["src/server/pi.ts"]),
  ];
  const ids = drafts.map((q) => q.id);
  if (new Set(ids).size !== ids.length)
    throw new Error("Duplicate learning concepts. Give each a distinct name.");
  const questions: Question[] = drafts.map((q) => {
    const sameTopic = drafts.filter((other) => other.topic === q.topic);
    const pool = sameTopic.length > 1 ? sameTopic : drafts;
    const alternatives = pool
      .filter((other) => other.answer !== q.answer)
      .sort((a, b) => digest([q.id, a.id]).localeCompare(digest([q.id, b.id])))
      .slice(0, 3)
      .map((other) => other.answer);
    // Moving a definition, adding a distractor or reformatting a source must
    // not erase mastery. Only the material being learned versions it.
    const version = digest([q.prompt, q.answer, q.description, q.explanation]);
    const options = [...alternatives, q.answer].sort((a, b) =>
      digest([q.id, a]).localeCompare(digest([q.id, b])),
    );
    return { ...q, version, options };
  });
  return {
    questions,
    graph: architectureGraph(sources["docs/architecture.md"]),
  };
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
  let storePath = process.env.HALLVI_LEARNING_DB_PATH
    ? resolve(root, process.env.HALLVI_LEARNING_DB_PATH)
    : "";
  function catalog() {
    const sources = Object.fromEntries(
      learningSources.map((path) => [
        path,
        readFileSync(join(root, path), "utf8"),
      ]),
    );
    const version = digest(sources);
    if (version !== sourceVersion || !cached) {
      cached = buildLearningCatalog(sources);
      sourceVersion = version;
    }
    return cached;
  }
  function path() {
    if (!storePath) {
      const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
      storePath = join(resolve(root, common), "hallvi-learning.sqlite");
    }
    return storePath;
  }
  function read(): Saved[] {
    if (!existsSync(path())) return [];
    const db = new Database(path(), { readonly: true });
    try {
      return db
        .prepare("SELECT * FROM progress ORDER BY updatedAt DESC")
        .all() as Saved[];
    } finally {
      db.close();
    }
  }
  function state() {
    const current = catalog();
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
  return { state, act };
}
