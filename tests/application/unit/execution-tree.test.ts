import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  fitToBudget,
  treeFromArchive,
  ExecutionTreeError,
} from "../../../src/server/execution-tree";
import { writeTar } from "../../../src/server/tar";

const repository = [
  {
    path: "Dockerfile",
    content: 'FROM python:3.12-slim\nCMD ["python", "app.py"]\n',
  },
  { path: "app.py", content: "print('ready')\n" },
  { path: "src/pkg/__init__.py", content: "" },
];

describe("execution trees", () => {
  it("reads a gzip archive with a top-level directory into files", () => {
    const archive = gzipSync(
      writeTar(
        repository.map((file) => ({
          path: `qa-app-abc/${file.path}`,
          content: Buffer.from(file.content),
        })),
      ),
    );
    const tree = treeFromArchive(archive);
    expect(tree.files.map((file) => file.path)).toEqual(
      repository.map((file) => file.path),
    );
    expect(tree.files.map((file) => file.content.toString())).toEqual(
      repository.map((file) => file.content),
    );
    expect(tree.omitted).toEqual([]);
    expect(() => treeFromArchive(Buffer.from("not gzip"))).toThrow(
      ExecutionTreeError,
    );
  });
});

describe("a repository larger than the workspace budget", () => {
  const asset = (name: string, bytes: number) => ({
    path: `docs/assets/${name}`,
    content: Buffer.alloc(bytes, 7),
    mode: 0o644,
  });
  const source = (name: string, text: string) => ({
    path: name,
    content: Buffer.from(text),
    mode: 0o644,
  });

  it("drops the largest files, keeps the source, and names what went", () => {
    const files = [
      source("docker-compose.yml", "services:\n  web:\n"),
      source("Dockerfile", "FROM python\n"),
      asset("screenshot-a.png", 4_000),
      asset("sample-scan.pdf", 9_000),
      asset("screenshot-b.png", 3_000),
    ];
    const fitted = fitToBudget(files, 8_000);
    expect(fitted.files.map((file) => file.path)).toEqual([
      "docker-compose.yml",
      "Dockerfile",
      "docs/assets/screenshot-a.png",
      "docs/assets/screenshot-b.png",
    ]);
    expect(fitted.omitted).toEqual([
      { path: "docs/assets/sample-scan.pdf", bytes: 9_000 },
    ]);
  });

  it("keeps dropping until it fits, largest first", () => {
    const fitted = fitToBudget(
      [
        source("compose.yml", "x"),
        asset("a.png", 5_000),
        asset("b.png", 6_000),
        asset("c.png", 7_000),
      ],
      5_500,
    );
    expect(fitted.files.map((file) => file.path)).toEqual([
      "compose.yml",
      "docs/assets/a.png",
    ]);
    expect(fitted.omitted.map((file) => file.bytes)).toEqual([7_000, 6_000]);
  });

  it("leaves a repository that fits exactly as it is", () => {
    const files = [source("compose.yml", "x"), asset("a.png", 100)];
    const fitted = fitToBudget(files, 1_000);
    expect(fitted.files).toBe(files);
    expect(fitted.omitted).toEqual([]);
  });
});
