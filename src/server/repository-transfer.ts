import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

import { loadApplication, recordedRepositoryId } from "./applications";
import { githubArchive, githubJson } from "./github-api";
import {
  repositoryCredential,
  currentGithubConnectionId,
} from "./github-connection";
import { ARCHIVE_LIMITS, treeArchive } from "./execution-tree";
import { readTar } from "./tar";
import { managedSshOptions } from "./managed-ssh";
import { operatorSettings } from "./operator-execution";

/** A fresh source directory, never an overwrite of the running application. */
export async function copyRepositoryToServer(
  applicationId: string,
  ref?: string,
  signal?: AbortSignal,
) {
  z.uuid().parse(applicationId);
  const application = loadApplication(applicationId);
  const host = operatorSettings(applicationId).host;
  if (!host)
    throw new Error("Connect the application's server before copying source.");
  const repository = `${application.repositoryOwner}/${application.repositoryName}`;
  const { token, connection } = await repositoryCredential();
  const metadata = (await githubJson(`/repos/${repository}`, token, { signal }))
    .data as {
    id: number;
    full_name: string;
    default_branch: string;
  };
  const knownId = recordedRepositoryId(applicationId);
  if (
    metadata.full_name?.toLowerCase() !== repository.toLowerCase() ||
    (knownId !== undefined && metadata.id !== knownId)
  )
    throw new Error(
      "The repository identity changed. Check GitHub access before deploying.",
    );
  const revision = z
    .string()
    .min(1)
    .max(255)
    .parse(ref ?? metadata.default_branch);
  const commit = (
    await githubJson(
      `/repos/${repository}/commits/${encodeURIComponent(revision)}`,
      token,
      { signal },
    )
  ).data as { sha: string };
  const sha = z
    .string()
    .regex(/^[0-9a-f]{40}$/)
    .parse(commit.sha);
  const gzip = await githubArchive(repository, sha, token, {
    signal,
    maxBytes: ARCHIVE_LIMITS.gzipBytes,
  });
  // Unlike the model's inspection workspace, deployment gets the complete,
  // unredacted tree. Validate every path/link before any bytes reach the host;
  // unsupported or oversized source fails rather than silently losing files.
  const entries = readTar(
    gunzipSync(gzip, {
      maxOutputLength: ARCHIVE_LIMITS.inflatedBytes,
    }),
    { stripComponents: 1, maxBytes: ARCHIVE_LIMITS.inflatedBytes },
  );
  const files = entries.filter((entry) => entry.type === "file");
  if (!files.length)
    throw new Error("The repository archive contains no files to deploy.");
  const archive = treeArchive(files);
  const digest = createHash("sha256").update(archive).digest("hex");
  if (currentGithubConnectionId() !== (connection?.id ?? null))
    throw new Error(
      "The GitHub connection changed. Retry with the current connection.",
    );
  if (
    JSON.stringify(operatorSettings(applicationId).host) !==
    JSON.stringify(host)
  )
    throw new Error(
      "The application's server changed. Retry on the current server.",
    );
  signal?.throwIfAborted();

  // Only source bytes cross SSH. No GitHub token, signed download URL or Git
  // remote is ever sent to the host or returned to Pi. mktemp owns the exact
  // directory the failure trap may remove; it cannot touch an existing tree.
  const command = `set -eu
umask 077
stage=$(mktemp -d /tmp/hallvi-source-${applicationId}-XXXXXX)
trap 'rm -rf -- "$stage"' EXIT
cat > "$stage/source.tar"
printf '%s  %s\\n' '${digest}' "$stage/source.tar" | sha256sum -c - >/dev/null
mkdir "$stage/tree"
tar --extract --file="$stage/source.tar" --directory="$stage/tree" --no-same-owner --same-permissions
rm -- "$stage/source.tar"
trap - EXIT
printf '%s\\n' "$stage/tree"
`;
  const directory = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      "ssh",
      [
        ...managedSshOptions(host),
        "-T",
        "-o",
        "ConnectTimeout=10",
        "-o",
        "ServerAliveInterval=15",
        "-o",
        "ServerAliveCountMax=2",
        `${host.user}@${host.address}`,
        command,
      ],
      { signal, timeout: 120_000 },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-4096);
    });
    // A remote error can contain repository data. Return a bounded, owned
    // error instead; Pi can inspect the host without copying source into logs.
    child.stderr.resume();
    child.on("error", () =>
      reject(
        new Error(
          "Source transfer could not reach the server. Check its connection and retry.",
        ),
      ),
    );
    child.on("close", (code) => {
      if (code !== 0)
        return reject(
          new Error(
            "Source transfer did not complete. The remote outcome may be unknown; inspect before retrying. No deployment was started.",
          ),
        );
      const path = stdout.trim();
      if (
        !new RegExp(
          `^/tmp/hallvi-source-${applicationId}-[a-zA-Z0-9]+/tree$`,
        ).test(path)
      )
        return reject(
          new Error(
            "The server did not return a verified source directory. No deployment was started.",
          ),
        );
      resolve(path);
    });
    child.stdin.on("error", () => {});
    child.stdin.end(archive);
  });
  return {
    repository,
    ref: revision,
    commit: sha,
    directory,
    files: files.length,
    bytes: archive.length,
    sha256: digest,
    note: "Complete repository source copied and its transfer checksum verified. This is a temporary source directory, not a deployment or a Git checkout. Build/install it into the existing application, preserve its data and verify the result. Copy again with the tracked branch for a later deployment; no new GitHub token is needed.",
  };
}
