// Check the Git index so force-added artifacts fail before they reach a commit.
import { execFileSync } from "node:child_process";

const artifacts = execFileSync(
  "git",
  [
    "ls-files",
    "-z",
    "--",
    "docs/testing/",
    "tests/results/",
    "work/",
    ".impeccable/",
    ".review/",
    ".state-caps/",
  ],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

if (artifacts.length) {
  console.error(
    `Review artifacts must stay untracked. Remove these paths from Git with git rm --cached; keep needed local evidence in tests/results/ or work/:\n${artifacts.join("\n")}`,
  );
  process.exitCode = 1;
}
