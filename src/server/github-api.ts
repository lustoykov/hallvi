import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GithubAccessError extends Error {
  constructor(
    message: string,
    public readonly kind: "auth" | "access" | "unavailable" = "unavailable",
  ) {
    super(message);
  }
}

/**
 * Provider errors and CLI output can contain tokens. Only our own messages
 * cross this boundary.
 */
export async function githubJson(
  path: string,
  token: string,
  options: { signal?: AbortSignal } = {},
): Promise<{ data: unknown; scopes: string[] }> {
  const timeout = AbortSignal.timeout(20_000);
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // A read inside a Pi Run stops with the Run; every read stops at 20s.
      signal: options.signal
        ? AbortSignal.any([timeout, options.signal])
        : timeout,
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 401)
      throw new GithubAccessError(
        "GitHub no longer accepts this login. Reconnect in Settings → GitHub.",
        "auth",
      );
    if (
      response.status === 429 ||
      (response.status === 403 &&
        response.headers.get("x-ratelimit-remaining") === "0")
    )
      throw new GithubAccessError(
        "GitHub’s rate limit was reached. Try again later.",
      );
    if (response.status === 403)
      throw new GithubAccessError(
        "GitHub denied access. Check repository permissions and organization approval.",
        "access",
      );
    if (response.status === 404)
      throw new GithubAccessError(
        "The repository is missing or this login cannot access it. Check its URL and repository access on GitHub.",
        "access",
      );
    if (!response.ok)
      throw new GithubAccessError("GitHub is unavailable. Try again later.");
    return {
      data: await response.json(),
      scopes: (response.headers.get("x-oauth-scopes") ?? "")
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean),
    };
  } catch (error) {
    if (error instanceof GithubAccessError) throw error;
    // Cancellation is the caller's decision, not a provider failure.
    if (options.signal?.aborted) throw options.signal.reason;
    throw new GithubAccessError(
      "Could not reach GitHub or read its response. Try again.",
    );
  }
}

export async function githubDeviceRequest(
  path: "/login/device/code" | "/login/oauth/access_token",
  body: Record<string, string>,
): Promise<unknown> {
  try {
    const response = await fetch(`https://github.com${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
      redirect: "error",
    });
    // OAuth can return an invalid refresh grant as HTTP 400/401. Let the
    // credential boundary interpret only the error code, never its description.
    if (
      !response.ok &&
      !(
        body.grant_type === "refresh_token" &&
        [400, 401].includes(response.status)
      )
    )
      throw new Error("Provider request failed");
    return await response.json();
  } catch {
    throw new GithubAccessError(
      "Could not contact GitHub to sign in. Try again.",
    );
  }
}

export type GithubCliSource = "GH_TOKEN" | "GITHUB_TOKEN" | "gh";

/**
 * Reads only the selected github.com credential; never logs in, switches
 * accounts or copies it.
 */
export async function readGithubCliCredential(): Promise<{
  token: string;
  source: GithubCliSource;
} | null> {
  for (const source of ["GH_TOKEN", "GITHUB_TOKEN"] as const) {
    if (process.env[source]?.trim())
      return { token: process.env[source]!.trim(), source };
  }
  try {
    const { stdout } = await execFileAsync(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      {
        encoding: "utf8",
        maxBuffer: 16_384,
        timeout: 5_000,
        env: { ...process.env, GH_HOST: "github.com", GH_PROMPT_DISABLED: "1" },
      },
    );
    return stdout.trim() ? { token: stdout.trim(), source: "gh" } : null;
  } catch {
    return null;
  }
}
