// Synthetic GitHub tree and contents responses for the fixture repositories,
// served by the disposable browser app. Imports only the sibling fixture
// module so it can be copied verbatim.
import {
  fixtureForRepositoryName,
  fixtureTree,
  repositoryFixtures,
  type FixtureFile,
} from "./repositories";

function hex40(seed: string) {
  let hash = 0x811c9dc5;
  let output = "";
  for (let round = 0; round < 5; round++) {
    for (const character of `${seed}#${round}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    output += hash.toString(16).padStart(8, "0");
  }
  return output;
}

/** A stable, clearly synthetic commit for a repository name and revision. */
export function fixtureCommitSha(fullName: string, revision = "1") {
  return hex40(`${fullName.toLowerCase()}@${revision}`);
}

export function fixtureFiles(fullName: string): FixtureFile[] {
  const name = fullName.split("/").at(-1) ?? fullName;
  return repositoryFixtures[fixtureForRepositoryName(name)];
}

/** The `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` body. */
export function treeResponse(fullName: string, sha: string) {
  return {
    sha,
    url: `https://api.github.com/repos/${fullName}/git/trees/${sha}`,
    truncated: false,
    tree: fixtureTree(fixtureFiles(fullName)).map((entry) => ({
      path: entry.path,
      mode: entry.type === "tree" ? "040000" : "100644",
      type: entry.type,
      sha: entry.sha,
      ...(entry.size !== undefined ? { size: entry.size } : {}),
    })),
  };
}

/**
 * The `GET /repos/{o}/{r}/contents/{path}?ref={sha}` body, an array for a
 * directory, or null when the path is absent (GitHub answers 404).
 */
export function contentsResponse(fullName: string, path: string, sha: string) {
  const files = fixtureFiles(fullName);
  const file = files.find((candidate) => candidate.path === path);
  if (file) {
    const entry = fixtureTree(files).find((item) => item.path === path)!;
    return {
      type: "file",
      encoding: "base64",
      size: Buffer.byteLength(file.content),
      name: path.split("/").at(-1),
      path,
      sha: entry.sha,
      content: Buffer.from(file.content).toString("base64"),
      url: `https://api.github.com/repos/${fullName}/contents/${path}?ref=${sha}`,
    };
  }
  if (files.some((candidate) => candidate.path.startsWith(`${path}/`)))
    return files
      .filter((candidate) => candidate.path.startsWith(`${path}/`))
      .map((candidate) => ({ type: "file", path: candidate.path }));
  return null;
}
