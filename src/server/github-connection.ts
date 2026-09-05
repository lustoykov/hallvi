import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import {
  GithubAccessError,
  githubDeviceRequest,
  githubJson,
  readGithubCliCredential,
} from "./github-api";

export const githubAccountSchema = z.object({
  id: z.number().int().positive(),
  login: z.string().min(1).max(100),
});
const common = {
  id: z.uuid(),
  account: githubAccountSchema,
  connectedAt: z.iso.datetime(),
  invalidReason: z.string().optional(),
};
const connectionSchema = z.discriminatedUnion("mode", [
  z.object({
    ...common,
    mode: z.literal("cli"),
    source: z.enum(["GH_TOKEN", "GITHUB_TOKEN", "gh"]),
    fingerprint: z.string().length(64),
  }),
  z.object({
    ...common,
    mode: z.literal("app"),
    clientId: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    token: z.string().startsWith("ghu_"),
    expiresAt: z.iso.datetime().nullable(),
    refresh: z
      .object({
        token: z.string().startsWith("ghr_"),
        expiresAt: z.iso.datetime(),
      })
      .optional(),
  }),
]);
export type GithubConnection = z.infer<typeof connectionSchema>;
export type GithubAccount = z.infer<typeof githubAccountSchema>;
type AppConnection = Extract<GithubConnection, { mode: "app" }>;

const tokenResponseSchema = z
  .object({
    access_token: z.string().startsWith("ghu_"),
    token_type: z.literal("bearer"),
  })
  .and(
    z.union([
      z.object({
        expires_in: z.number().int().positive().max(86_400),
        refresh_token: z.string().startsWith("ghr_"),
        refresh_token_expires_in: z
          .number()
          .int()
          .positive()
          .max(366 * 86_400),
      }),
      z.object({
        expires_in: z.undefined().optional(),
        refresh_token: z.undefined().optional(),
        refresh_token_expires_in: z.undefined().optional(),
      }),
    ]),
  );

/**
 * Only validated credentials enter the owned file; never expose parser/provider
 * details.
 */
export function parseGithubTokenResponse(
  value: unknown,
): Pick<AppConnection, "token" | "expiresAt" | "refresh"> {
  const result = tokenResponseSchema.safeParse(value);
  if (!result.success)
    throw new GithubAccessError(
      "GitHub returned an incomplete login. Sign in again.",
      "auth",
    );
  const data = result.data;
  const issuedAt = Date.now();
  return {
    token: data.access_token,
    expiresAt: data.expires_in
      ? new Date(issuedAt + data.expires_in * 1000).toISOString()
      : null,
    refresh: data.refresh_token
      ? {
          token: data.refresh_token,
          expiresAt: new Date(
            issuedAt + data.refresh_token_expires_in * 1000,
          ).toISOString(),
        }
      : undefined,
  };
}

export function canRefreshGithubConnection(connection: GithubConnection) {
  return (
    connection.mode === "app" &&
    !connection.invalidReason &&
    Boolean(
      connection.refresh &&
      Date.parse(connection.refresh.expiresAt) > Date.now(),
    )
  );
}

export function githubConnectionPath() {
  return join(
    resolve(
      /* turbopackIgnore: true */ process.env.SERVER_GUY_CONFIG_DIR ??
        join(process.cwd(), ".server-guy"),
    ),
    "github-connection.json",
  );
}

export function readGithubConnection(): GithubConnection | null {
  try {
    const value: unknown = JSON.parse(
      readFileSync(githubConnectionPath(), "utf8"),
    );
    if (value === null) return null;
    const parsed = connectionSchema.safeParse(value);
    if (!parsed.success) throw new Error("invalid");
    return parsed.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new GithubAccessError(
      "Server Guy’s GitHub settings could not be read. Connect again to replace them.",
      "auth",
    );
  }
}

export function saveGithubConnection(connection: GithubConnection | null) {
  const path = githubConnectionPath();
  const directory = resolve(path, "..");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `github-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(connection, null, 2), {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, path);
  } catch {
    throw new GithubAccessError(
      "Could not save GitHub settings on this machine.",
    );
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function githubConnectionIssue(
  connection: GithubConnection,
): string | null {
  if (connection.invalidReason) return connection.invalidReason;
  if (
    connection.mode === "app" &&
    connection.expiresAt &&
    Date.parse(connection.expiresAt) <= Date.now() &&
    !canRefreshGithubConnection(connection)
  ) {
    return connection.refresh
      ? "Your GitHub login has expired. Sign in again."
      : "Sign in to GitHub once more to enable automatic renewal for this older login.";
  }
  return null;
}

export function currentGithubConnectionId(): string | null {
  try {
    const connection = readGithubConnection();
    return connection && !githubConnectionIssue(connection)
      ? connection.id
      : null;
  } catch {
    return null;
  }
}

export function githubAppRegistration() {
  const clientId = process.env.SERVER_GUY_GITHUB_CLIENT_ID?.trim();
  const slug = process.env.SERVER_GUY_GITHUB_APP_SLUG?.trim();
  return clientId &&
    /^[A-Za-z0-9_.-]+$/.test(clientId) &&
    slug &&
    /^[a-z0-9-]+$/.test(slug)
    ? {
        clientId,
        slug,
        installUrl: `https://github.com/apps/${slug}/installations/new`,
      }
    : null;
}

