import { isMainThread, parentPort, workerData } from "node:worker_threads";
import type { DatabaseErrorData } from "./database-client";

export function serveDatabaseThread(store: {
  open(path: string): void;
  close(): void;
  operations: Record<string, (...args: never[]) => unknown>;
}) {
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
    store.open(workerData.path);
  } catch (error) {
    startupError = error;
  }

  // Operations finish in order, including an online backup.
  // Transaction bodies remain synchronous and entirely inside one operation.
  let queue = Promise.resolve();
  port.on(
    "message",
    (request: { id: number; operation: string; args: unknown[] }) => {
      queue = queue.then(async () => {
        const { id, operation, args } = request;
        try {
          if (operation === "close") {
            store.close();
            port.postMessage({ id });
            port.close();
            return;
          }
          if (startupError) throw startupError;
          const run = store.operations[operation] as (
            ...args: unknown[]
          ) => unknown;
          if (!Object.hasOwn(store.operations, operation))
            throw new Error("Unknown database operation.");
          port.postMessage({ id, result: await run(...args) });
        } catch (error) {
          port.postMessage({ id, error: serializeError(error) });
        }
      });
    },
  );
}
