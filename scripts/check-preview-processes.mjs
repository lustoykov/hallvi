// Report local previews still running from this task's checkout. This command
// does not stop processes or print their arguments, which may contain secrets.
import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, sep } from "node:path";

const input = process.argv[2] ?? process.cwd();
if (!isAbsolute(input)) {
  console.error(
    "Usage: node scripts/check-preview-processes.mjs [absolute/worktree/path]",
  );
  process.exit(2);
}

let checkout;
try {
  checkout = realpathSync(input);
  if (!statSync(checkout).isDirectory()) throw new Error("not a directory");
} catch (error) {
  console.error(`Cannot inspect ${input}: ${error.message}`);
  process.exit(2);
}

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    console.error(
      `Could not inspect local processes with ${command}: ${error.message}`,
    );
    process.exit(2);
  }
}

const workingDirectories = new Map();
let current;
for (const line of run("lsof", ["-nP", "-d", "cwd", "-F", "pcn"]).split("\n")) {
  if (line.startsWith("p")) current = { pid: line.slice(1) };
  if (!current) continue;
  if (line.startsWith("c")) current.name = line.slice(1);
  if (line.startsWith("n"))
    workingDirectories.set(current.pid, { ...current, cwd: line.slice(1) });
}

const rows = run("ps", ["-axww", "-o", "pid=,ppid=,command="])
  .split("\n")
  .flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    return match
      ? [{ pid: match[1], parent: match[2], command: match[3] }]
      : [];
  });
const parents = new Map(rows.map(({ pid, parent }) => [pid, parent]));
const caller = new Set();
for (
  let pid = String(process.pid);
  pid && !caller.has(pid);
  pid = parents.get(pid)
) {
  caller.add(pid);
}

const isPreview = (command) =>
  /\bnext-server \(v/.test(command) ||
  /\bnpm exec next (?:dev|start)(?:\s|$)/.test(command) ||
  /\bnpm run dev(?:\s|$)/.test(command) ||
  /\bnode_modules\/next\/dist\/bin\/next (?:dev|start)(?:\s|$)/.test(command) ||
  /\bscripts\/dev\.mjs(?:\s|$)/.test(command) ||
  /\bhx-serve\.mjs(?:\s|$)/.test(command);

const previews = [];
for (const { pid, command } of rows) {
  if (caller.has(pid) || !isPreview(command)) continue;
  const found = workingDirectories.get(pid);
  const cwd = found?.cwd;
  const inCheckout = cwd === checkout || cwd?.startsWith(checkout + sep);
  if (!inCheckout && !command.includes(checkout)) continue;
  previews.push({
    pid,
    name: found?.name ?? basename(command.split(" ")[0]),
    reason: inCheckout ? `cwd ${cwd}` : "checkout path in command",
  });
}

if (previews.length) {
  console.error(
    `${previews.length} potential local preview process(es) still use ${checkout}:`,
  );
  for (const { pid, name, reason } of previews) {
    console.error(`  PID ${pid} (${name}), ${reason}`);
  }
  console.error(
    "Stop verified task-owned previews with SIGTERM; retain services and tunnels.",
  );
  process.exit(1);
}

console.log(`No local preview process found for ${checkout}.`);
