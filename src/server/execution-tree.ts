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

export class ExecutionTreeError extends Error {}

export const ARCHIVE_LIMITS = { gzipBytes: 48 * 1024 * 1024 } as const;

/** Fetches and validates the archive at an exact commit. */
export async function fetchBaseTree(
  fullName: string,
  sha: string,
  /** A login's token, or null for a public repository. */
  token: string | null,
  signal?: AbortSignal,
): Promise<TreeFile[]> {
  const gzip = await githubArchive(fullName, sha, token, {
    signal,
    maxBytes: ARCHIVE_LIMITS.gzipBytes,
  });
  return treeFromArchive(gzip);
}

export function treeFromArchive(gzip: Buffer): TreeFile[] {
  let tar: Buffer;
  try {
    tar = gunzipSync(gzip, { maxOutputLength: TAR_LIMITS.bytes * 2 });
  } catch {
    throw new ExecutionTreeError(
      "The repository archive could not be decompressed within the supported size.",
    );
  }
  try {
    return readTar(tar, { stripComponents: 1 })
      .filter((entry) => entry.type === "file")
      .map((entry) => ({
        path: entry.path,
        content: entry.content,
        mode: entry.mode,
      }));
  } catch (error) {
    throw new ExecutionTreeError(
      error instanceof TarValidationError
        ? `The repository archive cannot be used: ${error.message}`
        : "The repository archive could not be read.",
    );
  }
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
