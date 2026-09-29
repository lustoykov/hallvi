import { promises as fs, type BigIntStats } from "node:fs";
import { join, resolve, dirname } from "node:path";
import type { ExecutionRecord } from "./operator-execution";

const CONCURRENCY = 8;
const recordName = /^[0-9a-f-]{36}\.json$/;
const missing = (error: unknown) =>
  (error as NodeJS.ErrnoException).code === "ENOENT";
const version = (stat: BigIntStats) =>
  `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;

/**
 * Disposable, process-local evidence cache. Files remain authoritative: each
 * read checks metadata, including inode identity because the writer renames
 * a new file over the old one. Paths include the controller storage root.
 */
export class ExecutionReader {
  private records = new Map<
    string,
    { version: string; record: ExecutionRecord; bytes: number }
  >();
  private bytes = 0;
  private lists = new Map<string, Promise<ExecutionRecord[]>>();
  private reads = new Map<
    string,
    { version: string; result: Promise<ExecutionRecord | undefined> }
  >();
  private active = 0;
  private waiting: (() => void)[] = [];

  constructor(
    private readonly limits = { records: 4096, bytes: 32 * 1024 * 1024 },
  ) {}

  /** A notification must not join a directory scan begun before the change. */
  invalidate(directory?: string) {
    if (directory) this.lists.delete(resolve(directory));
    else this.lists.clear();
    // Content needs no explicit invalidation: every new scan/read checks its
    // file version, including in-flight reads. Preserve unchanged history.
  }

  private forget(path: string) {
    const cached = this.records.get(path);
    if (cached) this.bytes -= cached.bytes;
    this.records.delete(path);
  }

  private remember(
    path: string,
    stamp: string,
    record: ExecutionRecord,
    bytes: number,
  ) {
    this.forget(path);
    if (bytes > this.limits.bytes || this.limits.records < 1) return;
    this.records.set(path, { version: stamp, record, bytes });
    this.bytes += bytes;
    while (
      this.records.size > this.limits.records ||
      this.bytes > this.limits.bytes
    )
      this.forget(this.records.keys().next().value!);
  }

  private async limited<T>(work: () => Promise<T>): Promise<T> {
    if (this.active >= CONCURRENCY)
      await new Promise<void>((ready) => this.waiting.push(ready));
    else this.active++;
    try {
      return await work();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }

  private async load(path: string, stamp: string) {
    const text = await fs.readFile(path, "utf8");
    const record = JSON.parse(text) as ExecutionRecord;
    // Never label old bytes with a replacement's metadata. A racing write is
    // a valid snapshot for this reader, but the next reader must try again.
    const after = await fs.stat(path, { bigint: true });
    if (version(after) === stamp)
      // Budget UTF-16 text plus per-entry overhead; entry count is bounded too.
      this.remember(path, stamp, record, text.length * 2 + 512);
    return record;
  }

  private readRecord(path: string): Promise<ExecutionRecord | undefined> {
    return this.limited(async () => {
      try {
        const stamp = version(await fs.stat(path, { bigint: true }));
        const cached = this.records.get(path);
        if (cached?.version === stamp) {
          this.records.delete(path);
          this.records.set(path, cached);
          return cached.record;
        }
        this.forget(path);
        let pending = this.reads.get(path);
        if (pending?.version !== stamp) {
          pending = { version: stamp, result: this.load(path, stamp) };
          this.reads.set(path, pending);
        }
        try {
          return await pending.result;
        } finally {
          if (this.reads.get(path) === pending) this.reads.delete(path);
        }
      } catch (error) {
        if (!missing(error)) throw error;
        this.forget(path);
        return undefined;
      }
    });
  }

  private async scan(directory: string) {
    let files: string[];
    try {
      files = (await fs.readdir(directory)).filter((name) =>
        recordName.test(name),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      files = [];
    }
    const present = new Set(files.map((name) => join(directory, name)));
    for (const path of this.records.keys())
      if (dirname(path) === directory && !present.has(path)) this.forget(path);

    // A few workers, not one queued promise (or open file) per history entry.
    const records: (ExecutionRecord | undefined)[] = new Array(files.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, async () => {
        while (next < files.length) {
          const index = next++;
          records[index] = await this.readRecord(join(directory, files[index]));
        }
      }),
    );
    return records
      .filter((record): record is ExecutionRecord => record !== undefined)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async list(directory: string): Promise<ExecutionRecord[]> {
    directory = resolve(directory);
    let pending = this.lists.get(directory);
    if (!pending) {
      pending = this.scan(directory);
      this.lists.set(directory, pending);
    }
    try {
      // ExecutionRecord has only primitive fields. Copy the mutable object;
      // immutable output strings can be shared without copying the whole log.
      return (await pending).map((record) => ({ ...record }));
    } finally {
      if (this.lists.get(directory) === pending) this.lists.delete(directory);
    }
  }

  async read(path: string): Promise<ExecutionRecord | undefined> {
    const record = await this.readRecord(resolve(path));
    return record ? { ...record } : undefined;
  }
}
