import { createHash } from "node:crypto";
import ts from "typescript";

// Read source, never import the operator or open its application database.
export const learningSources = [
  "CONTEXT.md",
  "docs/architecture.md",
  "src/server/pi.ts",
  "src/server/db-schema.ts",
] as const;
export type Source = { path: string; line: number; revision?: string };
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
export type Graph = {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label: string }[];
};
export const digest = (value: unknown) =>
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

export type Catalog = ReturnType<typeof buildLearningCatalog>;
