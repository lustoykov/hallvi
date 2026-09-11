// Print a rig's Pi workspace journals compactly: native tool calls, errors,
// command results and the session events recorded beside them. Read-only.
// Usage: node tests/rig/tools/journal.mjs <rig root> [workspace|all] [since]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const [rig, which = "all", since = ""] = process.argv.slice(2);
if (!rig)
  throw new Error(
    "Usage: node journal.mjs <rig root> [workspace-id|all] [since]",
  );
const root = join(rig, "state/pi-workspaces");
const width = Number(process.env.WIDTH ?? 300);
const ids =
  which === "all"
    ? readdirSync(root).sort(
        (a, b) =>
          statSync(join(root, a)).mtimeMs - statSync(join(root, b)).mtimeMs,
      )
    : [which];
for (const id of ids) {
  const events = readFileSync(join(root, id, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((event) => event.at >= since);
  if (!events.length) continue;
  console.log(`=== workspace ${id} run ${events[0].runId}`);
  for (const e of events) {
    const at = e.at.slice(11, 19);
    if (e.type === "source") console.log(at, "source", e.description);
    else if (e.type === "tool-start")
      console.log(at, e.name, JSON.stringify(e.args).slice(0, width));
    else if (e.type === "tool-error")
      console.log(
        at,
        "ERROR",
        String(e.error).replace(/\s+/g, " ").slice(0, width),
      );
    else if (e.type === "tool-end" && e.name === "bash")
      console.log(
        at,
        "  ->",
        JSON.stringify(e.result?.content?.[0]?.text ?? "").slice(0, width),
      );
    else if (e.type !== "tool-end")
      console.log(at, e.type, JSON.stringify(e).slice(0, width));
  }
}
