import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import { GithubAccessError, githubJson, readGithubCliCredential } from "./github-api";

export const githubAccountSchema = z.object({ id: z.number().int().positive(), login: z.string().min(1).max(100) });
const common = {
  id: z.uuid(), account: githubAccountSchema, connectedAt: z.iso.datetime(),
  invalidReason: z.string().optional(),
};
const connectionSchema = z.discriminatedUnion("mode", [
  z.object({ ...common, mode: z.literal("cli"), source: z.enum(["GH_TOKEN", "GITHUB_TOKEN", "gh"]), fingerprint: z.string().length(64) }),
  z.object({ ...common, mode: z.literal("app"), clientId: z.string().min(1), slug: z.string().regex(/^[a-z0-9-]+$/), token: z.string().startsWith("ghu_"), expiresAt: z.iso.datetime().nullable() }),
]);
export type GithubConnection = z.infer<typeof connectionSchema>;
export type GithubAccount = z.infer<typeof githubAccountSchema>;

export function githubConnectionPath() {
  return join(resolve(/* turbopackIgnore: true */ process.env.SERVER_GUY_CONFIG_DIR ?? join(process.cwd(), ".server-guy")), "github-connection.json");
}

export function readGithubConnection(): GithubConnection | null {
  try {
    const value: unknown = JSON.parse(readFileSync(githubConnectionPath(), "utf8"));
    if (value === null) return null;
    const parsed = connectionSchema.safeParse(value);
    if (!parsed.success) throw new Error("invalid");
    return parsed.data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new GithubAccessError("Server Guy’s GitHub settings could not be read. Connect again to replace them.", "auth");
  }
}

export function saveGithubConnection(connection: GithubConnection | null) {
  const path = githubConnectionPath();
  const directory = resolve(path, "..");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `github-${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(connection, null, 2), { mode: 0o600, flag: "wx" });
    renameSync(temporary, path);
  } catch {
    throw new GithubAccessError("Could not save GitHub settings on this machine.");
  } finally { rmSync(temporary, { force: true }); }
}

export function githubConnectionIssue(connection: GithubConnection): string | null {
  if (connection.invalidReason) return connection.invalidReason;
  if (connection.mode === "app" && connection.expiresAt && Date.parse(connection.expiresAt) <= Date.now()) return "Your GitHub login has expired. Sign in again.";
  return null;
}

export function currentGithubConnectionId(): string | null {
  try {
    const connection = readGithubConnection();
    return connection && !githubConnectionIssue(connection) ? connection.id : null;
  } catch { return null; }
}

export function githubAppRegistration() {
  const clientId = process.env.SERVER_GUY_GITHUB_CLIENT_ID?.trim();
  const slug = process.env.SERVER_GUY_GITHUB_APP_SLUG?.trim();
  return clientId && /^[A-Za-z0-9_.-]+$/.test(clientId) && slug && /^[a-z0-9-]+$/.test(slug)
    ? { clientId, slug, installUrl: `https://github.com/apps/${slug}/installations/new` } : null;
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
    if (!parsed.success) throw new GithubAccessError("GitHub returned an unreadable account.");
    return { candidate: { id: credentialFingerprint(credential.token, credential.source), account: parsed.data, source: credential.source, scopes: response.scopes }, issue: null };
  } catch (error) {
    return { candidate: null, issue: error instanceof GithubAccessError ? error.message : "The existing GitHub login could not be checked." };
  }
}

export function invalidateGithubConnection(connection: GithubConnection, reason: string) {
  // An older request must never disable a newer login.
  if (readGithubConnection()?.id === connection.id) saveGithubConnection({ ...connection, invalidReason: reason });
}

export async function connectedGithubCredential() {
  const connection = readGithubConnection();
  if (!connection) throw new GithubAccessError("Connect GitHub in Settings before checking a repository.", "auth");
  const issue = githubConnectionIssue(connection);
  if (issue) throw new GithubAccessError(issue, "auth");
  if (connection.mode === "app") return { connection, token: connection.token };
  const credential = await readGithubCliCredential();
  if (!credential || credential.source !== connection.source || credentialFingerprint(credential.token, credential.source) !== connection.fingerprint) {
    const reason = "Your GitHub CLI login changed or is missing. Choose a connection again in Settings → GitHub.";
    invalidateGithubConnection(connection, reason);
    throw new GithubAccessError(reason, "auth");
  }
  return { connection, token: credential.token };
}
