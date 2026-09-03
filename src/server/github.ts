import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RepositoryIdentity {
  owner: string;
  name: string;
  canonicalUrl: string;
}

export interface GithubInspection {
  status: "passed" | "failed" | "unavailable";
  summary: string;
  sourceUrl: string;
  raw: {
    repository: string;
    visibility?: string;
    defaultBranch?: string;
    commitSha?: string;
    commitUrl?: string;
    authenticatedAs?: string;
    permissions?: Record<string, boolean>;
    error?: string;
  };
}

export function parseGithubRepository(value: string): RepositoryIdentity {
  const input = value.trim();
  const normalized = input.replace(/^git@github\.com:/i, "https://github.com/");

  let url: URL;
  try {
    url = new URL(normalized.includes("://") ? normalized : `https://${normalized}`);
  } catch {
    throw new Error("Enter a GitHub repository URL such as https://github.com/owner/repository.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Enter a GitHub HTTPS or SSH repository URL.");
  }
  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Phase 1 currently accepts GitHub repositories only.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Enter a GitHub repository with only an owner and repository name.");
  }

  const [owner, repositoryName] = parts;
  const name = repositoryName.replace(/\.git$/i, "");

  if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error("Enter a GitHub repository URL with both an owner and repository name.");
  }

  const canonicalOwner = owner.toLowerCase();
  const canonicalName = name.toLowerCase();
  return {
    owner: canonicalOwner,
    name: canonicalName,
    canonicalUrl: `https://github.com/${canonicalOwner}/${canonicalName}`,
  };
}

export function classifyGithubFailure(error: unknown): {
  status: "failed" | "unavailable";
  reason: string;
} {
  const details = error as {
    code?: unknown;
    killed?: unknown;
    signal?: unknown;
    stderr?: unknown;
    message?: unknown;
  };
  if (details?.killed === true || typeof details?.signal === "string") {
    return { status: "unavailable", reason: "gh did not respond in time." };
  }
  const stderr = typeof details?.stderr === "string" ? details.stderr.trim() : "";
  const message = typeof details?.message === "string" ? details.message.trim() : "";
  const reason = stderr || message || "GitHub inspection failed.";
  const unavailable =
    details?.code === "ENOENT" ||
    /not logged|auth|rate limit|timed? ?out|network|connect|spawn|not found.*command/i.test(reason);
  return { status: unavailable ? "unavailable" : "failed", reason };
}

async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync("gh", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 2_000_000,
    timeout: 20_000,
  });
  return JSON.parse(stdout) as T;
}

export async function inspectGithubRepository(
  repository: RepositoryIdentity,
): Promise<GithubInspection> {
  const sourceUrl = repository.canonicalUrl;

  try {
    const repo = await ghJson<{
      full_name: string;
      html_url: string;
      visibility: string;
      default_branch: string;
      permissions?: Record<string, boolean>;
    }>(["api", `repos/${repository.owner}/${repository.name}`]);

    const commit = await ghJson<{ sha: string; html_url: string }>([
      "api",
      `repos/${repository.owner}/${repository.name}/commits/${repo.default_branch}`,
    ]);
    const user = await ghJson<{ login: string }>(["api", "user"]).catch(() => null);

    return {
      status: "passed",
      summary: `${repo.full_name} is readable at ${repo.default_branch} · ${commit.sha.slice(0, 8)}.`,
      sourceUrl: commit.html_url,
      raw: {
        repository: repo.full_name,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        commitSha: commit.sha,
        commitUrl: commit.html_url,
        authenticatedAs: user?.login,
        permissions: repo.permissions,
      },
    };
  } catch (error) {
    const failure = classifyGithubFailure(error);
    return {
      status: failure.status,
      summary:
        failure.status === "unavailable"
          ? `GitHub inspection is unavailable: ${failure.reason}`
          : `${repository.owner}/${repository.name} is not readable with the current GitHub access: ${failure.reason}`,
      sourceUrl,
      raw: {
        repository: `${repository.owner}/${repository.name}`,
        error: failure.reason,
      },
    };
  }
}
