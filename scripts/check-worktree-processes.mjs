// Check whether a worktree still owns running processes before its session is
// archived. Run this from another checkout so this command is not itself inside
// the worktree being checked.
import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, sep } from "node:path";

const input = process.argv[2];
if (!input || !isAbsolute(input)) {
  console.error(
    "Usage: node scripts/check-worktree-processes.mjs /absolute/worktree/path",
  );
  process.exit(2);
}

let target;
try {
  target = realpathSync(input);
  if (!statSync(target).isDirectory()) throw new Error("not a directory");
} catch (error) {
  console.error(`Cannot inspect ${input}: ${error.message}`);
  process.exit(2);
}

let output;
try {
  output = execFileSync("lsof", ["-nP", "-d", "cwd", "-F", "pcn"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
} catch (error) {
  console.error(
    `Could not inspect process working directories: ${error.message}`,
  );
  process.exit(2);
}

const matches = new Map();
let current;
for (const line of output.split("\n")) {
  if (line.startsWith("p")) current = { pid: line.slice(1) };
  if (!current) continue;
  if (line.startsWith("c")) current.name = line.slice(1);
  if (line.startsWith("n")) {
    const cwd = line.slice(1);
    if (cwd === target || cwd.startsWith(target + sep)) {
      matches.set(current.pid, { ...current, reason: `cwd ${cwd}` });
    }
  }
}

// A process can start code or read a tunnel configuration from the worktree
// after changing its cwd. Inspect arguments too, without printing them: they
// may contain private inputs. Exclude this check and its caller's ancestors.
let processes;
try {
  processes = execFileSync("ps", ["-axww", "-o", "pid=,ppid=,command="], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
} catch (error) {
  console.error(`Could not inspect process commands: ${error.message}`);
  process.exit(2);
}

const rows = processes.split("\n").flatMap((line) => {
  const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
  return match ? [{ pid: match[1], parent: match[2], command: match[3] }] : [];
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
for (const { pid, command } of rows) {
  if (caller.has(pid) || !command.includes(target)) continue;
  const existing = matches.get(pid);
  matches.set(pid, {
    pid,
    name: existing?.name ?? "unknown",
    reason: existing
      ? `${existing.reason}; path in command`
      : "path in command",
  });
}

if (matches.size) {
  console.error(`${matches.size} process(es) still use ${target}:`);
  for (const { pid, name, reason } of matches.values()) {
    console.error(`  PID ${pid} (${name}), ${reason}`);
  }
  console.error(
    "Stop only verified task-owned previews; hand off other processes before archiving.",
  );
  process.exit(1);
}

console.log(
  `No process has a working directory or command path inside ${target}.`,
);
