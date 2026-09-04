import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../../src/server/github-api";
import { connectedGithubCredential, credentialFingerprint, currentGithubConnectionId, detectGithubCliLogin, githubConnectionPath, readGithubConnection } from "../../../src/server/github-connection";
import { adoptGithubCliLogin, cancelGithubLogin, disconnectGithub, getGithubSetupStatus, pollGithubLogin, startGithubLogin } from "../../../src/server/github-setup";
import { inspectGithubRepository, parseGithubRepository } from "../../../src/server/github";
import { GET, POST, DELETE } from "../../../src/app/api/github/setup/route";
import { POST as startRoute } from "../../../src/app/api/github/setup/login/route";
import { POST as pollRoute, DELETE as cancelRoute } from "../../../src/app/api/github/setup/login/[attemptId]/route";

vi.mock("../../../src/server/github-api", async (original) => ({ ...await original<typeof api>(), githubJson: vi.fn(), githubDeviceRequest: vi.fn(), readGithubCliCredential: vi.fn() }));
const cli = vi.mocked(api.readGithubCliCredential);
const json = vi.mocked(api.githubJson);
const device = vi.mocked(api.githubDeviceRequest);
const account = { id: 42, login: "test-user" };
const token = "private-cli-token";
const deviceCode = { device_code: "private-device-code", user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 };
const tokenResponse = { access_token: "ghu_private-access-token", token_type: "bearer", expires_in: 28800, refresh_token: "private-refresh-token" };
const repository = parseGithubRepository("https://github.com/test-owner/example");
let directory: string;
let now: number;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-github-"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", directory);
  vi.stubEnv("SERVER_GUY_GITHUB_CLIENT_ID", "Iv1.test");
  vi.stubEnv("SERVER_GUY_GITHUB_APP_SLUG", "server-guy-test");
  now = Date.parse("2026-09-04T00:00:00Z");
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
  cli.mockReset().mockResolvedValue({ token, source: "gh" });
  json.mockReset().mockImplementation(async (path) => {
    if (path === "/user") return { data: account, scopes: ["repo"] };
    if (path.startsWith("/user/installations?")) return { data: { installations: [{ id: 7, app_slug: "server-guy-test", account: { id: 1, login: "test-owner" }, permissions: { metadata: "read", contents: "read" }, repository_selection: "selected", suspended_at: null }] }, scopes: [] };
    if (path.startsWith("/user/installations/7/repositories")) return { data: { repositories: [{ id: 99 }] }, scopes: [] };
    if (path === "/repos/test-owner/example") return { data: { id: 99, full_name: "test-owner/example", visibility: "private", default_branch: "release/stable", permissions: { pull: true, push: false } }, scopes: ["repo"] };
    if (path === "/repos/test-owner/example/commits/release%2Fstable") return { data: { sha: "a".repeat(40) }, scopes: [] };
    throw new Error(`Unexpected endpoint: ${path}`);
  });
  device.mockReset().mockImplementation(async (path) => path === "/login/device/code" ? deviceCode : tokenResponse);
});
afterEach(() => {
  globalThis.__serverGuyGithubSetups?.delete(githubConnectionPath());
  vi.useRealTimers(); vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
async function reuse() { await adoptGithubCliLogin(credentialFingerprint(token, "gh")); return readGithubConnection()!; }
async function appLogin() { const attempt = await startGithubLogin(); vi.setSystemTime(now += 5000); await pollGithubLogin(attempt.id); return readGithubConnection()!; }

describe("explicit GitHub consent and storage", () => {
  it("automatically detects an account but neither adopts nor exposes its token", async () => {
    const status = await getGithubSetupStatus();
    expect(status.connection).toBeNull();
    expect(status.detected.candidate).toMatchObject({ account, source: "gh", scopes: ["repo"] });
    expect(readGithubConnection()).toBeNull();
    expect(JSON.stringify(status)).not.toContain(token);
  });
  it("works without gh installed or any local credentials", async () => {
    cli.mockResolvedValue(null);
    expect((await detectGithubCliLogin()).candidate).toBeNull();
    expect(json).not.toHaveBeenCalled();
    expect((await startGithubLogin()).status).toBe("waiting");
  });
  it("reuses only the reviewed credential, without copying its token", async () => {
    const connection = await reuse();
    expect((await connectedGithubCredential()).token).toBe(token);
    expect(readFileSync(githubConnectionPath(), "utf8")).not.toContain(token);
    expect(statSync(githubConnectionPath()).mode & 0o777).toBe(0o600);
    cli.mockResolvedValue({ token: "changed-token", source: "gh" });
    await expect(adoptGithubCliLogin(credentialFingerprint(token, "gh"))).rejects.toThrow("changed");
    expect(readGithubConnection()).toEqual(connection);
    await expect(connectedGithubCredential()).rejects.toThrow("changed or is missing");
    expect(currentGithubConnectionId()).toBeNull();
  });
  it("disconnects only Server Guy and removes its separate token", async () => {
    await appLogin();
    disconnectGithub();
    expect(readGithubConnection()).toBeNull();
    expect(readFileSync(githubConnectionPath(), "utf8")).toBe("null");
    expect((await detectGithubCliLogin()).candidate?.account).toEqual(account);
    await expect(connectedGithubCredential()).rejects.toThrow("Connect GitHub");
  });
  it("requires App registration only for a separate login", async () => {
    vi.stubEnv("SERVER_GUY_GITHUB_CLIENT_ID", "");
    await expect(startGithubLogin()).rejects.toThrow("client ID");
    expect(device).not.toHaveBeenCalled();
    await reuse(); expect(currentGithubConnectionId()).not.toBeNull();
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
    expect(device).toHaveBeenCalledTimes(1); // Server enforces interval even if client ignores it.
    vi.setSystemTime(now += 5000);
    expect((await pollGithubLogin(attempt.id)).status).toBe("connected");
    const connection = readGithubConnection();
    expect(connection).toMatchObject({ mode: "app", account, token: tokenResponse.access_token });
    expect(connection?.id).not.toBe(previous.id);
    const serialized = JSON.stringify(await getGithubSetupStatus());
    for (const secret of [tokenResponse.access_token, tokenResponse.refresh_token, deviceCode.device_code]) expect(serialized).not.toContain(secret);
    expect(readFileSync(githubConnectionPath(), "utf8")).not.toContain(tokenResponse.refresh_token);
  });
  it.each([["access_denied", "cancelled"], ["expired_token", "expired"], ["device_flow_disabled", "failed"]])("handles %s without replacing the saved login", async (providerError, state) => {
    const previous = await reuse();
    const attempt = await startGithubLogin();
    device.mockResolvedValue({ error: providerError, error_description: "secret-provider-details" });
    vi.setSystemTime(now += 5000);
    const result = await pollGithubLogin(attempt.id);
    expect(result.status).toBe(state); expect(JSON.stringify(result)).not.toContain("secret-provider-details");
    expect(readGithubConnection()).toEqual(previous);
  });
  it("handles pending, slows polling after slow_down, and expires a code locally", async () => {
    const attempt = await startGithubLogin();
    device.mockResolvedValue({ error: "slow_down" });
    vi.setSystemTime(now += 5000);
    expect((await pollGithubLogin(attempt.id)).intervalSeconds).toBe(10);
    const calls = device.mock.calls.length;
    vi.setSystemTime(now += 5000); await pollGithubLogin(attempt.id); expect(device).toHaveBeenCalledTimes(calls);
    vi.setSystemTime(now += 5000); device.mockResolvedValue({ error: "authorization_pending" });
    expect((await pollGithubLogin(attempt.id)).status).toBe("waiting");
    vi.setSystemTime(now += 900_000); expect((await pollGithubLogin(attempt.id)).status).toBe("expired");
  });
  it.each(["cancel", "disconnect", "replace"])("a late token cannot undo %s and simultaneous polls share one provider request", async (operation) => {
    await reuse();
    const attempt = await startGithubLogin();
    let resolve!: (data: unknown) => void;
    device.mockImplementation(() => new Promise((done) => { resolve = done; }));
    vi.setSystemTime(now += 5000);
    const first = pollGithubLogin(attempt.id); const second = pollGithubLogin(attempt.id);
    expect(device).toHaveBeenCalledTimes(2);
    if (operation === "cancel") cancelGithubLogin(attempt.id);
    if (operation === "disconnect") disconnectGithub();
    if (operation === "replace") await reuse();
    const retained = readGithubConnection();
    resolve(tokenResponse);
    expect((await first).status).toBe("cancelled"); expect((await second).status).toBe("cancelled");
    expect(readGithubConnection()).toEqual(retained);
  });
  it("rejects malformed provider responses without leaking them", async () => {
    const attempt = await startGithubLogin();
    device.mockResolvedValue({ access_token: "gho_wrong-app-secret" }); vi.setSystemTime(now += 5000);
    const result = await pollGithubLogin(attempt.id);
    expect(result.status).toBe("failed"); expect(result.message).not.toContain("gho_");
    expect(readGithubConnection()).toBeNull();
  });
  it("asks for sign-in again after an expiring user token expires", async () => {
    await appLogin(); vi.setSystemTime(now += 28_800_001);
    expect(currentGithubConnectionId()).toBeNull();
    await expect(connectedGithubCredential()).rejects.toThrow("expired");
  });
});

describe("exact repository access", () => {
  it("records account, source, permissions, immutable repo ID, exact commit and connection", async () => {
    const connection = await reuse();
    const result = await inspectGithubRepository(repository);
    expect(result).toMatchObject({ status: "passed", raw: { repositoryId: 99, connectionId: connection.id, credentialSource: "gh", accountId: 42, scopes: ["repo"], accountRepositoryPermissions: { pull: true }, commitSha: "a".repeat(40), defaultBranch: "release/stable" } });
    expect(JSON.stringify(result)).not.toContain(token);
  });
  it("does no provider inspection before consent", async () => {
    expect((await inspectGithubRepository(repository)).status).toBe("unavailable");
    expect(json).not.toHaveBeenCalled(); expect(cli).not.toHaveBeenCalled();
  });
  it("does not silently accept a deleted-and-recreated repository at the same URL", async () => {
    await reuse();
    expect(await inspectGithubRepository(repository, 100)).toMatchObject({ status: "failed", summary: expect.stringContaining("different repository") });
  });
  it("checks the App installation contains the exact repository and read permission", async () => {
    await appLogin();
    expect(await inspectGithubRepository(repository)).toMatchObject({ status: "passed", raw: { installationId: 7, repositorySelection: "selected", grantedPermissions: { contents: "read" } } });
  });
  it.each(["missing-scope", "not-installed", "not-selected", "suspended"])("fails App access with %s, even if repository metadata is public", async (failure) => {
    await appLogin();
    const original = json.getMockImplementation()!;
    json.mockImplementation(async (...args) => {
      const response = await original(...args);
      if (args[0].startsWith("/user/installations?")) {
        const data = response.data as { installations: Array<{ permissions: object; suspended_at: string | null }> };
        if (failure === "missing-scope") data.installations[0].permissions = { metadata: "read" };
        if (failure === "not-installed") data.installations = [];
        if (failure === "suspended") data.installations[0].suspended_at = new Date().toISOString();
      }
      if (args[0].startsWith("/user/installations/7/repositories") && failure === "not-selected") response.data = { repositories: [{ id: 123 }] };
      return response;
    });
    expect((await inspectGithubRepository(repository)).status).toBe("failed");
    expect(json.mock.calls.some(([path]) => path.includes("/commits/"))).toBe(false);
  });
  it("invalidates a rejected credential and never exposes its raw error", async () => {
    await reuse(); json.mockRejectedValue(new api.GithubAccessError("Reconnect", "auth"));
    expect((await inspectGithubRepository(repository)).status).toBe("unavailable");
    expect(currentGithubConnectionId()).toBeNull();
  });
  it("does not accept a different account, repository or unreadable response", async () => {
    await reuse(); json.mockResolvedValueOnce({ data: { id: 900, login: "other-user" }, scopes: [] });
    expect((await inspectGithubRepository(repository)).status).toBe("unavailable");
    await reuse(); json.mockResolvedValueOnce({ data: account, scopes: [] }).mockResolvedValueOnce({ data: { id: 99, full_name: "another/repository", visibility: "private", default_branch: "main" }, scopes: [] });
    expect((await inspectGithubRepository(repository)).status).toBe("failed");
    json.mockResolvedValueOnce({ data: "secret-token", scopes: [] });
    expect(JSON.stringify(await inspectGithubRepository(repository))).not.toContain("secret-token");
  });
});

describe("GitHub HTTP boundaries", () => {
  it("exposes only public setup information", async () => {
    await appLogin();
    const response = await GET(new Request("http://localhost/api/github/setup"));
    expect(response.status).toBe(200); expect(await response.text()).not.toContain(tokenResponse.access_token);
  });
  it("rejects cross-origin mutations before any credential or provider operation", async () => {
    const context = { params: Promise.resolve({ attemptId: "unknown" }) };
    for (const [method, handler, body] of [["POST", POST, { candidateId: "0".repeat(64) }], ["DELETE", DELETE, { confirm: "disconnect" }], ["POST", startRoute, {}], ["POST", pollRoute, {}], ["DELETE", cancelRoute, {}]] as const) {
      const response = await handler(new Request("http://localhost/api/github/setup", { method, headers: { Origin: "https://untrusted.example" }, body: JSON.stringify(body) }), context);
      expect(response.status).toBe(400);
    }
    expect(cli).not.toHaveBeenCalled(); expect(device).not.toHaveBeenCalled();
  });
  it("rejects browser-supplied paths, tokens and unknown fields", async () => {
    const response = await POST(new Request("http://localhost/api/github/setup", { method: "POST", body: JSON.stringify({ candidateId: "0".repeat(64), authPath: "/private/file", token: "secret" }) }));
    expect(response.status).toBe(400); expect(cli).not.toHaveBeenCalled();
  });
});
