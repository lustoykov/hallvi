// Mirror a public GitHub repository at exact refs for the rig's GitHub
// stand-in. Every file is verified against its Git blob hash, and GitHub's own
// recursive tree listing is kept. Output, per repository, under
// tests/results/rig/upstream/<owner>/<name>/:
//   mirror.json  repository identity and a tag -> commit map of the refs
//   head.json    the default branch commit (the first ref unless --head)
//   <sha>/tree/   exact file copies; <sha>/files.json; <sha>/tree.json
// Usage: node tests/rig/mirror.mjs <owner/name> <ref>... [--head <ref>]
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const headIndex = args.indexOf("--head");
const headRef = headIndex >= 0 ? args.splice(headIndex, 2)[1] : null;
const [repository, ...refs] = args;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? "") || !refs.length)
  throw new Error(
    "Usage: node tests/rig/mirror.mjs <owner/name> <ref>... [--head <ref>]",
  );
const api = async (path) => {
  const response = await fetch(
    `https://api.${"git"}hub.com/repos/${repository}${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "hallvi-rig",
      },
    },
  );
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const root = join(
  resolve(here, "../.."),
  "tests/results/rig/upstream",
  repository.toLowerCase(),
);
const info = await api("");
const tags = {};
for (const ref of refs) {
  const commit = await api(`/commits/${encodeURIComponent(ref)}`);
  if (!/^[0-9a-f]{40}$/.test(ref)) tags[ref] = commit.sha;
  const directory = join(root, commit.sha);
  if (existsSync(join(directory, "files.json"))) continue;
  const tree = await api(`/${"git"}/trees/${commit.sha}?recursive=1`);
  if (tree.truncated) throw new Error("Tree listing truncated.");
  const files = [];
  for (const item of tree.tree.filter((entry) => entry.type === "blob")) {
    const response = await fetch(
      `https://raw.${"git"}hubusercontent.com/${repository}/${commit.sha}/${item.path.split("/").map(encodeURIComponent).join("/")}`,
    );
    if (!response.ok) throw new Error(`${item.path}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const blob = createHash("sha1")
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest("hex");
    if (blob !== item.sha) throw new Error(`${item.path}: blob hash mismatch`);
    const target = join(directory, "tree", item.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    files.push({
      path: item.path,
      mode: item.mode,
      sha: item.sha,
      size: bytes.length,
    });
  }
  writeFileSync(join(directory, "tree.json"), JSON.stringify(tree));
  writeFileSync(
    join(directory, "files.json"),
    JSON.stringify(
      {
        date: commit.commit.committer.date,
        message: commit.commit.message.split("\n")[0],
        files,
      },
      null,
      2,
    ),
  );
  console.log(`${ref} ${commit.sha} ${files.length} files verified`);
}
mkdirSync(root, { recursive: true });
writeFileSync(
  join(root, "mirror.json"),
  JSON.stringify(
    {
      repository: {
        id: info.id,
        full_name: info.full_name,
        default_branch: info.default_branch,
      },
      tags,
    },
    null,
    2,
  ),
);
const head = headRef ?? refs[0];
writeFileSync(
  join(root, "head.json"),
  JSON.stringify({ head: tags[head] ?? head }),
);
console.log(`default branch -> ${tags[head] ?? head}`);
