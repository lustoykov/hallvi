// Builds the repository's Dockerfile in an ephemeral rootless BuildKit
// container. Repository code never receives a Docker socket, host mount,
// controller environment, registry credential or unrestricted network.
import { randomBytes } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { dirname } from "node:path/posix";
import { extract } from "tar-stream";

import { DockerClient, DockerError } from "./docker";
import { treeArchive, type TreeFile } from "./execution-tree";
import { normalizeTarPath } from "./tar";
import { PROXY_SCRIPT } from "./runner-scripts";
import { CONFORMANCE_DEFINITION } from "./conformance-definition";
import { redactSecrets } from "./secrets";

// Version + digest verified against the official multi-platform image.
export const BUILDER_IMAGE =
  "moby/buildkit:v0.33.0-rootless@sha256:80b15f0735e87bab7bf59ec4d695dfb4a7cfb25521cf56dc75d6f256285b63ef";
const IMAGE_BYTES = 2 * 1024 * 1024 * 1024;
const BUILD_SECONDS = 600;
const BUILD_HOSTS = [
  ...CONFORMANCE_DEFINITION.dependencyHosts,
  "registry-1.docker.io",
  "auth.docker.io",
  "production.cloudflare.docker.com",
  "production.cloudfront.docker.com",
  "ghcr.io",
  "pkg-containers.githubusercontent.com",
];

export interface ApplicationBuild {
  /** Paths are repository-relative. Context defaults to the repository root. */
  dockerfile: string;
  context?: string;
  target?: string;
}

export interface BuiltApplicationImage {
  reference: string;
  imageId: string;
  builderImageId: string;
  output: string;
  outputTruncated: boolean;
}

function relativePath(path: string, allowRoot = false) {
  if (allowRoot && path === ".") return ".";
  const normalized = normalizeTarPath(path, 0);
  if (!normalized || normalized !== path)
    throw new Error(
      "Build paths must name a normalized path inside the repository.",
    );
  return normalized;
}

/** Stream Docker's outer archive, then its one image file directly into the
 * daemon. Never extract image layers onto the controller or buffer a whole
 * image. Both declared and actually received byte counts are bounded. */
export async function loadBuiltImage(
  client: DockerClient,
  containerId: string,
  signal?: AbortSignal,
) {
  const source = await client.archiveStream(
    containerId,
    "/tmp/image.tar",
    signal,
  );
  const tar = extract();
  let bytes = 0;
  let files = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(
        bytes > IMAGE_BYTES + 1024 * 1024
          ? new Error("The built image exceeds the 2 GiB transfer limit.")
          : null,
        chunk,
      );
    },
  });
  const copying = pipeline(source, limit, tar, { signal });
  // Attach the rejection handler immediately, even while waiting for an entry.
  void copying.catch((error: Error) => tar.destroy(error));
  try {
    for await (const entry of tar) {
      files++;
      if (
        files !== 1 ||
        entry.header.name !== "image.tar" ||
        entry.header.type !== "file" ||
        (entry.header.size ?? 0) > IMAGE_BYTES
      )
        throw new Error(
          "The builder did not return one bounded image archive.",
        );
      const response = await client.request("/images/load?quiet=true", {
        method: "POST",
        body: Readable.from(entry),
        headers: { "Content-Type": "application/x-tar" },
        signal,
        timeoutMs: 120_000,
        maxBytes: 64 * 1024,
      });
      if (response.status >= 400 || response.truncated)
        throw new DockerError(
          "Docker could not import the application image.",
          response.status,
        );
      for (const line of response.body
        .toString("utf8")
        .split("\n")
        .filter(Boolean)) {
        const message = JSON.parse(line) as { error?: string };
        if (message.error) throw new DockerError(message.error, 500);
      }
    }
    await copying;
    if (files !== 1)
      throw new Error("The builder returned no application image.");
  } finally {
    source.destroy();
    tar.destroy();
    await copying.catch(() => undefined);
  }
}

