import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExecutionReader } from "../../../src/server/execution-reader";
import type { ExecutionRecord } from "../../../src/server/operator-execution";

let root: string;
const applicationId = randomUUID();
const chatId = randomUUID();
function record(index = 0): ExecutionRecord {
  return {
    id: randomUUID(),
    applicationId,
    chatId,
    runId: chatId,
    tool: "server_bash",
    target: "fixture",
    input: "echo fixture",
    mode: "bypass",
    status: "running",
    output: "first",
    createdAt: new Date(index * 1000).toISOString(),
  };
}
async function write(directory: string, value: ExecutionRecord) {
  await fs.mkdir(directory, { recursive: true });
  const path = join(directory, `${value.id}.json`);
  const temporary = `${path}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value));
  await fs.rename(temporary, path);
  return path;
}
beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), "hv-execution-reader-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

it("shares concurrent history reads, caps IO, and returns independent records without reparsing", async () => {
  const reader = new ExecutionReader();
  const records = Array.from({ length: 40 }, (_, index) => record(index));
  const other = join(root, "other-controller");
  for (const value of records) {
    await write(root, value);
    await write(other, value);
  }
  const readFile = fs.readFile.bind(fs);
  let active = 0;
  let peak = 0;
  const reads = vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
    active++;
    peak = Math.max(peak, active);
    try {
      await delay(2);
      return await readFile(...args);
    } finally {
      active--;
    }
  });
  const parses = vi.spyOn(JSON, "parse");
  const [pages] = await Promise.all([
    Promise.all(Array.from({ length: 10 }, () => reader.list(root))),
    reader.list(other),
    reader.read(join(root, `${records[0].id}.json`)),
  ]);
  expect(reads).toHaveBeenCalledTimes(records.length * 2);
  expect(parses).toHaveBeenCalledTimes(records.length * 2);
  expect(peak).toBeLessThanOrEqual(8);
  expect(pages[0]).toEqual(records);
  pages[0][0].runId = "placed-in-a-different-reply";
  pages[0][0].output = "mutated";
  pages[0].pop();
  expect(pages[1]).toEqual(records);
  const single = await reader.read(join(root, `${records[0].id}.json`));
  single!.status = "failed";
  expect(await reader.list(root)).toEqual(records);
  expect(reads).toHaveBeenCalledTimes(records.length * 2);
  expect(parses).toHaveBeenCalledTimes(records.length * 2);
});

it("sees running updates, same-size replacements, new and removed files", async () => {
  const reader = new ExecutionReader();
  const running = record();
  const path = await write(root, running);
  const original = await fs.stat(path);
  const reads = vi.spyOn(fs, "readFile");
  expect(await reader.list(root)).toEqual([running]);
  // Same length and mtime: replacement identity still makes this new evidence.
  const updated = { ...running, output: "later" };
  await write(root, updated);
  await fs.utimes(path, original.atime, original.mtime);
  expect(await reader.read(path)).toEqual(updated);
  const next = record(1);
  await write(root, next);
  await fs.writeFile(join(root, "ignored.json.tmp"), "not a record");
  expect(await reader.list(root)).toEqual([updated, next]);
  await fs.unlink(path);
  expect(await reader.read(path)).toBeUndefined();
  expect(await reader.list(root)).toEqual([next]);
  expect(reads).toHaveBeenCalledTimes(3);
  await write(root, { ...next, status: "succeeded", output: "done" });
  expect((await reader.list(root))[0]).toMatchObject({
    status: "succeeded",
    output: "done",
  });
});

it("never stamps old bytes with a replacement's metadata and does not cache read failures", async () => {
  const reader = new ExecutionReader();
  const first = record();
  const path = await write(root, first);
  const updated = { ...first, output: "replacement" };
  const readFile = fs.readFile.bind(fs);
  vi.spyOn(fs, "readFile").mockImplementationOnce(async (...args) => {
    const bytes = await readFile(...args);
    await write(root, updated);
    return bytes;
  });
  expect(await reader.read(path)).toEqual(first);
  expect(await reader.read(path)).toEqual(updated);
  await fs.writeFile(path, "invalid json");
  await expect(reader.list(root)).rejects.toThrow();
  await write(root, first);
  expect(await reader.list(root)).toEqual([first]);
  const readdir = fs.readdir.bind(fs);
  vi.spyOn(fs, "readdir").mockImplementationOnce(async (...args) => {
    const names = await readdir(...args);
    await fs.unlink(path);
    return names;
  });
  expect(await reader.list(root)).toEqual([]);
});

it("isolates storage roots and discovers a recreated directory and a fresh reader", async () => {
  const reader = new ExecutionReader();
  const first = record();
  const a = join(root, "controller-a", applicationId);
  const b = join(root, "controller-b", applicationId);
  await write(a, first);
  await write(b, { ...first, output: "other controller" });
  expect((await reader.list(a))[0].output).toBe("first");
  expect((await reader.list(b))[0].output).toBe("other controller");
  await fs.rm(a, { recursive: true });
  expect(await reader.list(a)).toEqual([]);
  await write(a, { ...first, output: "recreated" });
  expect((await reader.list(a))[0].output).toBe("recreated");
  expect(await new ExecutionReader().list(a)).toEqual(await reader.list(a));
});

it("starts a notified refresh after the change instead of joining an older scan", async () => {
  const reader = new ExecutionReader();
  const first = record();
  await write(root, first);
  let release!: () => void;
  let scanned!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    scanned = resolve;
  });
  const readdir = fs.readdir.bind(fs);
  vi.spyOn(fs, "readdir").mockImplementationOnce(async (...args) => {
    const names = await readdir(...args);
    scanned();
    await held;
    return names;
  });
  const older = reader.list(root);
  try {
    await started;
    const next = record(1);
    await write(root, next);
    reader.invalidate(root);
    expect(await reader.list(root)).toEqual([first, next]);
  } finally {
    release();
  }
  expect(await older).toEqual([first]);
  reader.invalidate();
  expect(await reader.list(root)).toHaveLength(2);
});

it("evicts by count and retained size without truncating authoritative history", async () => {
  const values = [record(0), record(1), record(2)];
  const paths = [];
  for (const value of values) paths.push(await write(root, value));
  const reader = new ExecutionReader({ records: 2, bytes: 100_000 });
  const reads = vi.spyOn(fs, "readFile");
  await reader.read(paths[0]);
  await reader.read(paths[1]);
  await reader.read(paths[0]);
  await reader.read(paths[2]);
  await reader.read(paths[1]);
  expect(reads).toHaveBeenCalledTimes(4);
  expect(await reader.list(root)).toEqual(values);
  const noRoom = new ExecutionReader({ records: 100, bytes: 1 });
  reads.mockClear();
  expect(await noRoom.read(paths[0])).toEqual(values[0]);
  expect(await noRoom.read(paths[0])).toEqual(values[0]);
  expect(reads).toHaveBeenCalledTimes(2);
});
