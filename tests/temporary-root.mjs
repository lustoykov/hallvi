// Scratch directories for browser fixtures and live evals: always /tmp/server-guy-<kind>-<random>,
// created here and deleted here, and nothing else is ever deleted. Saved results live under tests/results/,
// which is never inside one of these roots.
import { mkdtempSync, rmSync } from "node:fs";

const prefixShape = /^\/tmp\/server-guy-[a-z0-9-]+-$/;
const rootShape = /^\/tmp\/server-guy-[a-z0-9-]+-[A-Za-z0-9]{6}$/;

/** Creates a fresh scratch root, e.g. createTemporaryRoot("/tmp/server-guy-e2e-"). */
export function createTemporaryRoot(prefix) {
  if (!prefixShape.test(prefix)) throw new Error(`Scratch roots live under /tmp/server-guy-*, not ${prefix}`);
  return mkdtempSync(prefix);
}

/**
 * Deletes a root created by createTemporaryRoot. Symlinks inside it (the fixture app's node_modules link)
 * are unlinked, never followed. Returns false when the root is already gone; refuses any other path.
 */
export function removeTemporaryRoot(root) {
  if (!rootShape.test(root)) throw new Error(`Refusing to delete ${root}: not a Server Guy scratch root`);
  try { rmSync(root, { recursive: true, force: false }); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
