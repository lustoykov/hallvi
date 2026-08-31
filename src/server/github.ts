import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RepositoryIdentity {
  owner: string;
  name: string;
  canonicalUrl: string;
}

export interface GithubInspection {
  ok: boolean;
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
  const input = value.trim().replace(/\.git$/, "");
  let owner = "";
  let name = "";

  if (input.startsWith("git@github.com:")) {
    [owner, name] = input.slice("git@github.com:".length).split("/");
  } else {
    let url: URL;
    try {
      url = new URL(input.includes("://") ? input : `https://${input}`);
    } catch {
      throw new Error("Enter a GitHub repository URL such as https://github.com/owner/repository.");
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("Phase 1 currently accepts GitHub repositories only.");
    }
    [owner, name] = url.pathname.split("/").filter(Boolean);
  }

  if (!owner || !name || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(name)) {
    throw new Error("Enter a GitHub repository URL with both an owner and repository name.");
  }

  return {
    owner,
    name,
    canonicalUrl: `https://github.com/${owner}/${name}`,
  };
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

    const [commit, user] = await Promise.all([
      ghJson<{ sha: string; html_url: string }>([
        "api",
        `repos/${repository.owner}/${repository.name}/commits/${repo.default_branch}`,
      ]),
      ghJson<{ login: string }>(["api", "user"]),
    ]);

    return {
      ok: true,
      summary: `${repo.full_name} is readable at ${repo.default_branch} · ${commit.sha.slice(0, 8)}.`,
      sourceUrl: commit.html_url,
      raw: {
        repository: repo.full_name,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        commitSha: commit.sha,
        commitUrl: commit.html_url,
        authenticatedAs: user.login,
        permissions: repo.permissions,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : "GitHub inspection failed.";
    return {
      ok: false,
      summary: `Server Guy could not read ${repository.owner}/${repository.name}.`,
      sourceUrl,
      raw: {
        repository: `${repository.owner}/${repository.name}`,
        error: message,
      },
    };
  }
}