export function credentialFingerprint(token: string, source: string) {
  return createHash("sha256").update(`${source}\0${token}`).digest("hex");
}

export async function detectGithubCliLogin() {
  const credential = await readGithubCliCredential();
  if (!credential) return { candidate: null, issue: null };
  try {
    const response = await githubJson("/user", credential.token);
    const parsed = githubAccountSchema.safeParse(response.data);
    if (!parsed.success)
      throw new GithubAccessError("GitHub returned an unreadable account.");
    return {
      candidate: {
        id: credentialFingerprint(credential.token, credential.source),
        account: parsed.data,
        source: credential.source,
        scopes: response.scopes,
      },
      issue: null,
    };
  } catch (error) {
    return {
      candidate: null,
      issue:
        error instanceof GithubAccessError
          ? error.message
          : "The existing GitHub login could not be checked.",
    };
  }
}

export function invalidateGithubConnection(
  connection: GithubConnection,
  reason: string,
) {
  // An older request must never disable a replacement login or a rotated token.
  const current = readGithubConnection();
  if (
    current?.id === connection.id &&
    current.mode === connection.mode &&
    (current.mode !== "app" ||
      (connection.mode === "app" && current.token === connection.token))
  ) {
    saveGithubConnection({ ...current, invalidReason: reason });
  }
}

// Share a single-use refresh across route bundles and concurrent requests in
// this
// local Node process. The file remains authoritative; no background timer is
// needed.
declare global {
  var __serverGuyGithubRefreshes:
    | Map<
        string,
        { token: string; id: string; promise: Promise<AppConnection> }
      >
    | undefined;
}
async function refreshGithubConnection(
  connection: AppConnection,
): Promise<AppConnection> {
  const path = githubConnectionPath();
  const all = (globalThis.__serverGuyGithubRefreshes ??= new Map());
  const pending = all.get(path);
  if (pending?.id === connection.id && pending.token === connection.token)
    return pending.promise;
  const promise = (async () => {
    try {
      const data = await githubDeviceRequest("/login/oauth/access_token", {
        client_id: connection.clientId,
        grant_type: "refresh_token",
        refresh_token: connection.refresh!.token,
      });
      const failure = z.object({ error: z.string() }).safeParse(data);
      if (failure.success) {
        if (
          [
            "bad_refresh_token",
            "expired_token",
            "invalid_grant",
            "access_denied",
          ].includes(failure.data.error)
        ) {
          throw new GithubAccessError(
            "GitHub could not renew this login. Sign in again.",
            "auth",
          );
        }
        throw new GithubAccessError(
          "GitHub could not renew access right now. Try the repository check again.",
        );
      }
      const credentials = parseGithubTokenResponse(data);
      // Do not resurrect a disconnected account, overwrite a new login, or
      // replace credentials already rotated elsewhere while the request waited.
      const current = readGithubConnection();
      if (
        current?.id !== connection.id ||
        current.mode !== "app" ||
        current.token !== connection.token ||
        current.invalidReason
      ) {
        throw new GithubAccessError(
          "The GitHub connection changed during renewal. Try again.",
        );
      }
      const refreshed = { ...current, ...credentials };
      saveGithubConnection(refreshed);
      return refreshed;
    } catch (error) {
      if (error instanceof GithubAccessError && error.kind === "auth")
        invalidateGithubConnection(connection, error.message);
      if (error instanceof GithubAccessError) throw error;
      throw new GithubAccessError(
        "GitHub access could not be renewed. Try again.",
      );
    }
  })();
  all.set(path, { token: connection.token, id: connection.id, promise });
  try {
    return await promise;
  } finally {
    if (all.get(path)?.promise === promise) all.delete(path);
  }
}

export async function connectedGithubCredential() {
  const connection = readGithubConnection();
  if (!connection)
    throw new GithubAccessError(
      "Connect GitHub in Settings before checking a repository.",
      "auth",
    );
  const issue = githubConnectionIssue(connection);
  if (issue) throw new GithubAccessError(issue, "auth");
  if (connection.mode === "app") {
    const refreshDue =
      connection.expiresAt &&
      Date.parse(connection.expiresAt) <= Date.now() + 60_000;
    const current =
      refreshDue && canRefreshGithubConnection(connection)
        ? await refreshGithubConnection(connection)
        : connection;
    return { connection: current, token: current.token };
  }
  const credential = await readGithubCliCredential();
  if (
    !credential ||
    credential.source !== connection.source ||
    credentialFingerprint(credential.token, credential.source) !==
      connection.fingerprint
  ) {
    const reason =
      "Your GitHub CLI login changed or is missing. Choose a connection again in Settings → GitHub.";
    invalidateGithubConnection(connection, reason);
    throw new GithubAccessError(reason, "auth");
  }
  return { connection, token: credential.token };
}
