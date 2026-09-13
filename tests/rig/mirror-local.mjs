// Mirror a repository the rig can reach on disk instead of over the GitHub
// API, in exactly the layout mirror.mjs produces.
//
// mirror.mjs fetches unauthenticated, which is right for public upstreams and
// impossible for a private one. Reading the local object store needs no
// token, no network and no credential in the rig at all, and it is exact:
// the blob hashes are git's own, not a copy verified against them.
//
// Usage: node tests/rig/mirror-local.mjs <owner/name> <repo path> <ref>
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const [repository, repoPath, ref] = process.argv.slice(2);
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !repoPath || !ref)
  throw new Error(
    "Usage: node tests/rig/mirror-local.mjs <owner/name> <repo path> <ref>",
  );

const git = (...args) =>
  execFileSync("git", ["-C", resolve(repoPath), ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
const gitBytes = (...args) =>
  execFileSync("git", ["-C", resolve(repoPath), ...args], {
    maxBuffer: 256 * 1024 * 1024,
  });

const commit = git("rev-parse", `${ref}^{commit}`).trim();
const date = git("show", "-s", "--format=%cI", commit).trim();
const message = git("show", "-s", "--format=%s", commit).trim();
const root = join(here, "../results/rig/upstream", repository.toLowerCase());
const directory = join(root, commit);

// `git ls-tree -r -z` gives mode, type, sha and path for every blob.
const entries = git("ls-tree", "-r", "-z", commit)
  .split("\0")
  .filter(Boolean)
  .map((line) => {
    const [meta, path] = line.split("\t");
    const [mode, type, sha] = meta.split(/\s+/);
    return { mode, type, sha, path };
  })
  .filter((entry) => entry.type === "blob");

const files = [];
for (const entry of entries) {
  const bytes = gitBytes("cat-file", "blob", entry.sha);
  const target = join(directory, "tree", entry.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  files.push({
    path: entry.path,
    mode: entry.mode,
    sha: entry.sha,
    size: bytes.length,
  });
}

// The same shape the API mirror writes, so the stand-in cannot tell them
// apart.
writeFileSync(
  join(directory, "tree.json"),
  JSON.stringify({
    sha: git("rev-parse", `${commit}^{tree}`).trim(),
    truncated: false,
    tree: files.map((file) => ({
      path: file.path,
      mode: file.mode,
      type: "blob",
      sha: file.sha,
      size: file.size,
    })),
  }),
);
writeFileSync(
  join(directory, "files.json"),
  JSON.stringify({ date, message, files }, null, 2),
);
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "mirror.json"),
  JSON.stringify(
    {
      repository: {
        id: 1,
        full_name: repository,
        default_branch: "main",
      },
      tags: { [ref]: commit },
    },
    null,
    2,
  ),
);
writeFileSync(join(root, "head.json"), JSON.stringify({ head: commit }));
console.log(`${repository} ${ref} -> ${commit}, ${files.length} files`);
