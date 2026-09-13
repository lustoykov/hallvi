// The exact source tree Pi's workspace and releases read: the repository
// archive at one commit, fetched by the controller. Nothing reconstructed from
// redacted or truncated Observations is ever used; the archive is complete or
// the read fails.
import { gunzipSync } from "node:zlib";

import { githubArchive } from "./github-api";
import { readTar, TAR_LIMITS, TarValidationError, writeTar } from "./tar";

export interface TreeFile {
  path: string;
  content: Buffer;
  mode: number;
}

/** A file the snapshot had to leave out, and how big it was. */
export interface OmittedFile {
  path: string;
  bytes: number;
}

export interface RepositorySnapshot {
  files: TreeFile[];
  /** Largest first, so a reader sees what cost the most. */
  omitted: OmittedFile[];
}

export class ExecutionTreeError extends Error {}

export const ARCHIVE_LIMITS = {
  gzipBytes: 48 * 1024 * 1024,
  /** What may be decompressed at once, which bounds a compression bomb. */
  inflatedBytes: 128 * 1024 * 1024,
} as const;

/** Fetches and validates the archive at an exact commit. */
export async function fetchBaseTree(
  fullName: string,
  sha: string,
  /** A login's token, or null for a public repository. */
  token: string | null,
  signal?: AbortSignal,
): Promise<RepositorySnapshot> {
  const gzip = await githubArchive(fullName, sha, token, {
    signal,
    maxBytes: ARCHIVE_LIMITS.gzipBytes,
  });
  return treeFromArchive(gzip);
}

export function treeFromArchive(gzip: Buffer): RepositorySnapshot {
  let tar: Buffer;
  try {
    tar = gunzipSync(gzip, { maxOutputLength: ARCHIVE_LIMITS.inflatedBytes });
  } catch {
    throw new ExecutionTreeError(
      "The repository archive could not be decompressed within the supported size.",
    );
  }
  let entries;
  try {
    entries = readTar(tar, {
      stripComponents: 1,
      // Already bounded by the buffer above; the workspace budget is applied
      // below, where there is enough information to choose what to drop.
      maxBytes: ARCHIVE_LIMITS.inflatedBytes,
    });
  } catch (error) {
    throw new ExecutionTreeError(
      error instanceof TarValidationError
        ? `The repository archive cannot be used: ${error.message}`
        : "The repository archive could not be read.",
    );
  }
  const files = entries
    .filter((entry) => entry.type === "file")
    .map((entry) => ({
      path: entry.path,
      content: entry.content,
      mode: entry.mode,
    }));
  return fitToBudget(files, TAR_LIMITS.bytes);
}

/**
 * A repository too big to carry whole becomes a partial snapshot rather than
 * no snapshot at all.
 *
 * Real upstream software is not the size of a demo. Paperless-ngx is 92 MB
 * unpacked, and 71 MB of that is screenshots and scanned test samples — of
 * which the operator needs exactly none to work out how the thing is
 * deployed. Refusing the whole archive left it with nothing at all and the
 * words "the repository snapshot is unavailable", which is the worst of the
 * three possible answers.
 *
 * So the largest files go first, because size is the best available proxy for
 * "asset rather than source", and what went is written down: a reader who
 * finds a path missing can see it was dropped rather than absent upstream.
 * A repository that fits is untouched.
 */
export function fitToBudget(
  files: TreeFile[],
  budget: number,
): RepositorySnapshot {
  let total = files.reduce((sum, file) => sum + file.content.length, 0);
  if (total <= budget) return { files, omitted: [] };
  const bySize = [...files].sort(
    (a, b) =>
      b.content.length - a.content.length || a.path.localeCompare(b.path),
  );
  const dropped = new Set<TreeFile>();
  const omitted: OmittedFile[] = [];
  for (const file of bySize) {
    if (total <= budget) break;
    dropped.add(file);
    omitted.push({ path: file.path, bytes: file.content.length });
    total -= file.content.length;
  }
  return { files: files.filter((file) => !dropped.has(file)), omitted };
}

export function treeArchive(files: TreeFile[]) {
  return writeTar(
    files.map((file) => ({
      path: file.path,
      content: file.content,
      mode: file.mode & 0o111 ? 0o755 : 0o644,
    })),
  );
}
