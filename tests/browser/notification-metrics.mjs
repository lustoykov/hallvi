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
export const dynamic = "force-dynamic";
export function GET() { return Response.json(reads); }
`,
  );
}
