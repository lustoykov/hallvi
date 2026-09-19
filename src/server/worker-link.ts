// The one line between the app and the worker: a Unix socket beside the
// database, carrying small JSON requests.
//
// The worker owns every Pi session. The app never opens one; it asks. The
// socket is also what makes the worker the only owner: requests reach whoever
// holds this path, sessions are opened only on request, and a second worker
// that finds the path answered leaves.
import { rmSync } from "node:fs";
import { request, createServer, type Server } from "node:http";
import { connect } from "node:net";
import { dirname, join } from "node:path";

import { databasePath } from "./db";

export function workerSocketPath() {
  const path = join(dirname(databasePath()), "worker.sock");
  // The platform's limit for a socket path; past it, listen fails obscurely.
  if (Buffer.byteLength(path) > 100)
    throw new Error(`The worker socket path is too long: ${path}`);
  return path;
}

/** The worker could not be asked. Nothing was accepted. */
export class WorkerUnavailableError extends Error {
  constructor() {
    super(
      "Hallvi's worker is not running, so nothing was sent. Start it, then try again.",
    );
  }
}

/** The worker answered with a refusal the owner should read. */
export class WorkerRefusal extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

/** Ask the worker. Resolves with its answer or rejects with why not. */
export function askWorker<T>(action: string, body: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const asked = request(
      {
        socketPath: workerSocketPath(),
        path: `/${action}`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          try {
            const answer = JSON.parse(text);
            if (response.statusCode === 200) resolve(answer as T);
            else reject(new WorkerRefusal(answer.error, answer.code));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    asked.on("error", (error: NodeJS.ErrnoException) =>
      reject(
        ["ENOENT", "ECONNREFUSED"].includes(error.code ?? "")
          ? new WorkerUnavailableError()
          : error,
      ),
    );
    asked.end(JSON.stringify(body));
  });
}

function answered(path: string) {
  return new Promise<boolean>((resolve) => {
    const probe = connect(path);
    probe.once("connect", () => {
      probe.destroy();
      resolve(true);
    });
    probe.once("error", () => resolve(false));
  });
}

/**
 * Become the worker for this database, or learn that there already is one.
 * A path nobody answers was left by a worker that died, and is replaced.
 */
export async function serveWorker(
  handle: (action: string, body: unknown) => Promise<unknown>,
): Promise<Server | null> {
  const path = workerSocketPath();
  if (await answered(path)) return null;
  rmSync(path, { force: true });
  const server = createServer((incoming, outgoing) => {
    let text = "";
    incoming.setEncoding("utf8");
    incoming.on("data", (chunk) => (text += chunk));
    incoming.on("end", () => {
      const reply = (status: number, value: unknown) => {
        outgoing.writeHead(status, { "Content-Type": "application/json" });
        outgoing.end(JSON.stringify(value));
      };
      handle((incoming.url ?? "/").slice(1), JSON.parse(text || "null")).then(
        (value) => reply(200, value ?? {}),
        (error) =>
          reply(error instanceof WorkerRefusal ? 409 : 500, {
            error: error instanceof Error ? error.message : "The worker failed.",
            code: error instanceof WorkerRefusal ? error.code : "failed",
          }),
      );
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Only this user may reach it: the requests carry instructions for Pi.
    const mask = process.umask(0o177);
    server.listen(path, () => {
      process.umask(mask);
      resolve();
    });
  });
  return server;
}
