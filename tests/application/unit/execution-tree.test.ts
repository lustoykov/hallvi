import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  applyOverlay,
  dockerfileStartCommand,
  overlayDigest,
  treeDigest,
  treeFromArchive,
  ExecutionTreeError,
} from "../../../src/server/execution-tree";
import { writeTar } from "../../../src/server/tar";
import { repositoryFixtures } from "../../fixtures/repositories";

const files = (name: keyof typeof repositoryFixtures) =>
  repositoryFixtures[name].map((file) => ({
    path: file.path,
    content: Buffer.from(file.content),
    mode: 0o644,
  }));

describe("execution trees", () => {
  it("reads a gzip archive with a top-level directory into files", () => {
    const archive = gzipSync(
      writeTar(
        repositoryFixtures["fastapi-conforming"].map((file) => ({
          path: `qa-app-abc/${file.path}`,
          content: Buffer.from(file.content),
        })),
      ),
    );
    const tree = treeFromArchive(archive);
    expect(tree.map((file) => file.path)).toEqual(
      repositoryFixtures["fastapi-conforming"].map((file) => file.path),
    );
    expect(() => treeFromArchive(Buffer.from("not gzip"))).toThrow(
      ExecutionTreeError,
    );
  });

  it("applies an overlay deterministically and digests the exact result", () => {
    const base = files("fastapi-nohealth");
    const changed = applyOverlay(base, [
      {
        path: "app/main.py",
        content: "print('health')\n",
        baseObservationId: "o",
      },
      { path: "README.md", content: null, baseObservationId: "r" },
      { path: "app/new.py", content: "", baseObservationId: null },
    ]);
    expect(changed.some((file) => file.path === "README.md")).toBe(false);
    expect(
      changed.find((file) => file.path === "app/main.py")?.content.toString(),
    ).toBe("print('health')\n");
    expect(changed.some((file) => file.path === "app/new.py")).toBe(true);
    const digest = treeDigest(changed);
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(treeDigest([...changed].reverse())).toBe(digest);
    expect(treeDigest(base)).not.toBe(digest);
    expect(
      overlayDigest([
        { path: "b", content: "2", baseObservationId: null },
        { path: "a", content: "1", baseObservationId: null },
      ]),
    ).toBe(
      overlayDigest([
        { path: "a", content: "1", baseObservationId: null },
        { path: "b", content: "2", baseObservationId: null },
      ]),
    );
  });

  it("takes the start command from the tree's Dockerfile, exec or shell form", () => {
    expect(dockerfileStartCommand(files("fastapi-conforming"))).toEqual([
      "uvicorn",
      "app.main:app",
      "--host",
      "0.0.0.0",
      "--port",
      "8000",
    ]);
    expect(dockerfileStartCommand(files("fastapi-localhost"))).toContain(
      "127.0.0.1",
    );
    expect(
      dockerfileStartCommand([
        {
          path: "Dockerfile",
          content: Buffer.from("FROM x\nCMD uv run uvicorn app:app\n"),
          mode: 0o644,
        },
      ]),
    ).toEqual(["sh", "-c", "uv run uvicorn app:app"]);
    expect(
      dockerfileStartCommand([
        {
          path: "Dockerfile",
          content: Buffer.from(
            'FROM x\nENTRYPOINT ["uv", "run"]\nCMD ["uvicorn", "app:app"]\n',
          ),
          mode: 0o644,
        },
      ]),
    ).toEqual(["uv", "run", "uvicorn", "app:app"]);
    expect(dockerfileStartCommand(files("readme-only"))).toBeNull();
  });
});
