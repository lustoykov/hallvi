import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";

const component = "[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*";
const registryHost =
  "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}(?::[0-9]{2,5})?";
/**
 * A public image with a tag or digest: Docker Hub by default, or any
 * registry host that serves the OCI distribution API.
 */
export const imageReferenceSchema = z
  .string()
  .max(400)
  .regex(
    new RegExp(
      `^(?!localhost[:/])(?:${registryHost}/)?${component}(?:/${component})*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})$`,
    ),
  );

function parse(reference: string) {
  const at = reference.indexOf("@");
  const split = at >= 0 ? at : reference.lastIndexOf(":");
  const repository = reference.slice(0, split);
  const first = repository.split("/")[0];
  // Docker's rule: a first component with a dot or port names a registry.
  const host =
    repository.includes("/") && /[.:]/.test(first) ? first : "docker.io";
  const path =
    host === "docker.io"
      ? repository.replace(/^docker\.io\//, "")
      : repository.slice(host.length + 1);
  return {
    repository,
    version: reference.slice(split + 1),
    registry: host === "docker.io" ? "registry-1.docker.io" : host,
    name:
      host === "docker.io" && !path.includes("/") ? `library/${path}` : path,
  };
}

function privateAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) return privateAddress(lower.slice(7));
  if (isIP(lower) === 4) {
    const [a, b] = lower.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) ||
    lower.startsWith("fe80")
  );
}

/**
 * Registry and token hosts come from repository content through Pi's
 * selection: the controller only ever contacts public addresses for them.
 */
async function assertPublicHost(host: string) {
  const name = host.replace(/:\d+$/, "");
  const addresses = isIP(name)
    ? [{ address: name }]
    : await lookup(name, { all: true }).catch(() => []);
  if (
    !addresses.length ||
    addresses.some(({ address }) => privateAddress(address))
  )
    throw new Error(`${name} is not a public registry address.`);
}

/** An anonymous pull token from the service a registry's challenge names. */
async function pullToken(
  challenge: string | null,
  name: string,
  signal: AbortSignal,
) {
  const realm = /realm="([^"]+)"/i.exec(challenge ?? "")?.[1];
  const service = /service="([^"]+)"/i.exec(challenge ?? "")?.[1];
  if (!/^bearer /i.test(challenge ?? "") || !realm)
    throw new Error(
      "The container registry requires credentials; only public images are supported.",
    );
  const url = new URL(realm);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("The container registry named an unusable token service.");
  await assertPublicHost(url.host);
  if (service) url.searchParams.set("service", service);
  url.searchParams.set("scope", `repository:${name}:pull`);
  const response = await fetch(url, { signal, redirect: "error" });
  if (!response.ok)
    throw new Error("Container registry authentication failed.");
  const body = (await response.json()) as {
    token?: unknown;
    access_token?: unknown;
  };
  const token = body.token ?? body.access_token;
  if (typeof token !== "string")
    throw new Error("Container registry returned no pull token.");
  return token;
}

/**
 * Resolve a public image tag to an immutable Linux image
 * through the registry's own distribution API and anonymous token flow.
 */
export async function pinContainerImage(
  reference: string,
  signal: AbortSignal,
  architecture: "amd64" | "arm64" = "amd64",
) {
  imageReferenceSchema.parse(reference);
  const { repository, version, registry, name } = parse(reference);
  await assertPublicHost(registry);
  let token: string | null = null;
  const manifest = async (ref: string) => {
    const url = `https://${registry}/v2/${name}/manifests/${ref}`;
    const get = () =>
      fetch(url, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Accept:
            "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
        },
        signal,
        redirect: "error",
      });
    let response = await get();
    if (response.status === 401 && !token) {
      token = await pullToken(
        response.headers.get("www-authenticate"),
        name,
        signal,
      );
      response = await get();
    }
    if (!response.ok)
      throw new Error(
        `Could not resolve container image ${reference} (HTTP ${response.status}).`,
      );
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000)
      throw new Error("Container manifest exceeds the supported size.");
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (ref.startsWith("sha256:") && ref !== digest)
      throw new Error("Container manifest digest mismatch.");
    return { digest, body: JSON.parse(bytes.toString("utf8")) };
  };
  let selected = await manifest(version);
  if (Array.isArray(selected.body.manifests)) {
    const platform = selected.body.manifests.find(
      (m: { platform?: { os?: string; architecture?: string } }) =>
        m.platform?.os === "linux" && m.platform.architecture === architecture,
    );
    if (!platform || !/^sha256:[0-9a-f]{64}$/.test(platform.digest))
      throw new Error(
        `No Linux ${architecture} image is available for ${reference}.`,
      );
    selected = await manifest(platform.digest);
  }
  return `${repository}@${selected.digest}`;
}
