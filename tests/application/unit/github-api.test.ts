import { afterEach, expect, it, vi } from "vitest";
import {
  githubDeviceRequest,
  githubJson,
  readGithubCliCredential,
} from "../../../src/server/github-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("sends a token only to GitHub with redirects disabled and accepts the last rate-limit request", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    new Response('{"id":42}', {
      headers: {
        "x-oauth-scopes": "repo, read:org",
        "x-ratelimit-remaining": "0",
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  expect(await githubJson("/user", "secret")).toEqual({
    data: { id: 42 },
    scopes: ["repo", "read:org"],
  });
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.github.com/user",
    expect.objectContaining({
      redirect: "error",
      cache: "no-store",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }),
  );
});
it.each([
  [401, "auth"],
  [403, "access"],
  [404, "access"],
  [429, "unavailable"],
  [500, "unavailable"],
])("maps HTTP %s to a sanitized %s error", async (status, kind) => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("private-provider-error", { status })),
  );
  await expect(githubJson("/user", "secret")).rejects.toMatchObject({ kind });
  await expect(githubJson("/user", "secret")).rejects.not.toThrow(
    "private-provider-error",
  );
});
it("does not expose fetch errors, response bodies or device secrets", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("secret-response")),
  );
  await expect(githubJson("/user", "secret")).rejects.not.toThrow(
    "secret-response",
  );
  await expect(
    githubDeviceRequest("/login/device/code", { client_id: "public" }),
  ).rejects.not.toThrow("secret-response");
});
it("honors GitHub CLI environment precedence and records the source", async () => {
  vi.stubEnv("GH_TOKEN", "gh-token");
  vi.stubEnv("GITHUB_TOKEN", "github-token");
  expect(await readGithubCliCredential()).toEqual({
    token: "gh-token",
    source: "GH_TOKEN",
  });
  vi.stubEnv("GH_TOKEN", "");
  expect(await readGithubCliCredential()).toEqual({
    token: "github-token",
    source: "GITHUB_TOKEN",
  });
});

it.each([200, 400, 401])(
  "passes refresh grant results from HTTP %s to validation without putting secrets in the URL",
  async (status) => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "bad_refresh_token" }), {
        status,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await githubDeviceRequest("/login/oauth/access_token", {
        client_id: "public-client",
        grant_type: "refresh_token",
        refresh_token: "ghr_secret",
      }),
    ).toEqual({ error: "bad_refresh_token" });
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://github.com/login/oauth/access_token");
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      cache: "no-store",
    });
    expect(request.body.get("refresh_token")).toBe("ghr_secret");
    expect(request.body.has("client_secret")).toBe(false);
  },
);

it("treats a refresh server failure as retryable without exposing its body", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response("ghr_private-provider-error", { status: 503 }),
      ),
  );
  await expect(
    githubDeviceRequest("/login/oauth/access_token", {
      grant_type: "refresh_token",
      refresh_token: "ghr_secret",
    }),
  ).rejects.toMatchObject({ kind: "unavailable" });
});
