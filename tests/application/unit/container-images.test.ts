import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";

// Registry hosts resolve to fixed addresses; one names a private network.
const dns = vi.hoisted(() => ({
  "ghcr.io": "140.82.112.33",
  "registry-1.docker.io": "44.219.3.189",
  "auth.docker.io": "44.219.3.190",
  "lscr.io": "104.21.64.1",
  "internal.example": "10.0.0.8",
}));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: keyof typeof dns) => {
    if (!dns[host]) throw new Error("ENOTFOUND");
    return [{ address: dns[host], family: 4 }];
  },
}));
import { pinContainerImage } from "../../../src/server/container-images";

const digest = (body: string) =>
  `sha256:${createHash("sha256").update(body).digest("hex")}`;
const amd64 = JSON.stringify({ schemaVersion: 2, config: { digest: "amd64" } });
const arm64 = JSON.stringify({ schemaVersion: 2, config: { digest: "arm64" } });
const platform = (body: string, architecture: string) => ({
  digest: digest(body),
  platform: { os: "linux", architecture },
});
const index = JSON.stringify({
  manifests: [platform(arm64, "arm64"), platform(amd64, "amd64")],
});
const signal = new AbortController().signal;
const challenges: Record<string, string> = {
  "ghcr.io": 'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
  "registry-1.docker.io":
    'Bearer realm="https://auth.docker.io/token",service="registry.docker.io"',
  "lscr.io": 'Bearer realm="https://ghcr.io/token",service="ghcr.io"',
};

/** A public registry double: manifests need the token its challenge names. */
function registry(
  manifests: Record<string, string>,
  answers: Record<string, string> = challenges,
) {
  const calls: { url: string; authorization?: string; redirect?: string }[] =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = String(input);
      const authorization = (init.headers as Record<string, string> | undefined)
        ?.Authorization;
      calls.push({ url, authorization, redirect: init.redirect });
      const { host } = new URL(url);
      if (url.includes("/token?"))
        return Response.json({ token: `token-from-${host}` });
      if (!authorization)
        return new Response(null, {
          status: 401,
          headers: { "WWW-Authenticate": answers[host] },
        });
      const body = manifests[url.split("/manifests/")[1]];
      return body === undefined
        ? new Response(null, { status: 404 })
        : new Response(body);
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

it("pins a tag to its Linux amd64 manifest with the pull token its registry's challenge names", async () => {
  const calls = registry({
    "2.18.4": index,
    [digest(amd64)]: amd64,
    [digest(arm64)]: arm64,
  });
  await expect(
    pinContainerImage("ghcr.io/paperless-ngx/paperless-ngx:2.18.4", signal),
  ).resolves.toBe(`ghcr.io/paperless-ngx/paperless-ngx@${digest(amd64)}`);
  const manifest = (ref: string) =>
    `https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/${ref}`;
  expect(calls).toEqual([
    { url: manifest("2.18.4"), redirect: "error" },
    {
      url: `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent("repository:paperless-ngx/paperless-ngx:pull")}`,
      redirect: "error",
    },
    ...["2.18.4", digest(amd64)].map((ref) => ({
      url: manifest(ref),
      authorization: "Bearer token-from-ghcr.io",
      redirect: "error",
    })),
  ]);
});

it("pins the requested Linux arm64 manifest while deployment callers still default to amd64", async () => {
  registry({
    "24-bookworm-slim": index,
    [digest(amd64)]: amd64,
    [digest(arm64)]: arm64,
  });
  await expect(
    pinContainerImage("node:24-bookworm-slim", signal, "arm64"),
  ).resolves.toBe(`node@${digest(arm64)}`);
});

it("resolves Docker Hub official images and other public registries through the same distribution flow", async () => {
  const hub = registry({ "16": amd64 });
  await expect(
    pinContainerImage("docker.io/postgres:16", signal),
  ).resolves.toBe(`docker.io/postgres@${digest(amd64)}`);
  expect(hub.map((call) => call.url)).toEqual([
    "https://registry-1.docker.io/v2/library/postgres/manifests/16",
    `https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent("repository:library/postgres:pull")}`,
    "https://registry-1.docker.io/v2/library/postgres/manifests/16",
  ]);
  const lscr = registry({ "v26.03.5-ls263": amd64 });
  await expect(
    pinContainerImage("lscr.io/linuxserver/bookstack:v26.03.5-ls263", signal),
  ).resolves.toBe(`lscr.io/linuxserver/bookstack@${digest(amd64)}`);
  expect(lscr.at(-1)).toEqual({
    url: "https://lscr.io/v2/linuxserver/bookstack/manifests/v26.03.5-ls263",
    authorization: "Bearer token-from-ghcr.io",
    redirect: "error",
  });
});

it("refuses mismatched digests, unsupported references, and registries or token services at private addresses", async () => {
  registry({ [digest(amd64)]: arm64 });
  await expect(
    pinContainerImage(`ghcr.io/org/app@${digest(amd64)}`, signal),
  ).rejects.toThrow("digest mismatch");
  registry({ "1": index, [digest(amd64)]: "{}" });
  await expect(pinContainerImage("org/app:1", signal)).rejects.toThrow(
    "digest mismatch",
  );
  registry({ "1": JSON.stringify({ manifests: [platform(arm64, "arm64")] }) });
  await expect(pinContainerImage("org/app:1", signal)).rejects.toThrow(
    "No Linux amd64 image",
  );
  const calls = registry({});
  // Docker pulls a first segment with a dot or port from that host.
  for (const reference of [
    "internal.example/app:1",
    "10.0.0.8/app:1",
    "unknown.example/app:1",
    "localhost/app:1",
    "https://ghcr.io/org/app:1",
    "ghcr.io/org/app",
  ])
    await expect(pinContainerImage(reference, signal)).rejects.toThrow();
  expect(calls).toEqual([]);
  // A public registry cannot send the token request to a private address.
  registry(
    { "1": amd64 },
    { "lscr.io": 'Bearer realm="https://internal.example/token"' },
  );
  await expect(pinContainerImage("lscr.io/org/app:1", signal)).rejects.toThrow(
    "not a public registry address",
  );
});
