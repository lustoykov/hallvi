// The line people paste to install Hallvi names no release. It once named
// 0.1.1-alpha.1 and went on handing out that release's installer for six
// releases, because every release was a GitHub prerelease and GitHub never
// makes a prerelease "latest", so there was no address that followed them.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const LATEST =
  "https://github.com/lustoykov/hallvi/releases/latest/download/install-hallvi.sh";

it("points the current installation instructions at the newest release", () => {
  for (const path of ["README.md", "docs/installation.md"]) {
    const document = read(path);
    expect(document, path).toContain(LATEST);
    expect(document, path).not.toMatch(
      /releases\/download\/[^/\s]+\/install-hallvi\.sh/,
    );
  }
});

it("never drafts a prerelease, which GitHub cannot make latest", () => {
  expect(read(".github/workflows/release.yml")).not.toMatch(/--prerelease\b/);
});
