import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import type { operations } from "./database-store";

export interface DatabaseErrorData {
  name: string;
  message: string;
  code?: string;
  cause?: DatabaseErrorData;
}

function restoreError(data: DatabaseErrorData): Error {
  const error = new Error(data.message, {
    cause: data.cause ? restoreError(data.cause) : undefined,
  });
  error.name = data.name;
  if (data.code) Object.assign(error, { code: data.code });
  return error;
}

/** One connection, owned by one thread. Only named storage operations cross. */
export class DatabaseClient {
  readonly worker: Worker;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
    }
  >();
  private failure?: Error;
  private closing?: Promise<void>;
  private exited: Promise<void>;

  constructor(path: string, onFailure?: () => void) {
    this.worker = new Worker(
      resolve(
        /* turbopackIgnore: true */ process.cwd(),
        process.env.NODE_ENV === "production"
          ? "dist/database-worker.mjs"
          : "scripts/database-worker.mjs",
      ),
      { workerData: { path }, execArgv: [] },
    );
    const fail = (error: Error) => {
      if (this.failure) return;
      this.failure = error;
      for (const request of this.pending.values()) request.reject(error);
      this.pending.clear();
      this.worker.unref();
      onFailure?.();
    };
    this.worker.on(
      "message",
      (message: {
        id: number;
        result?: unknown;
        error?: DatabaseErrorData;
      }) => {
        const request = this.pending.get(message.id);
        if (!request) return;
        this.pending.delete(message.id);
        if (!this.pending.size) this.worker.unref();
        if (message.error) request.reject(restoreError(message.error));
        else request.resolve(message.result);
      },
    );
    this.worker.on("error", (cause) =>
      fail(
        new Error(
          "Database worker failed; pending database outcomes are unknown. Restart Hallvi before retrying.",
          { cause },
        ),
      ),
    );
    this.exited = new Promise((done) =>
      this.worker.once("exit", (code) => {
        if (!this.closing || this.pending.size)
          fail(
            new Error(
              `Database worker exited (${code}); pending database outcomes are unknown. Restart Hallvi before retrying.`,
            ),
          );
        done();
      }),
    );
    // An idle connection must not hold a CLI, test, or stopped Pi process open.
    // An outstanding request does keep it alive until its answer is delivered.
    this.worker.unref();
  }

  call<K extends keyof typeof operations>(
    operation: K,
    args: Parameters<(typeof operations)[K]>,
  ): Promise<Awaited<ReturnType<(typeof operations)[K]>>> {
    if (this.closing) return Promise.reject(new Error("Database is closing."));
    return this.send(operation, args) as Promise<
      Awaited<ReturnType<(typeof operations)[K]>>
    >;
  }

  private send(operation: keyof typeof operations | "close", args: unknown[]) {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.ref();
      try {
        this.worker.postMessage({ id, operation, args });
      } catch (error) {
        this.pending.delete(id);
        if (!this.pending.size) this.worker.unref();
        reject(error);
      }
    });
  }

  close(): Promise<void> {
    return (this.closing ??= (async () => {
      if (!this.failure) await this.send("close", []);
      await this.exited;
    })());
  }
}
