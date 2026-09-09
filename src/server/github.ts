import { z } from "zod";

import { GithubAccessError, githubJson } from "./github-api";
import {
  connectedGithubCredential,
  currentGithubConnectionId,
  githubAccountSchema,
  invalidateGithubConnection,
  readGithubConnection,
} from "./github-connection";
import type { GithubConnection } from "./github-connection";

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
    repositoryId?: number;
    connectionId?: string;
    credentialSource?: string;
    accountId?: number;
    scopes?: string[];
    installationId?: number;
    repositorySelection?: string;
    grantedPermissions?: Record<string, string>;
    checkedAt?: string;
    visibility?: string;
    defaultBranch?: string;
    commitSha?: string;
    commitUrl?: string;
    authenticatedAs?: string;
    accountRepositoryPermissions?: Record<string, boolean>;
    error?: string;
  };
}

export function parseGithubRepository(value: string): RepositoryIdentity {
  const input = value.trim();
  const normalized = input.replace(/^git@github\.com:/i, "https://github.com/");

  let url: URL;
  try {
    url = new URL(
      normalized.includes("://") ? normalized : `https://${normalized}`,
    );
  } catch {
    throw new Error(
      "Enter a GitHub repository URL such as https://github.com/owner/repository.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Enter a GitHub HTTPS or SSH repository URL.");
  }
  if (url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Phase 1 currently accepts GitHub repositories only.");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(
      "Enter a GitHub repository with only an owner and repository name.",
    );
  }

  const [owner, repositoryName] = parts;
  const name = repositoryName.replace(/\.git$/i, "");

  if (
    !owner ||
    !name ||
    !/^[A-Za-z0-9_.-]+$/.test(owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(name)
  ) {
    throw new Error(
      "Enter a GitHub repository URL with both an owner and repository name.",
    );
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
  return error instanceof GithubAccessError
    ? {
        status: error.kind === "access" ? "failed" : "unavailable",
        reason: error.message,
      }
    : {
        status: "unavailable",
        reason: "GitHub returned an unreadable response. Try the check again.",
      };
}

const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string(),
  visibility: z.string(),
  default_branch: z.string().min(1).max(1024),
  permissions: z.record(z.string(), z.boolean()).optional(),
});
const installationSchema = z.object({
  id: z.number().int().positive(),
  app_slug: z.string(),
  account: githubAccountSchema,
  permissions: z.record(z.string(), z.string()),
  repository_selection: z.enum(["all", "selected"]),
  suspended_at: z.string().nullable(),
});

async function verifyInstallation(
  token: string,
  connection: GithubConnection,
  repo: z.infer<typeof repositorySchema>,
) {
  if (connection.mode !== "app") return {};
  const owner = repo.full_name.split("/")[0];
  for (let page = 1; page <= 20; page++) {
    const { installations } = z
      .object({ installations: z.array(installationSchema) })
      .parse(
        (
          await githubJson(
            `/user/installations?per_page=100&page=${page}`,
            token,
          )
        ).data,
      );
    for (const installation of installations.filter(
      (item) =>
        item.app_slug === connection.slug &&
        item.account.login.toLowerCase() === owner.toLowerCase(),
    )) {
      if (
        installation.suspended_at ||
        !["read", "write"].includes(installation.permissions.contents)
      )
        throw new GithubAccessError(
          "Grant Server Guy read access to repository contents on GitHub, then run the check again.",
          "access",
        );
      for (let repoPage = 1; repoPage <= 20; repoPage++) {
        const { repositories } = z
          .object({
            repositories: z.array(
              z.object({ id: z.number().int().positive() }),
            ),
          })
          .parse(
            (
              await githubJson(
                `/user/installations/${installation.id}/repositories?per_page=100&page=${repoPage}`,
                token,
              )
            ).data,
          );
        if (repositories.some((item) => item.id === repo.id))
          return {
            installationId: installation.id,
            repositorySelection: installation.repository_selection,
            grantedPermissions: installation.permissions,
          };
        if (repositories.length < 100) break;
      }
    }
    if (installations.length < 100) break;
  }
  throw new GithubAccessError(
    "Allow this exact repository in Server Guy’s GitHub App installation, then run the check again.",
    "access",
  );
}

