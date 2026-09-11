import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
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
    expect(tree.map((file) => file.path)).toEqual(
      repository.map((file) => file.path),
    );
    expect(tree.map((file) => file.content.toString())).toEqual(
      repository.map((file) => file.content),
    );
    expect(() => treeFromArchive(Buffer.from("not gzip"))).toThrow(
      ExecutionTreeError,
    );
  });
});