export async function buildApplicationImage(
  client: DockerClient,
  files: TreeFile[],
  build: ApplicationBuild,
  options: {
    labels: Record<string, string>;
    signal?: AbortSignal;
    onProgress?: (message: string) => void;
  },
): Promise<BuiltApplicationImage> {
  const dockerfile = relativePath(build.dockerfile);
  const context = relativePath(build.context ?? ".", true);
  if (!files.some((file) => file.path === dockerfile))
    throw new Error(
      `The selected tree has no ${dockerfile}. Propose a Dockerfile before building.`,
    );
  if (build.target && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(build.target))
    throw new Error("Invalid Dockerfile build target.");
  const suffix = randomBytes(12).toString("hex");
  const name = `sg-build-${suffix}`;
  const network = `${name}-net`;
  const reference = `server-guy-build:${suffix}`;
  const created: string[] = [];
  const signal = AbortSignal.any([
    ...(options.signal ? [options.signal] : []),
    AbortSignal.timeout(BUILD_SECONDS * 1000),
  ]);
  const say = (message: string) => options.onProgress?.(message);
  let built = false;
  try {
    signal.throwIfAborted();
    let builder;
    try {
      builder = await client.inspectImage(BUILDER_IMAGE);
    } catch {
      builder = await client.pullImage(BUILDER_IMAGE, { signal });
    }
    await client.createNetwork(network, options.labels, true);
    const proxy = await client.createContainer(`${name}-proxy`, {
      Image: CONFORMANCE_DEFINITION.runnerImage,
      Labels: options.labels,
      Cmd: ["python3", "-c", PROXY_SCRIPT],
      User: "1000:1000",
      Env: [`ALLOWED_HOSTS=${BUILD_HOSTS.join(",")}`],
      HostConfig: {
        NetworkMode: "bridge",
        Memory: 128 * 1024 * 1024,
        MemorySwap: 128 * 1024 * 1024,
        PidsLimit: 32,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: true,
        LogConfig: {
          Type: "json-file",
          Config: { "max-size": "1m", "max-file": "1" },
        },
      },
    });
    created.push(proxy.Id);
    await client.startContainer(proxy.Id);
    await client.connectNetwork(network, proxy.Id, ["proxy"]);
    const proxyAddress = (await client.inspectContainer(proxy.Id))
      .NetworkSettings?.Networks?.[network]?.IPAddress;
    if (!proxyAddress)
      throw new Error(
        "The build proxy has no address on its isolated network.",
      );
    // BuildKit's nested executor does not retain Docker's embedded DNS names.
    const proxyUrl = `http://${proxyAddress}:3128`;
    const args = [
      "build",
      "--frontend",
      "dockerfile.v0",
      "--local",
      `context=/tmp/context${context === "." ? "" : `/${context}`}`,
      "--local",
      `dockerfile=/tmp/context/${dirname(dockerfile)}`,
      "--opt",
      `filename=${dockerfile.split("/").at(-1)}`,
      "--opt",
      `build-arg:HTTPS_PROXY=${proxyUrl}`,
      "--opt",
      `build-arg:HTTP_PROXY=${proxyUrl}`,
      ...(build.target ? ["--opt", `target=${build.target}`] : []),
      ...Object.entries(options.labels).flatMap(([key, value]) => [
        "--opt",
        `label:${key}=${value}`,
      ]),
      "--output",
      `type=docker,name=${reference},dest=/tmp/image.tar`,
    ];
    const container = await client.createContainer(name, {
      Image: builder.Id,
      Labels: options.labels,
      User: "1000:1000",
      Entrypoint: ["buildctl-daemonless.sh"],
      Cmd: args,
      Env: [
        "XDG_RUNTIME_DIR=/tmp",
        "BUILDKITD_FLAGS=--root=/home/user/.local/share/buildkit",
        `HTTPS_PROXY=${proxyUrl}`,
        `HTTP_PROXY=${proxyUrl}`,
      ],
      HostConfig: {
        NetworkMode: network,
        Memory: 1024 * 1024 * 1024,
        MemorySwap: 1024 * 1024 * 1024,
        NanoCpus: 1_000_000_000,
        PidsLimit: 256,
        // Rootless BuildKit needs user namespaces and nested mounts. These
        // allowances apply only to this disposable builder, which has no
        // controller credentials.
        // No privileged mode, host namespaces, devices or host mounts.
        SecurityOpt: ["seccomp=unconfined", "apparmor=unconfined"],
        MaskedPaths: [],
        ReadonlyPaths: [],
        LogConfig: {
          Type: "json-file",
          Config: { "max-size": "4m", "max-file": "1" },
        },
      },
    });
    created.push(container.Id);
    await client.putArchive(
      container.Id,
      "/tmp",
      treeArchive(
        files.map((file) => ({ ...file, path: `context/${file.path}` })),
      ),
    );
    signal.throwIfAborted();
    say(`Building ${dockerfile} from the selected repository tree`);
    await client.startContainer(container.Id);
    const result = await client.waitContainer(container.Id, {
      timeoutMs: BUILD_SECONDS * 1000,
      signal,
    });
    const logs = await client.containerLogs(container.Id, 32 * 1024);
    const output = redactSecrets(logs.combined).text;
    if (result.exitCode !== 0)
      throw new DockerError(
        `Application image build ${result.timedOut ? "timed out" : `exited with ${result.exitCode}`}:\n${output}`,
        0,
        result.timedOut ? "ETIMEDOUT" : "BUILD_FAILED",
      );
    say("Importing the built application image into Docker");
    await loadBuiltImage(client, container.Id, signal);
    const image = await client.inspectImage(reference);
    built = true;
    return {
      reference,
      imageId: image.Id,
      builderImageId: builder.Id,
      output,
      outputTruncated: logs.truncated,
    };
  } finally {
    for (const id of created.reverse())
      await client.removeContainer(id).catch(() => undefined);
    await client.removeNetwork(network).catch(() => undefined);
    if (!built)
      await removeBuiltImage(client, reference).catch(() => undefined);
  }
}

/** Removes only the unique tag this build created, without force. */
export async function removeBuiltImage(
  client: DockerClient,
  reference: string,
) {
  if (!/^server-guy-build:[a-f0-9]{24}$/.test(reference))
    throw new Error("Not an owned application build tag.");
  const response = await client.request(
    `/images/${encodeURIComponent(reference)}?noprune=true`,
    { method: "DELETE" },
  );
  if (response.status >= 400 && response.status !== 404)
    throw new DockerError(
      "Could not remove the application build tag.",
      response.status,
    );
}
