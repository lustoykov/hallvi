// What the "Hallvi checks" workflow runs, run on this checkout. The workflow is
// disabled, so a pull request states these results instead: every step runs,
// and the summary at the end names the revision, whether the tree had
// uncommitted changes, the Node version and how each step went, ready to paste.
//
// It changes nothing it does not own: the build writes .next and dist, and the
// browser smoke suite starts its own disposable fixtures (HALLVI_E2E_PORT moves
// them off 3180 when another checkout is using it).
import { execFileSync, spawnSync } from "node:child_process";

const STEPS = [
  ["application tests", "npm test"],
  ["lint and formatting", "npm run lint"],
  ["types", "npx tsc --noEmit"],
  ["production build", "npm run build"],
  ["browser smoke", "npm run test:e2e:smoke"],
];

if (process.versions.node.split(".")[0] !== "22") {
  console.error(
    `Run the checks with Node.js 22, as the workflow does; this is ${process.version}.`,
  );
  process.exit(1);
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const revision = git("rev-parse", "--short=8", "HEAD");
// Read before anything runs: the build rewrites the tracked next-env.d.ts.
const dirty = git("status", "--porcelain") !== "";

const results = STEPS.map(([name, command]) => {
  console.log(`\n▶ ${name}: ${command}`);
  const began = Date.now();
  const run = spawnSync(command, { shell: true, stdio: "inherit" });
  return {
    name,
    command,
    passed: run.status === 0,
    seconds: Math.round((Date.now() - began) / 1000),
  };
});

console.log(
  `\nHallvi checks at ${revision}${dirty ? " with uncommitted changes" : ""} · Node ${process.version} · ${process.platform} ${process.arch}`,
);
for (const { name, command, passed, seconds } of results)
  console.log(
    `  ${passed ? "passed" : "FAILED"}  ${name.padEnd(20)} ${command.padEnd(26)} ${seconds} s`,
  );
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