export async function inspectGithubRepository(
  repository: RepositoryIdentity,
  expectedRepositoryId?: number,
): Promise<GithubInspection> {
  return inspectGithubRepositoryAttempt(repository, expectedRepositoryId, true);
}

async function inspectGithubRepositoryAttempt(
  repository: RepositoryIdentity,
  expectedRepositoryId: number | undefined,
  retryAfterRotation: boolean,
): Promise<GithubInspection> {
  const sourceUrl = repository.canonicalUrl;
  const fullName = `${repository.owner}/${repository.name}`;
  const checkedAt = new Date().toISOString();
  let connection: GithubConnection | undefined;

  try {
    const credential = await connectedGithubCredential();
    connection = credential.connection;
    const { token } = credential;
    const identity = await githubJson("/user", token);
    const account = githubAccountSchema.parse(identity.data);
    if (account.id !== connection.account.id)
      throw new GithubAccessError(
        "The GitHub account changed. Choose a connection again in Settings.",
        "auth",
      );
    const repo = repositorySchema.parse(
      (await githubJson(`/repos/${fullName}`, token)).data,
    );
    if (expectedRepositoryId !== undefined && repo.id !== expectedRepositoryId)
      throw new GithubAccessError(
        "This URL now belongs to a different repository. Add it as a new application to avoid reusing the old repository’s history.",
        "access",
      );
    if (repo.full_name.toLowerCase() !== fullName.toLowerCase())
      throw new GithubAccessError(
        "GitHub returned a different repository. Check the selected repository URL.",
        "access",
      );
    const scope = await verifyInstallation(token, connection, repo);
    const commit = z
      .object({ sha: z.string().regex(/^[a-f0-9]{40}$/) })
      .parse(
        (
          await githubJson(
            `/repos/${fullName}/commits/${encodeURIComponent(repo.default_branch)}`,
            token,
          )
        ).data,
      );
    if (currentGithubConnectionId() !== connection.id)
      throw new GithubAccessError(
        "The connection changed during this check. Run it again.",
        "auth",
      );
    const commitUrl = `${sourceUrl}/commit/${commit.sha}`;

    return {
      status: "passed",
      summary: `${repo.full_name} is readable at ${repo.default_branch} · ${commit.sha.slice(0, 8)}.`,
      sourceUrl: commitUrl,
      raw: {
        repository: repo.full_name,
        repositoryId: repo.id,
        connectionId: connection.id,
        credentialSource: "Server Guy GitHub App",
        accountId: account.id,
        scopes: identity.scopes,
        ...scope,
        checkedAt,
        visibility: repo.visibility,
        defaultBranch: repo.default_branch,
        commitSha: commit.sha,
        commitUrl,
        authenticatedAs: account.login,
        // The account's repository role is not the App token's effective grant.
        accountRepositoryPermissions: repo.permissions,
      },
    };
  } catch (error) {
    // Refresh invalidates the previous access token. A check already using it
    // may race renewal; retry once, only for the same consented connection.
    if (
      retryAfterRotation &&
      connection?.mode === "app" &&
      error instanceof GithubAccessError &&
      error.kind === "auth"
    ) {
      const current = readGithubConnection();
      if (
        current?.mode === "app" &&
        current.id === connection.id &&
        current.token !== connection.token &&
        !current.invalidReason
      ) {
        return inspectGithubRepositoryAttempt(
          repository,
          expectedRepositoryId,
          false,
        );
      }
    }
    if (
      connection &&
      error instanceof GithubAccessError &&
      error.kind === "auth"
    )
      invalidateGithubConnection(connection, error.message);
    const failure = classifyGithubFailure(error);
    return {
      status: failure.status,
      summary:
        failure.status === "unavailable"
          ? `GitHub inspection is unavailable: ${failure.reason}`
          : `${repository.owner}/${repository.name} is not readable with the current GitHub access: ${failure.reason}`,
      sourceUrl,
      raw: {
        repository: fullName,
        connectionId: connection?.id,
        checkedAt,
        error: failure.reason,
      },
    };
  }
}
