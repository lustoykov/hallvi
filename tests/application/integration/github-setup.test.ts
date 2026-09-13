import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../src/server/github-api";
import {
  connectedGithubCredential,
  credentialFingerprint,
  currentGithubConnectionId,
  detectGithubCliLogin,
  githubConnectionPath,
  invalidateGithubConnection,
  readGithubConnection,
  saveGithubConnection,
} from "../../../src/server/github-connection";
import {
  adoptGithubCliLogin,
  cancelGithubLogin,
  disconnectGithub,
  getGithubSetupStatus,
  pollGithubLogin,
  startGithubLogin,
} from "../../../src/server/github-setup";
import {
  inspectGithubRepository,
  parseGithubRepository,
} from "../../../src/server/github";
import { GET, POST, DELETE } from "../../../src/app/api/github/setup/route";
import { POST as startRoute } from "../../../src/app/api/github/setup/login/route";
import {
  POST as pollRoute,
  DELETE as cancelRoute,
} from "../../../src/app/api/github/setup/login/[attemptId]/route";

vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<typeof api>()),
  githubJson: vi.fn(),
  githubDeviceRequest: vi.fn(),
  readGithubCliCredential: vi.fn(),
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, renameSync: vi.fn(fs.renameSync) };
});
const cli = vi.mocked(api.readGithubCliCredential);
const json = vi.mocked(api.githubJson);
const device = vi.mocked(api.githubDeviceRequest);
const account = { id: 42, login: "test-user" };
const token = "private-cli-token";
const deviceCode = {
  device_code: "private-device-code",
  user_code: "ABCD-1234",
  verification_uri: "https://github.com/login/device",
  expires_in: 900,
  interval: 5,
};
const tokenResponse = {
  access_token: "ghu_private-access-token",
  token_type: "bearer",
  expires_in: 28800,
  refresh_token: "ghr_private-refresh-token",
  refresh_token_expires_in: 15897600,
};
const renewedResponse = {
  ...tokenResponse,
  access_token: "ghu_renewed-private-token",
  refresh_token: "ghr_renewed-private-token",
};
const repository = parseGithubRepository(
  "https://github.com/test-owner/example",
);
let directory: string;
let now: number;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-github-"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", directory);
  vi.stubEnv("SERVER_GUY_GITHUB_CLIENT_ID", "Iv1.test");
  vi.stubEnv("SERVER_GUY_GITHUB_APP_SLUG", "server-guy-test");
  now = Date.parse("2026-09-04T00:00:00Z");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  cli.mockReset().mockResolvedValue({ token, source: "gh" });
  json.mockReset().mockImplementation(async (path) => {
    if (path === "/user") return { data: account, scopes: ["repo"] };
    if (path.startsWith("/user/installations?"))
      return {
        data: {
          installations: [
            {
              id: 7,
              app_slug: "server-guy-test",
              account: { id: 1, login: "test-owner" },
              permissions: { metadata: "read", contents: "read" },
              repository_selection: "selected",
              suspended_at: null,
            },
          ],
        },
        scopes: [],
      };
    if (path.startsWith("/user/installations/7/repositories"))
      return { data: { repositories: [{ id: 99 }] }, scopes: [] };
    if (path === "/repos/test-owner/example")
      return {
        data: {
          id: 99,
          full_name: "test-owner/example",
          visibility: "private",
          default_branch: "release/stable",
          permissions: { pull: true, push: false },
        },
        scopes: ["repo"],
      };
    if (path === "/repos/test-owner/example/commits/release%2Fstable")
      return { data: { sha: "a".repeat(40) }, scopes: [] };
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  device
    .mockReset()
    .mockImplementation(async (path) =>
      path === "/login/device/code" ? deviceCode : tokenResponse,
    );
});
afterEach(() => {
  globalThis.__serverGuyGithubSetups?.delete(githubConnectionPath());
  globalThis.__serverGuyGithubRefreshes?.delete(githubConnectionPath());
  vi.useRealTimers();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
async function reuse() {
  const attempt = (await getGithubSetupStatus()).attempt;
  if (attempt) cancelGithubLogin(attempt.id);
  saveGithubConnection({
    id: randomUUID(),
    mode: "app",
    account,
    connectedAt: new Date().toISOString(),
    clientId: "Iv1.test",
    slug: "server-guy-test",
    token: tokenResponse.access_token,
    expiresAt: null,
  });
  return readGithubConnection()!;
}
async function appLogin() {
  const attempt = await startGithubLogin();
  vi.setSystemTime((now += 5000));
  await pollGithubLogin(attempt.id);
  return readGithubConnection()!;
}

describe("explicit GitHub consent and storage", () => {
  it("does not inspect the host CLI login when opening Settings", async () => {
    const status = await getGithubSetupStatus();
    expect(status.connection).toBeNull();
    expect(status.detected.candidate).toBeNull();
    expect(cli).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
    expect(readGithubConnection()).toBeNull();
  });
  it("works without gh installed or any local credentials", async () => {
    cli.mockResolvedValue(null);
    expect((await detectGithubCliLogin()).candidate).toBeNull();
    expect(json).not.toHaveBeenCalled();
    expect((await startGithubLogin()).status).toBe("waiting");
  });
  it("rejects CLI adoption and explains how to replace an older CLI connection", async () => {
    await expect(
      adoptGithubCliLogin(credentialFingerprint(token, "gh")),
    ).rejects.toThrow("no longer supported");
    expect(cli).not.toHaveBeenCalled();
    saveGithubConnection({
      id: randomUUID(),
      mode: "cli",
      source: "gh",
      fingerprint: credentialFingerprint(token, "gh"),
      account,
      connectedAt: new Date().toISOString(),
    });
    await expect(connectedGithubCredential()).rejects.toThrow("GitHub App");
    expect(currentGithubConnectionId()).toBeNull();
    expect((await getGithubSetupStatus()).issue).toContain(
      "no longer supported",
    );
    expect(cli).not.toHaveBeenCalled();
  });
  it("disconnects only Server Guy and removes its separate token", async () => {
    await appLogin();
    disconnectGithub();
    expect(readGithubConnection()).toBeNull();
    expect(readFileSync(githubConnectionPath(), "utf8")).toBe("null");
    expect((await detectGithubCliLogin()).candidate?.account).toEqual(account);
    await expect(connectedGithubCredential()).rejects.toThrow("Connect GitHub");
  });
  it("requires App registration for the supported connection path", async () => {
    vi.stubEnv("SERVER_GUY_GITHUB_CLIENT_ID", "");
    await expect(startGithubLogin()).rejects.toThrow("client ID");
    expect(device).not.toHaveBeenCalled();
    await expect(
      adoptGithubCliLogin(credentialFingerprint(token, "gh")),
    ).rejects.toThrow("GitHub App");
    expect(currentGithubConnectionId()).toBeNull();
  });
});

describe("GitHub device flow", () => {
  it("preserves the old login until successful authorization and returns only public attempt fields", async () => {
    const previous = await reuse();
    const attempt = await startGithubLogin();
    expect(await startGithubLogin()).toEqual(attempt);
    expect(device).toHaveBeenCalledTimes(1);
    expect(readGithubConnection()).toEqual(previous);
    expect(JSON.stringify(attempt)).not.toContain("private-device-code");
    expect((await pollGithubLogin(attempt.id)).status).toBe("waiting");
    // Server enforces interval even if client ignores it.
    expect(device).toHaveBeenCalledTimes(1);
    vi.setSystemTime((now += 5000));
    expect((await pollGithubLogin(attempt.id)).status).toBe("connected");
    const connection = readGithubConnection();
    expect(connection).toMatchObject({
      mode: "app",
      account,
      token: tokenResponse.access_token,
    });
    expect(connection?.id).not.toBe(previous.id);
    const serialized = JSON.stringify(await getGithubSetupStatus());
    for (const secret of [
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      deviceCode.device_code,
    ])
      expect(serialized).not.toContain(secret);
    expect(readGithubConnection()).toMatchObject({
      refresh: {
        token: tokenResponse.refresh_token,
        expiresAt: new Date(now + 15897600_000).toISOString(),
      },
    });
    expect(statSync(githubConnectionPath()).mode & 0o777).toBe(0o600);
  });
  it.each([
    ["access_denied", "cancelled"],
    ["expired_token", "expired"],
    ["device_flow_disabled", "failed"],
  ])(
    "handles %s without replacing the saved login",
    async (providerError, state) => {
      const previous = await reuse();
      const attempt = await startGithubLogin();
      device.mockResolvedValue({
        error: providerError,
        error_description: "secret-provider-details",
      });
      vi.setSystemTime((now += 5000));
      const result = await pollGithubLogin(attempt.id);
      expect(result.status).toBe(state);
      expect(JSON.stringify(result)).not.toContain("secret-provider-details");
      expect(readGithubConnection()).toEqual(previous);
    },
  );
  it("handles pending, slows polling after slow_down, and expires a code locally", async () => {
    const attempt = await startGithubLogin();
    device.mockResolvedValue({ error: "slow_down" });
    vi.setSystemTime((now += 5000));
    expect((await pollGithubLogin(attempt.id)).intervalSeconds).toBe(10);
    const calls = device.mock.calls.length;
    vi.setSystemTime((now += 5000));
    await pollGithubLogin(attempt.id);
    expect(device).toHaveBeenCalledTimes(calls);
    vi.setSystemTime((now += 5000));
    device.mockResolvedValue({ error: "authorization_pending" });
    expect((await pollGithubLogin(attempt.id)).status).toBe("waiting");
    vi.setSystemTime((now += 900_000));
    expect((await pollGithubLogin(attempt.id)).status).toBe("expired");
  });
  it.each(["cancel", "disconnect", "replace"])(
    "a late token cannot undo %s and simultaneous polls share one provider request",
    async (operation) => {
      await reuse();
      const attempt = await startGithubLogin();
      let resolve!: (data: unknown) => void;
      device.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      vi.setSystemTime((now += 5000));
      const first = pollGithubLogin(attempt.id);
      const second = pollGithubLogin(attempt.id);
      expect(device).toHaveBeenCalledTimes(2);
      if (operation === "cancel") cancelGithubLogin(attempt.id);
      if (operation === "disconnect") disconnectGithub();
      if (operation === "replace") await reuse();
      const retained = readGithubConnection();
      resolve(tokenResponse);
      expect((await first).status).toBe("cancelled");
      expect((await second).status).toBe("cancelled");
      expect(readGithubConnection()).toEqual(retained);
    },
  );
  it("rejects malformed provider responses without leaking them", async () => {
    const attempt = await startGithubLogin();
    device.mockResolvedValue({ access_token: "gho_wrong-app-secret" });
    vi.setSystemTime((now += 5000));
    const result = await pollGithubLogin(attempt.id);
    expect(result.status).toBe("failed");
    expect(result.message).not.toContain("gho_");
    expect(readGithubConnection()).toBeNull();
  });
});

describe("GitHub access renewal", () => {
  async function expiringLogin() {
    const connection = await appLogin();
    vi.setSystemTime((now += 28_800_001));
    device.mockClear().mockResolvedValue(renewedResponse);
    cli.mockClear();
    json.mockClear();
    return connection;
  }

  it("rotates both tokens without changing consent identity or exposing secrets", async () => {
    const previous = await expiringLogin();
    expect(currentGithubConnectionId()).toBe(previous.id);
    expect((await getGithubSetupStatus()).connection?.automaticRenewal).toBe(
      true,
    );
    // Reading Settings does not spend a refresh token.
    expect(device).not.toHaveBeenCalled();
    cli.mockClear();
    const credential = await connectedGithubCredential();
    expect(credential.token).toBe(renewedResponse.access_token);
    expect(credential.connection).toMatchObject({
      id: previous.id,
      account: previous.account,
      connectedAt: previous.connectedAt,
      expiresAt: new Date(now + 28800_000).toISOString(),
      refresh: {
        token: renewedResponse.refresh_token,
        expiresAt: new Date(now + 15897600_000).toISOString(),
      },
    });
    expect(device).toHaveBeenCalledExactlyOnceWith(
      "/login/oauth/access_token",
      {
        client_id: "Iv1.test",
        grant_type: "refresh_token",
        refresh_token: tokenResponse.refresh_token,
      },
    );
    expect(cli).not.toHaveBeenCalled();
    expect(readGithubConnection()).toEqual(credential.connection);
    expect(statSync(githubConnectionPath()).mode & 0o777).toBe(0o600);
    expect(readFileSync(githubConnectionPath(), "utf8")).not.toContain(
      tokenResponse.refresh_token,
    );
    const publicState = JSON.stringify(await getGithubSetupStatus());
    for (const secret of [
      tokenResponse.access_token,
      tokenResponse.refresh_token,
      renewedResponse.access_token,
      renewedResponse.refresh_token,
    ])
      expect(publicState).not.toContain(secret);
    await connectedGithubCredential();
    expect(device).toHaveBeenCalledTimes(1);
  });

  it("renews just before expiry and uses the newly persisted refresh token next time", async () => {
    await appLogin();
    device.mockClear().mockResolvedValue(renewedResponse);
    vi.setSystemTime((now += 28_700_000));
    await connectedGithubCredential();
    expect(device).not.toHaveBeenCalled();
    vi.setSystemTime((now += 50_000));
    await connectedGithubCredential();
    expect(device).toHaveBeenCalledTimes(1);
    vi.setSystemTime((now += 28_800_000));
    device.mockResolvedValue({
      ...renewedResponse,
      access_token: "ghu_third",
      refresh_token: "ghr_third",
    });
    expect((await connectedGithubCredential()).token).toBe("ghu_third");
    expect(device).toHaveBeenLastCalledWith(
      "/login/oauth/access_token",
      expect.objectContaining({ refresh_token: renewedResponse.refresh_token }),
    );
  });

  it("shares one single-use exchange across simultaneous requests", async () => {
    await expiringLogin();
    let resolve!: (value: unknown) => void;
    device.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const first = connectedGithubCredential();
    const second = connectedGithubCredential();
    expect(device).toHaveBeenCalledTimes(1);
    resolve(renewedResponse);
    const results = await Promise.all([first, second]);
    expect(results[0]).toEqual(results[1]);
    expect(results[0].token).toBe(renewedResponse.access_token);
    expect(
      globalThis.__serverGuyGithubRefreshes?.has(githubConnectionPath()),
    ).toBe(false);
  });

  it.each(["disconnect", "replace", "invalidate"])(
    "a pending refresh cannot undo %s",
    async (operation) => {
      const previous = await expiringLogin();
      let resolve!: (value: unknown) => void;
      device.mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const request = connectedGithubCredential();
      const rejected = expect(request).rejects.toThrow(
        "changed during renewal",
      );
      if (operation === "disconnect") disconnectGithub();
      if (operation === "replace") await reuse();
      if (operation === "invalidate")
        invalidateGithubConnection(previous, "Authorization revoked");
      const retained = readGithubConnection();
      resolve(renewedResponse);
      await rejected;
      expect(readGithubConnection()).toEqual(retained);
    },
  );

  it("says a refused renewal is about the renewal token, not the App", async () => {
    // GitHub answers `incorrect_client_credentials` when the client id is
    // real and the refresh token is not one it will honour — the same words
    // it uses for a missing secret, which a device-flow client does not need.
    // Saying "credentials" sent this session looking for a misconfigured App
    // for an hour; the cause is a renewal token that another copy of this
    // connection already spent.
    const previous = await expiringLogin();
    device.mockResolvedValueOnce({
      error: "incorrect_client_credentials",
      error_description:
        "The client_id and/or client_secret passed are incorrect.",
    });
    await expect(connectedGithubCredential()).rejects.toThrow(
      /renewal token.*copied between checkouts.*Sign in again/s,
    );
    const stored = readGithubConnection()!;
    expect(stored.id).toBe(previous.id);
    expect(stored.invalidReason).toMatch(/renewal token/);
    // Never GitHub's own words: its description names a secret we do not use.
    expect(stored.invalidReason).not.toMatch(/client_secret/);
  });

  it("a late failed refresh cannot invalidate a replacement connection", async () => {
    await expiringLogin();
    let resolve!: (value: unknown) => void;
    device.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const request = connectedGithubCredential();
    const rejected = expect(request).rejects.toThrow("Sign in again");
    const replacement = await reuse();
    resolve({
      error: "bad_refresh_token",
      error_description: "private-provider-data",
    });
    await rejected;
    expect(readGithubConnection()).toEqual(replacement);
  });

  it("an old in-flight request cannot overwrite or invalidate a rotated token", async () => {
    const old = await expiringLogin();
    const renewed = await connectedGithubCredential();
    invalidateGithubConnection(old, "Old access token rejected");
    expect(readGithubConnection()).toEqual(renewed.connection);
    expect(currentGithubConnectionId()).toBe(old.id);
  });

  it.each([
    "bad_refresh_token",
    "incorrect_client_credentials",
    "expired_token",
    "invalid_grant",
    "access_denied",
  ])(
    "requires sign-in after %s without leaking provider details or falling back to CLI",
    async (error) => {
      await expiringLogin();
      device.mockResolvedValue({
        error,
        error_description: tokenResponse.refresh_token,
      });
      await expect(connectedGithubCredential()).rejects.toThrow(
        "Sign in again",
      );
      expect(currentGithubConnectionId()).toBeNull();
      expect((await getGithubSetupStatus()).issue).not.toContain(
        tokenResponse.refresh_token,
      );
      cli.mockClear();
      await expect(connectedGithubCredential()).rejects.toThrow(
        "Sign in again",
      );
      expect(device).toHaveBeenCalledTimes(1);
      expect(cli).not.toHaveBeenCalled();
    },
  );

  it.each(["network", "provider"])(
    "keeps credentials on a transient %s failure so the next request can retry",
    async (failure) => {
      const previous = await expiringLogin();
      if (failure === "network")
        device.mockRejectedValue(
          new api.GithubAccessError("Could not reach GitHub"),
        );
      else
        device.mockResolvedValue({
          error: "temporarily_unavailable",
          error_description: tokenResponse.refresh_token,
        });
      await expect(connectedGithubCredential()).rejects.toBeInstanceOf(
        api.GithubAccessError,
      );
      expect(readGithubConnection()).toEqual(previous);
      expect(currentGithubConnectionId()).toBe(previous.id);
      device.mockResolvedValue(renewedResponse);
      expect((await connectedGithubCredential()).token).toBe(
        renewedResponse.access_token,
      );
    },
  );

  it("rejects an incomplete rotated credential instead of saving half a token pair", async () => {
    await expiringLogin();
    device.mockResolvedValue({ ...renewedResponse, refresh_token: undefined });
    await expect(connectedGithubCredential()).rejects.toThrow(
      "incomplete login",
    );
    expect(currentGithubConnectionId()).toBeNull();
    expect(readFileSync(githubConnectionPath(), "utf8")).not.toContain(
      renewedResponse.access_token,
    );
  });

  it("never returns a rotated token unless its atomic file replacement succeeds", async () => {
    const previous = await expiringLogin();
    vi.mocked(renameSync).mockImplementationOnce(() => {
      throw new Error("private-filesystem-details");
    });
    await expect(connectedGithubCredential()).rejects.toThrow(
      "Could not save GitHub settings",
    );
    expect(readGithubConnection()).toEqual(previous);
    expect(
      globalThis.__serverGuyGithubRefreshes?.has(githubConnectionPath()),
    ).toBe(false);
  });

  it("keeps an old-format login usable until expiry, then explains the one-time sign-in", async () => {
    const connection = await appLogin();
    if (connection.mode !== "app") throw new Error("Expected App login");
    saveGithubConnection({ ...connection, refresh: undefined });
    device.mockClear();
    expect((await connectedGithubCredential()).token).toBe(connection.token);
    vi.setSystemTime((now += 28_800_001));
    expect(currentGithubConnectionId()).toBeNull();
    await expect(connectedGithubCredential()).rejects.toThrow("once more");
    expect(device).not.toHaveBeenCalled();
  });

  it("does not try an expired refresh token or discard still-valid access prematurely", async () => {
    const connection = await appLogin();
    if (connection.mode !== "app") throw new Error("Expected App login");
    saveGithubConnection({
      ...connection,
      refresh: {
        token: tokenResponse.refresh_token,
        expiresAt: new Date(now - 1).toISOString(),
      },
    });
    device.mockClear();
    await connectedGithubCredential();
    expect(currentGithubConnectionId()).toBe(connection.id);
    vi.setSystemTime((now += 28_800_001));
    await expect(connectedGithubCredential()).rejects.toThrow("expired");
    expect(currentGithubConnectionId()).toBeNull();
    expect(device).not.toHaveBeenCalled();
  });

  it("supports explicitly non-expiring App tokens without trying renewal", async () => {
    device.mockImplementation(async (path) =>
      path === "/login/device/code"
        ? deviceCode
        : { access_token: "ghu_nonexpiring", token_type: "bearer" },
    );
    const connection = await appLogin();
    device.mockClear();
    vi.setSystemTime((now += 365 * 86_400_000));
    expect((await connectedGithubCredential()).token).toBe("ghu_nonexpiring");
    expect(currentGithubConnectionId()).toBe(connection.id);
    expect(device).not.toHaveBeenCalled();
  });

  it("uses the renewed token for repository verification and preserves the evidence connection ID", async () => {
    const previous = await expiringLogin();
    const result = await inspectGithubRepository(repository);
    expect(result).toMatchObject({
      status: "passed",
      raw: { connectionId: previous.id, accountId: account.id },
    });
    expect(
      json.mock.calls.every(
        ([, accessToken]) => accessToken === renewedResponse.access_token,
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/ghu_|ghr_/);
  });

  it("retries a repository check once if another request rotated the token it was already using", async () => {
    const previous = await appLogin();
    const original = json.getMockImplementation()!;
    let rejectOldRequest!: (error: Error) => void;
    let entered!: () => void;
    const oldRequestStarted = new Promise<void>((resolve) => {
      entered = resolve;
    });
    json.mockImplementation((path, accessToken) => {
      if (path === "/user" && accessToken === tokenResponse.access_token) {
        entered();
        return new Promise((_resolve, reject) => {
          rejectOldRequest = reject;
        });
      }
      return original(path, accessToken);
    });
    const check = inspectGithubRepository(repository);
    await oldRequestStarted;
    vi.setSystemTime((now += 28_800_001));
    device.mockResolvedValue(renewedResponse);
    await connectedGithubCredential();
    rejectOldRequest(
      new api.GithubAccessError("Old token invalidated by rotation", "auth"),
    );
    expect(await check).toMatchObject({
      status: "passed",
      raw: { connectionId: previous.id },
    });
    expect(currentGithubConnectionId()).toBe(previous.id);
    expect(json.mock.calls.filter(([path]) => path === "/user")).toHaveLength(
      3,
    ); // login + old request + retry
  });
});

describe("exact repository access", () => {
  it("records account, source, permissions, immutable repo ID, exact commit and connection", async () => {
    const connection = await reuse();
    const result = await inspectGithubRepository(repository);
    expect(result).toMatchObject({
      status: "passed",
      raw: {
        repositoryId: 99,
        connectionId: connection.id,
        credentialSource: "Server Guy GitHub App",
        accountId: 42,
        scopes: ["repo"],
        accountRepositoryPermissions: { pull: true },
        commitSha: "a".repeat(40),
        defaultBranch: "release/stable",
      },
    });
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("reads a public repository without a login, and never borrows one", async () => {
    // Server Guy exists to deploy software its user did not write, and a
    // public repository is public. What must not happen is reaching for a
    // credential the owner did not choose: the host's gh login stays untouched
    // and the read carries no token.
    expect(await inspectGithubRepository(repository)).toMatchObject({
      status: "passed",
      raw: {
        credentialSource: "Public repository, read without a login",
        repositorySelection: "public-anonymous",
      },
    });
    expect(cli).not.toHaveBeenCalled();
    for (const call of json.mock.calls) expect(call[1]).toBeNull();
  });
  it("does not silently accept a deleted-and-recreated repository at the same URL", async () => {
    await reuse();
    expect(await inspectGithubRepository(repository, 100)).toMatchObject({
      status: "failed",
      summary: expect.stringContaining("different repository"),
    });
  });
  it("checks the App installation contains the exact repository and read permission", async () => {
    await appLogin();
    expect(await inspectGithubRepository(repository)).toMatchObject({
      status: "passed",
      raw: {
        installationId: 7,
        repositorySelection: "selected",
        grantedPermissions: { contents: "read" },
      },
    });
  });
  it.each(["missing-scope", "not-installed", "not-selected", "suspended"])(
    "fails private repository access with %s",
    async (failure) => {
      await appLogin();
      const original = json.getMockImplementation()!;
      json.mockImplementation(async (...args) => {
        const response = await original(...args);
        if (args[0].startsWith("/user/installations?")) {
          const data = response.data as {
            installations: Array<{
              permissions: object;
              suspended_at: string | null;
            }>;
          };
          if (failure === "missing-scope")
            data.installations[0].permissions = { metadata: "read" };
          if (failure === "not-installed") data.installations = [];
          if (failure === "suspended")
            data.installations[0].suspended_at = new Date().toISOString();
        }
        if (
          args[0].startsWith("/user/installations/7/repositories") &&
          failure === "not-selected"
        )
          response.data = { repositories: [{ id: 123 }] };
        return response;
      });
      expect((await inspectGithubRepository(repository)).status).toBe("failed");
      expect(json.mock.calls.some(([path]) => path.includes("/commits/"))).toBe(
        false,
      );
    },
  );
  it("reads public upstream source without granting publication access", async () => {
    await appLogin();
    const original = json.getMockImplementation()!;
    json.mockImplementation(async (...args) => {
      if (args[0].startsWith("/user/installations?"))
        return { data: { installations: [] }, scopes: [] };
      if (args[0].includes("/git/trees/"))
        return { data: { tree: [{ path: "README.md" }] }, scopes: [] };
      const response = await original(...args);
      if (args[0] === "/repos/test-owner/example")
        (response.data as { visibility: string }).visibility = "public";
      return response;
    });
    const result = await inspectGithubRepository(repository);
    expect(result.status).toBe("passed");
    expect(result.raw.repositorySelection).toBe("public-read");
    expect(result.raw.installationId).toBeUndefined();
    expect(result.raw.grantedPermissions).toEqual({ contents: "read" });
  });
  it("invalidates a rejected credential and never exposes its raw error", async () => {
    await reuse();
    json.mockRejectedValue(new api.GithubAccessError("Reconnect", "auth"));
    expect((await inspectGithubRepository(repository)).status).toBe(
      "unavailable",
    );
    expect(currentGithubConnectionId()).toBeNull();
  });
  it("does not accept a different account, repository or unreadable response", async () => {
    await reuse();
    json.mockResolvedValueOnce({
      data: { id: 900, login: "other-user" },
      scopes: [],
    });
    expect((await inspectGithubRepository(repository)).status).toBe(
      "unavailable",
    );
    await reuse();
    json
      .mockResolvedValueOnce({ data: account, scopes: [] })
      .mockResolvedValueOnce({
        data: {
          id: 99,
          full_name: "another/repository",
          visibility: "private",
          default_branch: "main",
        },
        scopes: [],
      });
    expect((await inspectGithubRepository(repository)).status).toBe("failed");
    json.mockResolvedValueOnce({ data: "secret-token", scopes: [] });
    expect(
      JSON.stringify(await inspectGithubRepository(repository)),
    ).not.toContain("secret-token");
  });
});

describe("GitHub HTTP boundaries", () => {
  it("exposes only public setup information", async () => {
    await appLogin();
    const response = await GET(
      new Request("http://localhost/api/github/setup"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(tokenResponse.access_token);
  });
  it("rejects cross-origin mutations before any credential or provider operation", async () => {
    const context = { params: Promise.resolve({ attemptId: "unknown" }) };
    for (const [method, handler, body] of [
      ["POST", POST, { candidateId: "0".repeat(64) }],
      ["DELETE", DELETE, { confirm: "disconnect" }],
      ["POST", startRoute, {}],
      ["POST", pollRoute, {}],
      ["DELETE", cancelRoute, {}],
    ] as const) {
      const response = await handler(
        new Request("http://localhost/api/github/setup", {
          method,
          headers: { Origin: "https://untrusted.example" },
          body: JSON.stringify(body),
        }),
        context,
      );
      expect(response.status).toBe(400);
    }
    expect(cli).not.toHaveBeenCalled();
    expect(device).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied paths, tokens and unknown fields", async () => {
    const response = await POST(
      new Request("http://localhost/api/github/setup", {
        method: "POST",
        body: JSON.stringify({
          candidateId: "0".repeat(64),
          authPath: "/private/file",
          token: "secret",
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(cli).not.toHaveBeenCalled();
  });
});
