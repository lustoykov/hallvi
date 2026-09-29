import { isMainThread, parentPort, workerData } from "node:worker_threads";
import { closeDatabase, openDatabase, operations } from "./database-store";
import type { DatabaseErrorData } from "./database-client";

if (isMainThread || !parentPort)
  throw new Error("Database operations belong in the database worker.");
const port = parentPort;

function serializeError(value: unknown): DatabaseErrorData {
  const error = value instanceof Error ? value : new Error(String(value));
  return {
    name: error.name,
    message: error.message,
    ...("code" in error && typeof error.code === "string"
      ? { code: error.code }
      : {}),
    ...(error.cause ? { cause: serializeError(error.cause) } : {}),
  };
}

let startupError: unknown;
try {
  openDatabase(workerData.path);
} catch (error) {
  startupError = error;
}

// Every operation finishes before the next starts, including an online backup.
// Transaction bodies remain synchronous and entirely inside one operation.
let queue = Promise.resolve();
port.on(
  "message",
  (request: {
    id: number;
    operation: keyof typeof operations | "close";
    args: unknown[];
  }) => {
    queue = queue.then(async () => {
      const { id, operation, args } = request;
      try {
        if (operation === "close") {
          closeDatabase();
          port.postMessage({ id });
          port.close();
          return;
        }
        if (startupError) throw startupError;
        const run = operations[operation] as (...args: unknown[]) => unknown;
        if (!Object.hasOwn(operations, operation))
          throw new Error("Unknown database operation.");
        port.postMessage({ id, result: await run(...args) });
      } catch (error) {
        port.postMessage({ id, error: serializeError(error) });
      }
    });
  },
);
