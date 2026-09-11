import { createHash } from "node:crypto";
// Synthetic repository trees for the disposable browser app's GitHub fixture.
// qa-fixture.mjs copies this folder into that app, so it imports nothing
// outside it.

export interface FixtureFile {
  path: string;
  content: string;
}

/** A small executable FastAPI service with a health endpoint. */
const fastapi: FixtureFile[] = [
  {
    path: "Dockerfile",
    content: [
      "FROM python:3.12-slim",
      "WORKDIR /app",
      "COPY requirements.txt ./",
      "RUN pip install --no-cache-dir -r requirements.txt",
      "COPY . .",
      "EXPOSE 8000",
      'CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]',
      "",
    ].join("\n"),
  },
  { path: "requirements.txt", content: "fastapi>=0.115\nuvicorn>=0.30\n" },
  { path: "app/__init__.py", content: "" },
  {
    path: "app/main.py",
    content: [
      "from fastapi import FastAPI",
      "",
      "app = FastAPI()",
      "",
      "",
      '@app.get("/health")',
      "def health():",
      '    return {"status": "ok"}',
      "",
      "",
      '@app.get("/")',
      "def home():",
      '    return {"message": "Todo"}',
      "",
    ].join("\n"),
  },
  {
    path: "README.md",
    content: "# todo-fastapi\n\nA small FastAPI todo service.\n",
  },
];

export const repositoryFixtures = {
  fastapi,
  /** Nothing to run: a repository holding only a README. */
  "readme-only": [{ path: "README.md", content: "# example\n" }],
} satisfies Record<string, FixtureFile[]>;

export type RepositoryFixtureName = keyof typeof repositoryFixtures;

/** The fixture a synthetic repository name maps to. */
export function fixtureForRepositoryName(name: string): RepositoryFixtureName {
  return name.toLowerCase().includes("fastapi") ? "fastapi" : "readme-only";
}

export interface FixtureTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

function blobSha(_path: string, content: string) {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex");
}

/** GitHub-style recursive tree entries, directories included. */
export function fixtureTree(files: readonly FixtureFile[]): FixtureTreeEntry[] {
  const directories = new Set<string>();
  for (const file of files) {
    const parts = file.path.split("/");
    for (let depth = 1; depth < parts.length; depth++)
      directories.add(parts.slice(0, depth).join("/"));
  }
  return [
    ...[...directories]
      .sort()
      .map((path) => ({ path, type: "tree" as const, sha: blobSha(path, "") })),
    ...files.map((file) => ({
      path: file.path,
      type: "blob" as const,
      size: Buffer.byteLength(file.content),
      sha: blobSha(file.path, file.content),
    })),
  ].sort((a, b) => a.path.localeCompare(b.path));
}
