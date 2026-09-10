import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
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

/** A public registry double serving manifests by tag or digest. */
function registry(manifests: Record<string, string>) {
  const calls: { url: string; authorization?: string; redirect?: string }[] =
    [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        authorization: (init.headers as Record<string, string> | undefined)
          ?.Authorization,
        redirect: init.redirect,
      });
      if (url.includes("/token?"))
        return Response.json({ token: `token-from-${new URL(url).host}` });
      const body = manifests[url.split("/manifests/")[1]];
      return body === undefined
        ? new Response(null, { status: 404 })
        : new Response(body);
    }),
  );
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

it("pins a GHCR tag to its Linux amd64 manifest using only GHCR and its own pull token", async () => {
  const calls = registry({
    "2.18.4": index,
    [digest(amd64)]: amd64,
    [digest(arm64)]: arm64,
  });
  await expect(
    pinContainerImage("ghcr.io/paperless-ngx/paperless-ngx:2.18.4", signal),
  ).resolves.toBe(`ghcr.io/paperless-ngx/paperless-ngx@${digest(amd64)}`);
  expect(calls).toEqual([
    {
      url: `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent("repository:paperless-ngx/paperless-ngx:pull")}`,
      redirect: "error",
    },
    ...["2.18.4", digest(amd64)].map((ref) => ({
      url: `https://ghcr.io/v2/paperless-ngx/paperless-ngx/manifests/${ref}`,
      authorization: "Bearer token-from-ghcr.io",
      redirect: "error",
    })),
  ]);
});

it("resolves explicit docker.io official images through Docker Hub alone", async () => {
  const calls = registry({ "16": amd64 });
  await expect(
    pinContainerImage("docker.io/postgres:16", signal),
  ).resolves.toBe(`docker.io/postgres@${digest(amd64)}`);
  expect(calls).toEqual([
    {
      url: `https://auth.docker.io/token?service=registry.docker.io&scope=${encodeURIComponent("repository:library/postgres:pull")}`,
      redirect: "error",
    },
    {
      url: "https://registry-1.docker.io/v2/library/postgres/manifests/16",
      authorization: "Bearer token-from-auth.docker.io",
      redirect: "error",
    },
  ]);
});

it("refuses manifests that do not match their digest and references outside the public registries", async () => {
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
  // Docker would pull a hostname-like first segment from that host, not Hub.
  for (const reference of [
    "evil.example/app:1",
    "localhost/app:1",
    "https://ghcr.io/org/app:1",
    "ghcr.io/org/app",
  ])
    await expect(pinContainerImage(reference, signal)).rejects.toThrow();
  expect(calls).toEqual([]);
});
