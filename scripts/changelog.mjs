// CHANGELOG.md is the one account of what changed in each release. An
// installed Hallvi shows the copy it shipped with under What's new, and the
// release workflow drafts a release's GitHub notes from the same section, so
// the two cannot tell different stories.

// `## 0.1.1-alpha.6 — 24 September 2026`. A heading without a date is still a
// release, so a section nobody dated cannot fold into the one above it.
const RELEASE = /^##\s+(\S+)(?:\s+[—–-]\s+(.+?))?\s*$/;

/** Each release the changelog describes, newest first, as it lists them. */
export function releases(markdown) {
  const found = [];
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const heading = RELEASE.exec(line);
    if (heading)
      found.push({ version: heading[1], date: heading[2] ?? null, lines: [] });
    else found.at(-1)?.lines.push(line);
  }
  return found.map(({ lines, ...release }) => ({
    ...release,
    notes: lines.join("\n").trim(),
  }));
}

/** A release's GitHub notes: its changelog section, then how to install it. */
export function releaseNotes(markdown, version, revision) {
  const release = releases(markdown).find((each) => each.version === version);
  if (!release?.notes)
    throw new Error(
      `CHANGELOG.md has no notes for ${version}. Write them in the pull request that raises the version.`,
    );
  return `${release.notes}

## Install or update

In an installed Hallvi, click **Check for updates**, then **Update**, or run \`hallvi update\`.

For a new installation, download \`install-hallvi.sh\` below and run it:

\`\`\`sh
sh ./install-hallvi.sh
\`\`\`

It finds this release, checks the archive against the signed manifest, and installs it. Signed packages are provided for **macOS on Apple silicon** and **Ubuntu 24.04 x64**. To install this exact build offline, download the archive for your machine and its \`.sha256\` and pass the archive as an argument.

Built from \`${revision}\`.
`;
}
