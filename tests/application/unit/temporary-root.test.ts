import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../../temporary-root.mjs";

it("creates roots only under /tmp/server-guy-* and deletes exactly that root, never through symlinks", () => {
  const keep = createTemporaryRoot("/tmp/server-guy-test-keep-");
  writeFileSync(join(keep, "real.txt"), "stays");
  const root = createTemporaryRoot("/tmp/server-guy-test-");
  try {
    expect(root).toMatch(/^\/tmp\/server-guy-test-[A-Za-z0-9]{6}$/);
    mkdirSync(join(root, "app"), { recursive: true });
    writeFileSync(join(root, "state.db"), "sqlite");
    symlinkSync(keep, join(root, "app", "node_modules"), "dir"); // The fixture links the real node_modules the same way.
    expect(removeTemporaryRoot(root)).toBe(true);
    expect(existsSync(root)).toBe(false);
    expect(readFileSync(join(keep, "real.txt"), "utf8")).toBe("stays");
    expect(removeTemporaryRoot(root)).toBe(false);
  } finally {
    if (existsSync(root)) removeTemporaryRoot(root);
    removeTemporaryRoot(keep);
  }
});
it("refuses prefixes and paths that are not Server Guy scratch roots", () => {
  for (const prefix of [
    "/tmp/other-",
    "/var/tmp/server-guy-e2e-",
    "server-guy-e2e-",
    "/tmp/server-guy-",
    "/tmp/server-guy-e2e",
  ]) {
    expect(() => createTemporaryRoot(prefix), prefix).toThrow();
  }
  for (const path of [
    "/tmp",
    "/tmp/server-guy-e2e-",
    "/tmp/server-guy-e2e-abc123/..",
    "/tmp/server-guy-e2e-abc123/state",
    homedir(),
    resolve("tests/results"),
    resolve(".server-guy"),
  ]) {
    expect(() => removeTemporaryRoot(path), path).toThrow();
  }
});
