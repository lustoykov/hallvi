import { createHash } from "node:crypto";
import { z } from "zod";

const imageName = "[a-z0-9]+(?:[._-][a-z0-9]+)*";
const hubNamespace = "[a-z0-9]+(?:[_-][a-z0-9]+)*";
/** A public Docker Hub or GHCR reference with a tag or digest. */
export const imageReferenceSchema = z
  .string()
  .regex(
    new RegExp(
      `^(?!localhost/)(?:(?:docker\\.io/)?(?:${hubNamespace}/)?${imageName}|ghcr\\.io/${imageName}(?:/${imageName})+)(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[0-9a-f]{64})$`,
    ),
  );

/** Resolve public registry tags to the host's immutable Linux amd64 image. */
export async function pinContainerImage(
  reference: string,
  signal: AbortSignal,
) {
  imageReferenceSchema.parse(reference);
  const [repository, version] = reference.includes("@")
    ? reference.split("@")
    : reference.split(":");
  const github = repository.startsWith("ghcr.io/");
  const registry = github ? "ghcr.io" : "registry-1.docker.io";
  const source = repository.replace(/^(?:docker\.io|ghcr\.io)\//, "");
  const name = github || source.includes("/") ? source : `library/${source}`;
  // These public registries have fixed token endpoints. Repository evidence
  // cannot direct the controller or its anonymous pull token to another host.
  const tokenEndpoint = github
    ? "https://ghcr.io/token?service=ghcr.io"
    : "https://auth.docker.io/token?service=registry.docker.io";
  const auth = await fetch(
    `${tokenEndpoint}&scope=${encodeURIComponent(`repository:${name}:pull`)}`,
    { signal, redirect: "error" },
  );
  if (!auth.ok) throw new Error("Container registry authentication failed.");
  const token = (await auth.json()).token;
  if (typeof token !== "string")
    throw new Error("Container registry returned no pull token.");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept:
      "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
  };
  const manifest = async (ref: string) => {
    const response = await fetch(
      `https://${registry}/v2/${name}/manifests/${ref}`,
      { headers, signal, redirect: "error" },
    );
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
        m.platform?.os === "linux" && m.platform.architecture === "amd64",
    );
    if (!platform || !/^sha256:[0-9a-f]{64}$/.test(platform.digest))
      throw new Error(`No Linux amd64 image is available for ${reference}.`);
    selected = await manifest(platform.digest);
  }
  return `${repository}@${selected.digest}`;
}
