// Node 22: node --import tsx scripts/benchmark-chat-responses.ts [baseline]
// Warm runtime harness. No DB, SSR, HTTP, model or credential access.
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { activityFromTranscript } from "../src/server/pi-activity";
import { ExecutionReader } from "../src/server/execution-reader";
import { longHistory } from "../tests/fixtures/long-history";
import type { ChatSnapshot } from "../src/server/types";
import { ChatFrames } from "../src/server/chat-frames";

const pause = () => new Promise((resolve) => setTimeout(resolve, 10));
const percentile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];
const rounded = (n: number) => Math.round(n * 100) / 100;
async function main() {
  await fs.mkdir(join(process.cwd(), "work"), { recursive: true });
  const root = await fs.mkdtemp(
    join(process.cwd(), "work/chat-response-benchmark-"),
  );
  let contentReads = 0;
  const originalRead = fs.readFile;
  fs.readFile = new Proxy(originalRead, {
    apply(target, receiver, args) {
      contentReads++;
      return Reflect.apply(target, receiver, args);
    },
  });
  try {
    for (const calls of [240, 2000]) {
      for (const mode of process.argv[2] === "baseline"
        ? ["baseline"]
        : ["baseline", "incremental"]) {
        const { transcript, executions } = longHistory("chat", "app", calls);
        const directory = join(root, `${calls}-${mode}`);
        await fs.mkdir(directory);
        for (const execution of executions)
          await fs.writeFile(
            join(directory, `${execution.id}.json`),
            JSON.stringify(execution),
          );
        const reader = new ExecutionReader();
        await reader.list(directory);
        const construct = (): ChatSnapshot => ({
          status: transcript.status,
          worker: { alive: true },
          messages: transcript.messages.map((message) => ({ ...message })),
          executions: executions.map((record) => ({ ...record })),
          information: [],
          piActivity: activityFromTranscript({
            applicationId: "app",
            transcript,
            executions,
          }),
        });
        const lastCall = transcript.calls[`call:${calls - 1}`];
        delete lastCall.result;
        lastCall.preview = executions.at(-1)!.output;
        executions.at(-1)!.status = "running";
        transcript.messages.at(-1)!.status = "running";
        transcript.status = "working";
        const before = construct();
        const bytes = Object.fromEntries(
          Object.entries(before).map(([key, value]) => [
            key,
            Buffer.byteLength(JSON.stringify(value)),
          ]),
        );
        for (let warm = 0; warm < 20; warm++) JSON.stringify(construct());
        for (const readers of [1, 5, 10]) {
          // Each wave starts from identical data, even as reader count changes.
          const baseBody = before.messages.at(-1)!.body;
          const baseOutput = before.executions.at(-1)!.output;
          transcript.messages.at(-1)!.body = baseBody;
          transcript.messages.at(-1)!.revision = 0;
          executions.at(-1)!.output = baseOutput;
          lastCall.preview = baseOutput;
          const encoders = Array.from(
            { length: readers },
            () => new ChatFrames(),
          );
          for (const encoder of encoders) encoder.next(construct());
          const timings: number[] = [],
            diffs: number[] = [],
            constructions: number[] = [],
            reads: number[] = [];
          const loop = monitorEventLoopDelay({ resolution: 1 });
          let payloadBytes = 0;
          const readsBefore = contentReads;
          loop.enable();
          for (let iteration = 0; iteration < 15; iteration++) {
            await pause();
            const atRead = performance.now();
            await Promise.all(
              Array.from({ length: readers }, () => reader.list(directory)),
            );
            reads.push(performance.now() - atRead);
            // Change a streaming answer and output; retain all history.
            const last = transcript.messages.at(-1)!;
            last.body += ` token-${iteration}`;
            last.revision++;
            executions.at(-1)!.output += `\nSTREAM-${iteration}`;
            lastCall.preview = executions.at(-1)!.output;
            const t = performance.now();
            const snapshots = Array.from({ length: readers }, construct);
            constructions.push(performance.now() - t);
            const atDiff = performance.now();
            const frames = snapshots.map((snapshot, index) =>
              mode === "baseline" ? snapshot : encoders[index].next(snapshot),
            );
            diffs.push(performance.now() - atDiff);
            const start = performance.now();
            const payloads = frames.map((frame) => JSON.stringify(frame));
            timings.push(performance.now() - start);
            payloadBytes = payloads.reduce(
              (n, payload) => n + Buffer.byteLength(payload),
              0,
            );
            await pause();
          }
          loop.disable();
          console.log(
            JSON.stringify({
              mode,
              calls,
              executions: executions.length,
              readers,
              bytes,
              payloadBytesPerWave: payloadBytes,
              fullSerializationsPerWave: mode === "baseline" ? readers : 0,
              serializationsPerWave: readers,
              warmContentReads: contentReads - readsBefore,
              serializationMs: {
                p50: rounded(percentile(timings, 0.5)),
                p95: rounded(percentile(timings, 0.95)),
              },
              diffMs: {
                p50: rounded(percentile(diffs, 0.5)),
                p95: rounded(percentile(diffs, 0.95)),
              },
              activityConstructionMs: {
                p50: rounded(percentile(constructions, 0.5)),
                p95: rounded(percentile(constructions, 0.95)),
              },
              cachedFileScanMs: rounded(percentile(reads, 0.5)),
              maxLoopDelayMs: rounded(loop.max / 1e6),
            }),
          );
        }
      }
    }
  } finally {
    fs.readFile = originalRead;
    await fs.rm(root, { recursive: true, force: true });
  }
}
void main();
