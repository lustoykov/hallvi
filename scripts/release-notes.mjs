// Prints a release's GitHub notes from CHANGELOG.md, and fails when the
// changelog has none for that version, so a release cannot go out unexplained.
//
//   node scripts/release-notes.mjs <version> <revision>
import { readFileSync } from "node:fs";

import { releaseNotes } from "./changelog.mjs";

const [version, revision] = process.argv.slice(2);
if (!version || !revision) {
  console.error("Usage: node scripts/release-notes.mjs <version> <revision>");
  process.exit(2);
}
try {
  process.stdout.write(
    releaseNotes(readFileSync("CHANGELOG.md", "utf8"), version, revision),
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
