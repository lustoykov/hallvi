// The exact source tree an execution runs: the repository archive at one
// commit, fetched by the controller, plus an optional overlay of staged
// changes. Nothing reconstructed from redacted or truncated Observations is
// ever executed; the archive is complete or the execution is a blocker.
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import { githubArchive } from "./github-api";
import { readTar, TAR_LIMITS, TarValidationError, writeTar } from "./tar";
import type { ProposedFileChange } from "./types";

export interface TreeFile {
  path: string;
  content: Buffer;
  mode: number;
}

export class ExecutionTreeError extends Error {}

export const ARCHIVE_LIMITS = {
  gzipBytes: 48 * 1024 * 1024,
  changedFileBytes: 512 * 1024,
  changedFiles: 60,
} as const;

/** Fetches and validates the archive at an exact commit. */
export async function fetchBaseTree(
  fullName: string,
  sha: string,
  token: string,
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
        ? `The repository archive is not executable by this runner: ${error.message}`
        : "The repository archive could not be read.",
    );
  }
}

/** Applies staged changes; deletes must name existing files. */
export function applyOverlay(
  base: TreeFile[],
  changes: ProposedFileChange[],
): TreeFile[] {
  const files = new Map(base.map((file) => [file.path, file]));
  for (const change of changes) {
    if (change.content === null) files.delete(change.path);
    else
      files.set(change.path, {
        path: change.path,
        content: Buffer.from(change.content, "utf8"),
        mode: files.get(change.path)?.mode ?? 0o644,
      });
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Content-addressed identity of an exact tree: paths, modes and contents. */
export function treeDigest(files: TreeFile[]) {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update("\0");
    hash.update((file.mode & 0o111 ? "x" : "-") + "\0");
    hash.update(createHash("sha256").update(file.content).digest());
  }
  return hash.digest("hex");
}

/** Identity of the staged changes alone, independent of the base. */
export function overlayDigest(changes: ProposedFileChange[]) {
  const hash = createHash("sha256");
  for (const change of [...changes].sort((a, b) =>
    a.path.localeCompare(b.path),
  )) {
    hash.update(change.path);
    hash.update("\0");
    hash.update(change.content === null ? "\0deleted" : change.content);
    hash.update("\0");
  }
  return hash.digest("hex");
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

/**
 * The start command the executed tree declares: an exec-form CMD (optionally
 * after an exec-form ENTRYPOINT) in its root Dockerfile. Shell-form commands
 * run through sh -c. Null when the tree has no Dockerfile CMD.
 */
export function dockerfileStartCommand(files: TreeFile[]): string[] | null {
  const dockerfile = files.find((file) => file.path === "Dockerfile");
  if (!dockerfile) return null;
  const lines = dockerfile.content
    .toString("utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const parse = (keyword: string) => {
    const line = [...lines]
      .reverse()
      .find((candidate) => new RegExp(`^${keyword}\\s+`, "i").test(candidate));
    if (!line) return null;
    const rest = line.replace(new RegExp(`^${keyword}\\s+`, "i"), "").trim();
    if (rest.startsWith("[")) {
      try {
        const parsed = JSON.parse(rest) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string")
        )
          return parsed as string[];
      } catch {
        return null;
      }
      return null;
    }
    return ["sh", "-c", rest];
  };
  const entrypoint = parse("ENTRYPOINT");
  const cmd = parse("CMD");
  if (!cmd && !entrypoint) return null;
  if (entrypoint && cmd && entrypoint[0] !== "sh")
    return [...entrypoint, ...cmd];
  return cmd ?? entrypoint;
}
