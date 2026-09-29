// The line people paste to install Hallvi names no release. It once named
// 0.1.1-alpha.1 and went on handing out that release's installer for six
// releases, because every release was a GitHub prerelease and GitHub never
// makes a prerelease "latest", so there was no address that followed them.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (path: string) => readFileSync(join(root, path), "utf8");
const LATEST =
  "https://github.com/lustoykov/hallvi/releases/latest/download/install-hallvi.sh";

it("points every install line at the newest release, never a numbered one", () => {
  const documents = [
    ...readdirSync(root).filter((name) => name.endsWith(".md")),
    ...readdirSync(join(root, "docs"), { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".md"))
      .map((name) => join("docs", name)),
  ];
  const pinned = documents.filter((path) =>
    /releases\/download\/[^/\s]+\/install-hallvi\.sh/.test(read(path)),
  );
  expect(pinned).toEqual([]);
  expect(read("README.md")).toContain(LATEST);
});

it("never drafts a prerelease, which GitHub cannot make latest", () => {
  expect(read(".github/workflows/release.yml")).not.toMatch(/--prerelease\b/);
});
