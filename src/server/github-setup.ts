import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  GithubAccessError,
  githubDeviceRequest,
  githubJson,
} from "./github-api";
import {
  canRefreshGithubConnection,
  detectGithubCliLogin,
  githubAccountSchema,
  githubAppRegistration,
  githubConnectionIssue,
  githubConnectionPath,
  parseGithubTokenResponse,
  readGithubConnection,
  saveGithubConnection,
} from "./github-connection";

export const useGithubCliSchema = z.strictObject({
  candidateId: z.string().length(64),
});
export const emptyGithubRequestSchema = z.strictObject({});
export const disconnectGithubSchema = z.strictObject({
  confirm: z.literal("disconnect"),
});

type LoginStatus =
  "starting" | "waiting" | "connected" | "cancelled" | "expired" | "failed";
export interface GithubLoginAttempt {
  id: string;
  status: LoginStatus;
  userCode: string | null;
  expiresAt: string | null;
  verificationUrl: string;
  intervalSeconds: number;
  message: string | null;
}
interface PendingLogin {
  view: GithubLoginAttempt;
  deviceCode?: string;
  clientId: string;
  slug: string;
  nextPollAt: number;
  polling?: Promise<GithubLoginAttempt>;
}
interface Coordinator {
  version: number;
  attempt?: PendingLogin;
}
declare global {
  var __serverGuyGithubSetups: Map<string, Coordinator> | undefined;
}
function coordinator() {
  const all = (globalThis.__serverGuyGithubSetups ??= new Map());
  const key = githubConnectionPath();
  if (!all.has(key)) all.set(key, { version: 0 });
  return all.get(key)!;
}
function cancelPending(state: Coordinator) {
  state.version++;
  if (
    state.attempt &&
    ["starting", "waiting"].includes(state.attempt.view.status)
  ) {
    state.attempt.view.status = "cancelled";
    state.attempt.deviceCode = undefined;
  }
}
function publicAttempt(attempt: PendingLogin) {
  if (
    attempt.view.status === "waiting" &&
    Date.parse(attempt.view.expiresAt!) <= Date.now()
  ) {
    attempt.view.status = "expired";
    attempt.deviceCode = undefined;
    attempt.view.message = "That code expired. Start sign-in again.";
  }
  return { ...attempt.view };
}

export async function getGithubSetupStatus() {
  let connection = null;
  let expectedCliFingerprint: string | null = null;
  let issue: string | null = null;
  try {
    const saved = readGithubConnection();
    if (saved) {
      if (saved.mode === "cli") expectedCliFingerprint = saved.fingerprint;
      issue = githubConnectionIssue(saved);
      connection = {
        id: saved.id,
        mode: saved.mode,
        account: saved.account,
        connectedAt: saved.connectedAt,
        source: saved.mode === "cli" ? saved.source : "Server Guy",
        expiresAt: saved.mode === "app" ? saved.expiresAt : null,
        automaticRenewal: canRefreshGithubConnection(saved),
        accessUrl:
          saved.mode === "app"
            ? `https://github.com/apps/${saved.slug}/installations/new`
            : "https://github.com/settings/applications",
      };
    }
  } catch (error) {
    issue =
      error instanceof GithubAccessError
        ? error.message
        : "GitHub settings are unavailable.";
  }
  const detected = await detectGithubCliLogin();
  if (
    !issue &&
    expectedCliFingerprint &&
    detected.candidate?.id !== expectedCliFingerprint
  )
    issue =
      detected.issue ??
      "Your existing GitHub login changed or is missing. Choose a connection again.";
  const attempt = coordinator().attempt;
  return {
    connection,
    issue,
    detected,
    registration: githubAppRegistration(),
    storagePath: githubConnectionPath(),
    attempt: attempt ? publicAttempt(attempt) : null,
  };
}
export type GithubSetupStatus = Awaited<
  ReturnType<typeof getGithubSetupStatus>
>;

export async function adoptGithubCliLogin(candidateId: string) {
  const state = coordinator();
  cancelPending(state);
  const version = state.version;
  const { candidate } = await detectGithubCliLogin();
  if (version !== state.version)
    throw new GithubAccessError(
      "Connection changed. Refresh Settings before continuing.",
      "auth",
    );
  if (!candidate || candidate.id !== candidateId)
    throw new GithubAccessError(
      "The detected GitHub login changed. Refresh and choose it again.",
      "auth",
    );
  saveGithubConnection({
    id: randomUUID(),
    mode: "cli",
    account: candidate.account,
    source: candidate.source,
    fingerprint: candidate.id,
    connectedAt: new Date().toISOString(),
  });
}

export function disconnectGithub() {
  cancelPending(coordinator());
  // Deletes Server Guy's stored token/selection by replacing the one owned
  // file.
  // gh's keychain/config and environment are never changed.
  saveGithubConnection(null);
}

