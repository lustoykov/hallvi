// Instrument only a disposable QA copy. No diagnostic route or counters ship
// in Hallvi. Exact anchors make a moved implementation fail setup visibly.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function instrumentNotifications(app) {
  const modulePath = join(app, "src/server/qa-notification-metrics.ts");
  writeFileSync(
    modulePath,
    `
declare global {
  var __hallviQaReads: { snapshots: number; scans: number; parses: number } | undefined;
}
export const reads = globalThis.__hallviQaReads ??= { snapshots: 0, scans: 0, parses: 0 };
`,
  );
  const responseMetrics = join(app, "src/server/qa-chat-response-metrics.ts");
  writeFileSync(
    responseMetrics,
    `
import { monitorEventLoopDelay } from "node:perf_hooks";
declare global { var __hallviQaResponses: { frames: { incremental: boolean; full: boolean; bytes: number; diffMs: number; stringifyMs: number }[]; loop: ReturnType<typeof monitorEventLoopDelay> } | undefined; }
const created = !globalThis.__hallviQaResponses;
export const responses = globalThis.__hallviQaResponses ??= { frames: [], loop: monitorEventLoopDelay({ resolution: 1 }) };
if (created) responses.loop.enable();
export function serialize(frame: object, incremental: boolean, diffMs = 0) {
  const at = performance.now();
  const text = JSON.stringify(frame);
  const stringifyMs = performance.now() - at;
  responses.frames.push({ incremental, full: !("type" in frame), bytes: Buffer.byteLength(text), diffMs, stringifyMs });
  if (responses.frames.length > 500) responses.frames.shift();
  return text;
}
`,
  );
  const streamPath = join(
    app,
    "src/app/api/applications/[applicationId]/chats/[chatId]/events/route.ts",
  );
  let stream = readFileSync(streamPath, "utf8");
  for (const [anchor, replacement] of [
    [
      "const frame = frames.next(snapshot);",
      "const atDiff = performance.now();\n        const frame = frames.next(snapshot);\n        const diffMs = performance.now() - atDiff;",
    ],
    [
      "return frame ? JSON.stringify(frame) : undefined;",
      "return frame ? serialize(frame, true, diffMs) : undefined;",
    ],
    [
      "const text = JSON.stringify(snapshot);",
      "const text = serialize(snapshot, false);",
    ],
  ]) {
    if (stream.split(anchor).length !== 2)
      throw new Error(`QA response anchor changed: ${anchor}`);
    stream = stream.replace(anchor, replacement);
  }
  writeFileSync(
    streamPath,
    'import { serialize } from "@/server/qa-chat-response-metrics";\n' + stream,
  );
  for (const [file, anchor, counter] of [
    ["pi-conversation.ts", "): Promise<ChatSnapshot> {", "snapshots"],
    ["execution-reader.ts", "private async scan(directory: string) {", "scans"],
    ["execution-reader.ts", "const record = JSON.parse(text)", "parses"],
  ]) {
    const path = join(app, "src/server", file);
    const source = readFileSync(path, "utf8");
    if (source.split(anchor).length !== 2)
      throw new Error(`QA counter anchor changed: ${file}: ${anchor}`);
    const imported = source.includes('from "./qa-notification-metrics"')
      ? source
      : 'import { reads } from "./qa-notification-metrics";\n' + source;
    writeFileSync(
      path,
      imported.replace(
        anchor,
        counter === "parses"
          ? `reads.parses++;\n    ${anchor}`
          : `${anchor}\n  reads.${counter}++;`,
      ),
    );
  }
  const route = join(app, "src/app/api/qa-notification-metrics/route.ts");
  mkdirSync(dirname(route), { recursive: true });
  writeFileSync(
    route,
    `import { reads } from "@/server/qa-notification-metrics";
import { responses } from "@/server/qa-chat-response-metrics";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (!query.has("responses")) return Response.json(reads);
  const result = { ...reads, frames: [...responses.frames], maxLoopDelayMs: responses.loop.max / 1e6 };
  if (query.has("reset")) { responses.frames.length = 0; responses.loop.reset(); }
  return Response.json(result);
}
`,
  );
}
