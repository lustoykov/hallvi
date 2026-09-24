// Where the worker listens for the app: one rule, shared by the app, the
// worker, the installed command and the upgrade.
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { request } from "node:http";
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

/**
 * Ask the worker serving this database to stop taking new work, and learn
 * how much it still has in hand. `null` when there is no worker to ask —
 * nothing listens on the socket — and nothing else: a worker that answers
 * badly, or a connection that breaks, is an error, because "not known" must
 * never be read as "nothing in hand". The worker's own `hold` answers this —
 * the same one an update uses — so a detach and an update agree on "busy".
 */
export function holdWorker(databasePath, minutes = 20) {
  return new Promise((resolve, reject) => {
    const asked = request(
      {
        socketPath: workerSocketPath(databasePath),
        agent: false,
        path: "/hold",
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          if (response.statusCode !== 200)
            return reject(
              new Error(`The worker answered ${response.statusCode}: ${text}`),
            );
          try {
            const answer = JSON.parse(text);
            if (!Number.isInteger(answer?.busy))
              throw new Error("The worker did not say how busy it is.");
            resolve(answer);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    asked.on("error", (error) =>
      ["ENOENT", "ECONNREFUSED"].includes(error.code ?? "")
        ? resolve(null)
        : reject(error),
    );
    // A worker that does not answer is not known to be idle either.
    asked.setTimeout(10_000, () =>
      asked.destroy(new Error("The worker did not answer in time.")),
    );
    asked.end(JSON.stringify({ scope: null, message: { minutes } }));
  });
}
