import { z } from "zod";

import { GithubAccessError, githubJson } from "./github-api";
import { deniedPathReason, redactSecrets } from "./secrets";

/**
 * Bounds on read-only repository inspection. Contents are pinned to one
 * commit; nothing is cloned, installed or executed, and nothing is written.
 */
export const INSPECTION_LIMITS = {
  /** Tree entries retained; larger trees are recorded as truncated. */
  treeEntries: 3_000,
  /** Bytes of one file kept in an Observation; the rest is cut and flagged. */
  fileBytes: 64 * 1024,
  /** Files larger than this are refused instead of fetched. */
  largestReadableBytes: 512 * 1024,
  /** Network reads one Run may make, and the bytes they may bring in. */
  readsPerRun: 24,
  bytesPerRun: 256 * 1024,
  /** Characters of one file returned to the model per read. */
  toolContentCharacters: 24_000,
  pathCharacters: 512,
} as const;

export class RepositoryPathError extends Error {}

/** A repository-relative path with no traversal, scheme or absolute prefix. */
export function normalizeRepositoryPath(input: string) {
  const path = input.trim().replace(/^\.\//, "").replace(/^\/+/, "");
  if (
    !path ||
    path.length > INSPECTION_LIMITS.pathCharacters ||
    path.includes("\\") ||
    path.includes("\0") ||
    path
      .split("/")
      .some((segment) => segment === "" || segment === "." || segment === "..")
  )
    throw new RepositoryPathError(
      "Give a repository-relative path such as app/main.py, without .. segments.",
    );
  return path;
}

const treeSchema = z.object({
  sha: z.string(),
  truncated: z.boolean().optional(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      size: z.number().int().nonnegative().optional(),
      sha: z.string().optional(),
    }),
  ),
});

export interface InspectedTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha?: string;
}

export interface RepositoryTree {
  entries: InspectedTreeEntry[];
  truncated: boolean;
}

/** The recursive tree at an exact commit, bounded and read-only. */
export async function fetchRepositoryTree(
  fullName: string,
  commitSha: string,
  token: string,
  signal?: AbortSignal,
  entryLimit: number = INSPECTION_LIMITS.treeEntries,
): Promise<RepositoryTree> {
  const { data } = await githubJson(
    `/repos/${fullName}/git/trees/${commitSha}?recursive=1`,
    token,
    { signal },
  );
  const parsed = treeSchema.safeParse(data);
  if (!parsed.success)
    throw new GithubAccessError("GitHub returned an unreadable tree.");
  const entries = parsed.data.tree
    .filter((entry) => entry.type === "blob" || entry.type === "tree")
    .map((entry) => ({
      path: entry.path,
      type: entry.type as "blob" | "tree",
      ...(entry.sha ? { sha: entry.sha } : {}),
      ...(entry.type === "blob" && entry.size !== undefined
        ? { size: entry.size }
        : {}),
    }));
  return {
    entries: entries.slice(0, entryLimit),
    truncated: Boolean(parsed.data.truncated) || entries.length > entryLimit,
  };
}

const contentsSchema = z.object({
  type: z.string(),
  encoding: z.string().optional(),
  content: z.string().optional(),
  sha: z.string(),
  size: z.number().int().nonnegative(),
  path: z.string(),
});

export interface RepositoryFileRead {
  path: string;
  blobSha: string;
  size: number;
  /** Decoded, bounded and redacted text; empty for binary files. */
  content: string;
  truncated: boolean;
  binary: boolean;
  redactedCount: number;
}

function isBinary(bytes: Buffer) {
  if (bytes.subarray(0, 8_000).includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return false;
  } catch {
    return true;
  }
}

/**
 * One file at an exact commit through the contents API. Denied paths never
 * reach the network; credential-shaped content is redacted before it is
 * stored or shown. A provider failure throws: it is a failed read, never
 * proof that the file is absent.
 */
export async function fetchRepositoryFile(
  fullName: string,
  commitSha: string,
  path: string,
  token: string,
  options: { signal?: AbortSignal; size?: number } = {},
): Promise<RepositoryFileRead> {
  const denied = deniedPathReason(path);
  if (denied) throw new RepositoryPathError(`${path} is not read: ${denied}.`);
  if (
    options.size !== undefined &&
    options.size > INSPECTION_LIMITS.largestReadableBytes
  )
    throw new RepositoryPathError(
      `${path} is ${options.size} bytes; files over ${INSPECTION_LIMITS.largestReadableBytes} bytes are not read.`,
    );
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const { data } = await githubJson(
    `/repos/${fullName}/contents/${encoded}?ref=${commitSha}`,
    token,
    { signal: options.signal },
  );
  return decodeRepositoryFile(data, path);
}

/** One file from a contents-API response: bounded, redacted text or binary. */
export function decodeRepositoryFile(
  data: unknown,
  path: string,
): RepositoryFileRead {
  if (Array.isArray(data))
    throw new RepositoryPathError(`${path} is a directory, not a file.`);
  const parsed = contentsSchema.safeParse(data);
  if (!parsed.success)
    throw new GithubAccessError("GitHub returned an unreadable file.");
  const file = parsed.data;
  if (file.type !== "file")
    throw new RepositoryPathError(
      `${path} is a ${file.type}, not a readable file.`,
    );
  if (file.size > INSPECTION_LIMITS.largestReadableBytes)
    throw new RepositoryPathError(
      `${path} is ${file.size} bytes; files over ${INSPECTION_LIMITS.largestReadableBytes} bytes are not read.`,
    );
  if (file.encoding !== "base64" || file.content === undefined)
    throw new GithubAccessError(
      `GitHub did not return ${path} inline; it cannot be read here.`,
    );
  const bytes = Buffer.from(file.content.replace(/\s/g, ""), "base64");
  if (isBinary(bytes))
    return {
      path,
      blobSha: file.sha,
      size: file.size,
      content: "",
      truncated: false,
      binary: true,
      redactedCount: 0,
    };
  const truncated = bytes.length > INSPECTION_LIMITS.fileBytes;
  const text = bytes.subarray(0, INSPECTION_LIMITS.fileBytes).toString("utf8");
  const redacted = redactSecrets(text);
  return {
    path,
    blobSha: file.sha,
    size: file.size,
    content: redacted.text,
    truncated,
    binary: false,
    redactedCount: redacted.count,
  };
}
