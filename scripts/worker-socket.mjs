// Where the worker listens for the app: one rule, shared by the app, the
// worker, the installed command and the upgrade.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Beside the database. A Unix socket path has a small fixed limit (104 bytes
 * on macOS), which a deep checkout exceeds; then it is a short name in this
 * user's temporary directory, derived from the database's own path.
 */
export function workerSocketPath(databasePath) {
  const beside = join(dirname(resolve(databasePath)), "worker.sock");
  if (Buffer.byteLength(beside) <= 100) return beside;
  let directory = dirname(resolve(databasePath));
  try {
    directory = realpathSync(directory);
  } catch {
    // Not there yet: the unresolved path names it just as well.
  }
  const name = createHash("sha256")
    .update(directory)
    .digest("hex")
    .slice(0, 16);
  return join(tmpdir(), `hallvi-worker-${name}.sock`);
}