export async function startGithubLogin(): Promise<GithubLoginAttempt> {
  const app = githubAppRegistration();
  if (!app)
    throw new GithubAccessError(
      "Configure Server Guy’s GitHub App client ID and slug before connecting an account.",
    );
  const state = coordinator();
  if (
    state.attempt &&
    ["starting", "waiting"].includes(publicAttempt(state.attempt).status)
  )
    return publicAttempt(state.attempt);
  cancelPending(state);
  const version = state.version;
  const attempt: PendingLogin = {
    clientId: app.clientId,
    slug: app.slug,
    nextPollAt: 0,
    view: {
      id: randomUUID(),
      status: "starting",
      userCode: null,
      expiresAt: null,
      verificationUrl: "https://github.com/login/device",
      intervalSeconds: 5,
      message: null,
    },
  };
  state.attempt = attempt;
  try {
    const data = await githubDeviceRequest("/login/device/code", {
      client_id: app.clientId,
    });
    const parsed = z
      .object({
        device_code: z.string().min(1),
        user_code: z.string().regex(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/),
        verification_uri: z.literal("https://github.com/login/device"),
        expires_in: z.number().int().min(1).max(3600),
        interval: z.number().int().min(1).max(60),
      })
      .safeParse(data);
    if (!parsed.success)
      throw new GithubAccessError(
        "GitHub could not start sign-in. Check the App registration and enable device flow.",
      );
    if (state.version !== version) return publicAttempt(attempt);
    attempt.deviceCode = parsed.data.device_code;
    attempt.nextPollAt = Date.now() + parsed.data.interval * 1000;
    Object.assign(attempt.view, {
      status: "waiting",
      userCode: parsed.data.user_code,
      intervalSeconds: parsed.data.interval,
      expiresAt: new Date(
        Date.now() + parsed.data.expires_in * 1000,
      ).toISOString(),
    });
  } catch (error) {
    if (state.version === version) {
      attempt.view.status = "failed";
      attempt.view.message =
        error instanceof GithubAccessError
          ? error.message
          : "GitHub sign-in could not start.";
    }
  }
  return publicAttempt(attempt);
}

export function cancelGithubLogin(id: string) {
  const state = coordinator();
  if (state.attempt?.view.id !== id)
    throw new GithubAccessError("This login attempt is no longer active.");
  cancelPending(state);
  return publicAttempt(state.attempt);
}

export async function pollGithubLogin(id: string): Promise<GithubLoginAttempt> {
  const state = coordinator();
  const attempt = state.attempt;
  if (!attempt || attempt.view.id !== id)
    throw new GithubAccessError(
      "This sign-in was interrupted. Start sign-in again.",
    );
  if (publicAttempt(attempt).status !== "waiting")
    return publicAttempt(attempt);
  if (attempt.polling) return attempt.polling;
  if (Date.now() < attempt.nextPollAt) return publicAttempt(attempt);
  const version = state.version;
  attempt.nextPollAt = Date.now() + attempt.view.intervalSeconds * 1000;
  attempt.polling = (async () => {
    try {
      const data = await githubDeviceRequest("/login/oauth/access_token", {
        client_id: attempt.clientId,
        device_code: attempt.deviceCode!,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      if (
        state.version !== version ||
        publicAttempt(attempt).status !== "waiting"
      )
        return publicAttempt(attempt);
      const failure = z.object({ error: z.string() }).safeParse(data);
      if (failure.success) {
        if (failure.data.error === "authorization_pending")
          return publicAttempt(attempt);
        if (failure.data.error === "slow_down") {
          attempt.view.intervalSeconds += 5;
          attempt.nextPollAt = Date.now() + attempt.view.intervalSeconds * 1000;
          return publicAttempt(attempt);
        }
        attempt.view.status =
          failure.data.error === "expired_token"
            ? "expired"
            : failure.data.error === "access_denied"
              ? "cancelled"
              : "failed";
        attempt.view.message =
          failure.data.error === "access_denied"
            ? "GitHub sign-in was cancelled."
            : "GitHub sign-in ended. Start again.";
        attempt.deviceCode = undefined;
        return publicAttempt(attempt);
      }
      const credentials = parseGithubTokenResponse(data);
      const account = githubAccountSchema.safeParse(
        (await githubJson("/user", credentials.token)).data,
      );
      if (!account.success)
        throw new GithubAccessError("GitHub returned an unreadable account.");
      if (
        state.version !== version ||
        publicAttempt(attempt).status !== "waiting"
      )
        return publicAttempt(attempt);
      saveGithubConnection({
        id: randomUUID(),
        mode: "app",
        ...credentials,
        clientId: attempt.clientId,
        slug: attempt.slug,
        account: account.data,
        connectedAt: new Date().toISOString(),
      });
      attempt.view.status = "connected";
      attempt.deviceCode = undefined;
    } catch (error) {
      if (state.version === version && attempt.view.status === "waiting") {
        attempt.view.status = "failed";
        attempt.deviceCode = undefined;
        attempt.view.message =
          error instanceof GithubAccessError
            ? error.message
            : "GitHub sign-in failed. Try again.";
      }
    }
    return publicAttempt(attempt);
  })();
  try {
    return await attempt.polling;
  } finally {
    attempt.polling = undefined;
  }
}
