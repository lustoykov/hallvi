// Summarize a rig deployment's recorded releases and attempts, diffing
// consecutive releases: revision, pinned images, selected files (by SHA-256),
// data records, criterion and inputs. Read-only.
// Usage: node tests/rig/tools/releases.mjs <rig root>
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const [rig] = process.argv.slice(2);
if (!rig) throw new Error("Usage: node releases.mjs <rig root>");
const rows = JSON.parse(
  execFileSync(
    "sqlite3",
    [
      "-readonly",
      "-json",
      join(rig, "state/haldur.db"),
      "select body from deployments",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ) || "[]",
);
for (const row of rows) {
  const record = JSON.parse(row.body);
  const lifecycle = record.lifecycle;
  if (!lifecycle) continue;
  const view = (release) => {
    const n = release.native;
    return {
      id: release.id.slice(0, 12),
      revision: release.revision.slice(0, 12),
      images: Object.fromEntries(
        Object.entries(n.resolved.services).map(([name, s]) => [name, s.image]),
      ),
      files: Object.fromEntries(
        n.files.map((f) => [f.path, f.sha256.slice(0, 12)]),
      ),
      data: n.data,
      criterion: n.criterion,
      inputs: n.inputs,
      httpAccess: n.httpAccess,
      summary: n.summary,
    };
  };
  const releases = lifecycle.releases.map(view);
  console.log(`### deployment ${record.id}`);
  releases.forEach((release, index) => {
    console.log(
      `--- release ${index + 1}: ${release.id} @ ${release.revision}`,
    );
    if (index === 0) return console.log(JSON.stringify(release, null, 1));
    const previous = releases[index - 1];
    for (const key of Object.keys(release))
      if (JSON.stringify(release[key]) !== JSON.stringify(previous[key]))
        console.log(
          `${key}:`,
          JSON.stringify(previous[key]),
          "=>",
          JSON.stringify(release[key]),
        );
  });
  console.log("--- attempts");
  for (const a of lifecycle.attempts)
    console.log(
      a.startedAt.slice(11, 19),
      a.kind,
      a.outcome,
      `release=${a.releaseId.slice(0, 12)}`,
      a.remoteResult
        ? `remote=${a.remoteResult.phase}:${a.remoteResult.exitCode}`
        : "",
      a.error ? `error=${a.error.replace(/\s+/g, " ").slice(0, 400)}` : "",
    );
  console.log(
    "--- runtime",
    JSON.stringify(lifecycle.runtime.state),
    JSON.stringify(lifecycle.runtime.lastVerified?.images),
  );
}
