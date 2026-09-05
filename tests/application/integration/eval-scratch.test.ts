import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as database from "../../../src/server/db";
import { createEvalScratch, releaseEvalScratch } from "../../evals/scratch";
import { removeTemporaryRoot } from "../../temporary-root.mjs";
import { pushTestDatabase } from "../../test-database";

let root: string | undefined;
afterEach(() => {
  vi.unstubAllEnvs();
  if (root && existsSync(root)) removeTemporaryRoot(root);
});

it("closes the scratch SQLite handle and deletes the scratch directory once a live run is over", () => {
  root = createEvalScratch("pi-eval");
  expect(root).toMatch(/^\/tmp\/server-guy-pi-eval-[A-Za-z0-9]{6}$/);
  const path = join(root, "eval.db");
  vi.stubEnv("SERVER_GUY_DB_PATH", path);
  pushTestDatabase(path);
  const application = database.insertApplication({
    name: "scratch",
    repositoryUrl: "https://github.com/qa/scratch",
    repositoryOwner: "qa",
    repositoryName: "scratch",
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Current application launch",
  });
  expect(application.id).toBeTruthy();
  expect(existsSync(path)).toBe(true);
  expect(globalThis.__serverGuyDb).toBeDefined();
  expect(releaseEvalScratch(root)).toBe(true);
  expect(globalThis.__serverGuyDb).toBeUndefined();
  expect(existsSync(root)).toBe(false);
  expect(releaseEvalScratch(root)).toBe(false); // Releasing twice is harmless.
  // Setup that failed before creating a root has nothing to delete.
  expect(releaseEvalScratch(undefined)).toBe(false);
  expect(() => removeTemporaryRoot(resolve("tests/results"))).toThrow(); // Saved results are never a scratch root.
});
