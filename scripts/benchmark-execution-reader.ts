/**
 * Synthetic execution-evidence cost only; no controller, credentials or Pi.
 * Node 22: node --import tsx scripts/benchmark-execution-reader.ts
 * Counts are deterministic. Timings include OS caches and are observations,
 * not thresholds. Response mode includes JSON serialization of the evidence.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { promises as fs, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { ExecutionReader } from "../src/server/execution-reader";
import type { ExecutionRecord } from "../src/server/operator-execution";

async function main() {
  const count = 2000;
  const rounds = 5;
  const parent = join(process.cwd(), "work");
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(join(parent, "execution-benchmark-"));
  const applicationId = randomUUID();
  const chatId = randomUUID();
  const values: ExecutionRecord[] = Array.from(
    { length: count },
    (_, index) => ({
      id: randomUUID(),
      applicationId,
      chatId,
      runId: chatId,
      tool: "server_bash",
      target: "synthetic-execution-benchmark",
      input: "echo synthetic fixture",
      mode: "bypass",
      status: "succeeded",
      output: `execution ${index}: ` + "fixture output\n".repeat(256),
      exitCode: 0,
      createdAt: new Date(index * 1000).toISOString(),
    }),
  );
  const readFile = fs.readFile.bind(fs);
  const parse = JSON.parse;
  let reads = 0;
  let parses = 0;
  let stats = 0;
  let scans = 0;
  const stat = fs.stat.bind(fs);
  const readdir = fs.readdir.bind(fs);
  const percentile = (values: number[], fraction: number) =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];
  const rounded = (value: number) => Number(value.toFixed(2));

  // The old listExecutions algorithm, without its unrelated application lookup.
  function synchronous() {
    scans++;
    return readdirSync(root)
      .filter((name) => /^[0-9a-f-]{36}\.json$/.test(name))
      .map((name) => {
        reads++;
        return JSON.parse(
          readFileSync(join(root, name), "utf8"),
        ) as ExecutionRecord;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async function measure(
    readers: number,
    mode: "read" | "response",
    stage: string,
    read: () => ExecutionRecord[] | Promise<ExecutionRecord[]>,
    samples: number,
  ) {
    const elapsed: number[] = [];
    const loop: number[] = [];
    reads = parses = stats = scans = 0;
    for (let sample = 0; sample < samples; sample++) {
      const histogram = monitorEventLoopDelay({ resolution: 1 });
      histogram.enable();
      await delay(5);
      const started = performance.now();
      await Promise.all(
        Array.from({ length: readers }, async () => {
          const records = await read();
          assert.equal(records.length, count);
          if (mode === "response") JSON.stringify({ executions: records });
        }),
      );
      elapsed.push(performance.now() - started);
      await delay(5);
      histogram.disable();
      loop.push(histogram.max / 1e6);
    }
    return {
      readers,
      mode,
      stage,
      samples,
      readsPerWave: reads / samples,
      parsesPerWave: parses / samples,
      statsPerWave: stats / samples,
      scansPerWave: scans / samples,
      waveMsP50: rounded(percentile(elapsed, 0.5)),
      waveMsP95: rounded(percentile(elapsed, 0.95)),
      maxLoopDelayMs: rounded(Math.max(...loop)),
    };
  }

  try {
    for (const value of values)
      await fs.writeFile(join(root, `${value.id}.json`), JSON.stringify(value));
    fs.readFile = (async (...args: Parameters<typeof fs.readFile>) => {
      reads++;
      return readFile(...args);
    }) as typeof fs.readFile;
    fs.stat = ((...args: Parameters<typeof fs.stat>) => {
      stats++;
      return stat(...args);
    }) as typeof fs.stat;
    fs.readdir = ((...args: Parameters<typeof fs.readdir>) => {
      scans++;
      return readdir(...args);
    }) as typeof fs.readdir;
    JSON.parse = (...args: Parameters<typeof JSON.parse>) => {
      parses++;
      return parse(...args);
    };
    const results = [];
    for (const mode of ["read", "response"] as const)
      for (const readers of [1, 5, 10]) {
        results.push(
          await measure(readers, mode, "synchronous", synchronous, rounds),
        );
        const reader = new ExecutionReader();
        const cold = await measure(
          readers,
          mode,
          "async-cold",
          () => reader.list(root),
          1,
        );
        assert.equal(cold.readsPerWave, count);
        assert.equal(cold.parsesPerWave, count);
        results.push(cold);
        const warm = await measure(
          readers,
          mode,
          "async-warm",
          () => reader.list(root),
          rounds,
        );
        assert.equal(warm.readsPerWave, 0);
        assert.equal(warm.parsesPerWave, 0);
        results.push(warm);
        values[0] = {
          ...values[0],
          status: "running",
          output: `updated: ${mode} ${readers}`,
        };
        const path = join(root, `${values[0].id}.json`);
        await fs.writeFile(`${path}.tmp`, JSON.stringify(values[0]));
        await fs.rename(`${path}.tmp`, path);
        const updated = await measure(
          readers,
          mode,
          "one-update",
          () => reader.list(root),
          1,
        );
        assert.equal(updated.readsPerWave, 1);
        assert.equal(updated.parsesPerWave, 1);
        results.push(updated);
      }
    process.stdout.write(
      JSON.stringify(
        {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          count,
          outputCharacters: values[1].output.length,
          rounds,
          scope:
            "Concurrent readers of one application's execution history; response includes execution JSON serialization only, not DB or Pi transcript work.",
          results,
        },
        null,
        2,
      ) + "\n",
    );
  } finally {
    fs.readFile = readFile;
    fs.stat = stat;
    fs.readdir = readdir;
    JSON.parse = parse;
    await fs.rm(root, { recursive: true, force: true });
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
