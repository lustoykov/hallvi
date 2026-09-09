// A minimal Docker Engine API client over the local socket, plus discovery of
// the engine the controller host is configured to use. No CLI is executed:
// finding a `docker` binary proves nothing about a running engine.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir, hostname, platform, arch } from "node:os";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

import type { ExecutionEnvironmentStatus } from "./types";

export const MINIMUM_API_VERSION = "1.41";

export type DockerEndpoint =
  | {
      kind: "unix";
      path: string;
      source: ExecutionEnvironmentStatus["endpointSource"];
    }
  | { kind: "remote"; url: string; source: "DOCKER_HOST" | "docker-context" };

function contextHost(home: string): string | null {
  try {
    const config = JSON.parse(
      readFileSync(join(home, ".docker", "config.json"), "utf8"),
    ) as { currentContext?: string };
    const name = config.currentContext;
    if (!name || name === "default") return null;
    const digest = createHash("sha256").update(name).digest("hex");
    const meta = JSON.parse(
      readFileSync(
        join(home, ".docker", "contexts", "meta", digest, "meta.json"),
        "utf8",
      ),
    ) as { Endpoints?: { docker?: { Host?: string } } };
    return meta.Endpoints?.docker?.Host ?? null;
  } catch {
    return null;
  }
}

function parseHost(
  host: string,
  source: "DOCKER_HOST" | "docker-context",
): DockerEndpoint {
  if (host.startsWith("unix://"))
    return { kind: "unix", path: host.slice("unix://".length), source };
  return { kind: "remote", url: host, source };
}

/**
 * The engine this host is configured for: DOCKER_HOST, then the active
 * Docker context, then the sockets Docker Desktop, OrbStack, Colima, Rancher
 * Desktop, rootless and system engines create.
 */
export function resolveDockerEndpoint(
  env: Record<string, string | undefined> = process.env,
  home = homedir(),
  systemSocket = "/var/run/docker.sock",
): DockerEndpoint | null {
  const explicit = env.DOCKER_HOST?.trim();
  if (explicit) return parseHost(explicit, "DOCKER_HOST");
  const context = contextHost(home);
  if (context) return parseHost(context, "docker-context");
  const candidates = [
    systemSocket,
    join(home, ".docker", "run", "docker.sock"),
    join(home, ".orbstack", "run", "docker.sock"),
    join(home, ".colima", "default", "docker.sock"),
    join(home, ".colima", "docker.sock"),
    join(home, ".rd", "docker.sock"),
    ...(env.XDG_RUNTIME_DIR ? [join(env.XDG_RUNTIME_DIR, "docker.sock")] : []),
  ];
  for (const path of candidates) {
    try {
      if (statSync(path).isSocket())
        return { kind: "unix", path, source: "known-socket" };
    } catch {
      /* not there */
    }
  }
  return null;
}

export class DockerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  body?: Buffer | string | Readable;
  headers?: Record<string, string>;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Collect at most this many bytes of the response. */
  maxBytes?: number;
  onChunk?: (chunk: Buffer) => void;
}

export interface DockerResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
  truncated: boolean;
}

export interface ContainerLogs {
  stdout: string;
  stderr: string;
  combined: string;
  truncated: boolean;
}

/** Splits Docker's multiplexed log stream into stdout and stderr. */
export function demultiplex(buffer: Buffer) {
  let stdout = "";
  let stderr = "";
  let offset = 0;
  while (offset + 8 <= buffer.length) {
    const type = buffer[offset];
    const size = buffer.readUInt32BE(offset + 4);
    const chunk = buffer
      .subarray(offset + 8, offset + 8 + size)
      .toString("utf8");
    if (type === 2) stderr += chunk;
    else stdout += chunk;
    offset += 8 + size;
  }
  if (offset < buffer.length)
    stdout += buffer.subarray(offset).toString("utf8");
  return { stdout, stderr };
}

export class DockerClient {
  constructor(
    public readonly socketPath: string,
    private readonly apiVersion = "v1.41",
  ) {}

  request(path: string, options: RequestOptions = {}): Promise<DockerResponse> {
    const { method = "GET", body, headers = {}, timeoutMs = 30_000 } = options;
    const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let received = 0;
      let truncated = false;
      const req = httpRequest(
        {
          socketPath: this.socketPath,
          path: `/${this.apiVersion}${path}`,
          method,
          headers: {
            Host: "docker",
            ...(body !== undefined && !(body instanceof Readable)
              ? { "Content-Length": String(Buffer.byteLength(body)) }
              : {}),
            ...headers,
          },
          signal: options.signal,
        },
        (res) => {
          res.on("data", (chunk: Buffer) => {
            try {
              options.onChunk?.(chunk);
            } catch (error) {
              req.destroy(
                error instanceof Error ? error : new Error(String(error)),
              );
              return;
            }
            if (received >= maxBytes) {
              truncated = true;
              return;
            }
            const room = maxBytes - received;
            const kept = chunk.length > room ? chunk.subarray(0, room) : chunk;
            if (chunk.length > room) truncated = true;
            chunks.push(kept);
            received += kept.length;
          });
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks),
              truncated,
            }),
          );
          res.on("error", reject);
        },
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy(
          new DockerError(
            "The Docker Engine did not answer in time.",
            0,
            "ETIMEDOUT",
          ),
        );
      });
      req.on("error", (error: NodeJS.ErrnoException) =>
        reject(
          error instanceof DockerError
            ? error
            : new DockerError(error.message, 0, error.code),
        ),
      );
      if (body instanceof Readable) {
        void pipeline(body, req).catch(reject);
      } else {
        if (body !== undefined) req.write(body);
        req.end();
      }
    });
  }

  /** A bounded consumer must drain or destroy this stream. */
  archiveStream(
    id: string,
    path: string,
    signal?: AbortSignal,
  ): Promise<IncomingMessage> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        {
          socketPath: this.socketPath,
          path: `/${this.apiVersion}/containers/${encodeURIComponent(id)}/archive?path=${encodeURIComponent(path)}`,
          method: "GET",
          signal,
        },
        (response) => {
          if ((response.statusCode ?? 500) >= 400) {
            response.destroy();
            reject(
              new DockerError(
                "Could not read the built image archive.",
                response.statusCode ?? 500,
              ),
            );
          } else resolve(response);
        },
      );
      req.on("error", reject);
      req.setTimeout(120_000, () =>
        req.destroy(
          new DockerError("Image transfer timed out.", 0, "ETIMEDOUT"),
        ),
      );
      req.end();
    });
  }

  async json<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.request(path, options);
    const text = response.body.toString("utf8");
    if (response.status >= 400) {
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        /* plain text */
      }
      throw new DockerError(
        message || `HTTP ${response.status}`,
        response.status,
      );
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  ping() {
    return this.request("/_ping", { timeoutMs: 5_000 });
  }

  version() {
    return this.json<{
      Version: string;
      ApiVersion: string;
      MinAPIVersion?: string;
      Os: string;
      Arch: string;
      Platform?: { Name?: string };
    }>("/version", { timeoutMs: 5_000 });
  }

  info() {
    return this.json<{
      OSType: string;
      Architecture: string;
      ServerVersion: string;
      Name: string;
      SecurityOptions?: string[];
    }>("/info", { timeoutMs: 10_000 });
  }

  async inspectImage(reference: string) {
    return this.json<{
      Id: string;
      RepoDigests?: string[];
      Config?: {
        Entrypoint?: string[] | null;
        Cmd?: string[] | null;
        WorkingDir?: string;
        User?: string;
        Env?: string[];
        Labels?: Record<string, string>;
      };
    }>(`/images/${encodeURIComponent(reference)}/json`);
  }

  /** Pulls an image; progress lines are bounded and never stored verbatim. */
  async pullImage(
    reference: string,
    options: { signal?: AbortSignal; onProgress?: (line: string) => void } = {},
  ) {
    const [name, tag = "latest"] = reference.includes("@")
      ? [reference, ""]
      : splitTag(reference);
    const query = new URLSearchParams({ fromImage: name });
    if (tag) query.set("tag", tag);
    let partial = "";
    const response = await this.request(`/images/create?${query}`, {
      method: "POST",
      timeoutMs: 20 * 60_000,
      signal: options.signal,
      maxBytes: 0,
      onChunk: (chunk) => {
        partial += chunk.toString("utf8");
        const lines = partial.split("\n");
        partial = lines.pop() ?? "";
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as {
              status?: string;
              error?: string;
              progress?: string;
            };
            if (entry.error) throw new DockerError(entry.error, 500);
            if (entry.status)
              options.onProgress?.(
                `${entry.status}${entry.progress ? ` ${entry.progress}` : ""}`,
              );
          } catch (error) {
            if (error instanceof DockerError) throw error;
          }
        }
      },
    });
    if (response.status >= 400)
      throw new DockerError(
        response.body.toString("utf8") || `Could not pull ${reference}.`,
        response.status,
      );
    return this.inspectImage(reference);
  }

  createContainer(name: string, config: Record<string, unknown>) {
    return this.json<{ Id: string; Warnings?: string[] }>(
      `/containers/create?name=${encodeURIComponent(name)}`,
      {
        method: "POST",
        body: JSON.stringify(config),
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  startContainer(id: string) {
    return this.request(`/containers/${id}/start`, { method: "POST" }).then(
      (response) => {
        if (response.status >= 400)
          throw new DockerError(
            response.body.toString("utf8"),
            response.status,
          );
      },
    );
  }

  async waitContainer(
    id: string,
    options: { timeoutMs: number; signal?: AbortSignal },
  ): Promise<{ exitCode: number | null; timedOut: boolean }> {
    try {
      const result = await this.json<{ StatusCode: number }>(
        `/containers/${id}/wait`,
        {
          method: "POST",
          timeoutMs: options.timeoutMs,
          signal: options.signal,
        },
      );
      return { exitCode: result.StatusCode, timedOut: false };
    } catch (error) {
      if (error instanceof DockerError && error.code === "ETIMEDOUT")
        return { exitCode: null, timedOut: true };
      throw error;
    }
  }

  async inspectContainer(id: string) {
    return this.json<{
      Id: string;
      State: { Running: boolean; ExitCode: number; Status: string };
      NetworkSettings?: {
        Networks?: Record<string, { IPAddress?: string }>;
        Ports?: Record<
          string,
          Array<{ HostIp: string; HostPort: string }> | null
        >;
      };
    }>(`/containers/${id}/json`);
  }

  async stopContainer(id: string, seconds = 5) {
    const response = await this.request(`/containers/${id}/stop?t=${seconds}`, {
      method: "POST",
      timeoutMs: (seconds + 20) * 1000,
    });
    if (
      response.status >= 400 &&
      response.status !== 304 &&
      response.status !== 404
    )
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  async removeContainer(id: string) {
    const response = await this.request(`/containers/${id}?force=true&v=true`, {
      method: "DELETE",
    });
    if (response.status >= 400 && response.status !== 404)
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  async containerLogs(id: string, maxBytes: number): Promise<ContainerLogs> {
    const response = await this.request(
      `/containers/${id}/logs?stdout=true&stderr=true&tail=all`,
      { maxBytes: maxBytes * 2 + 4096 },
    );
    if (response.status >= 400)
      throw new DockerError(response.body.toString("utf8"), response.status);
    const { stdout, stderr } = demultiplex(response.body);
    const bound = (text: string) =>
      text.length > maxBytes ? text.slice(text.length - maxBytes) : text;
    const combined = bound(
      [stdout && `[stdout]\n${stdout}`, stderr && `[stderr]\n${stderr}`]
        .filter(Boolean)
        .join("\n"),
    );
    return {
      stdout: bound(stdout),
      stderr: bound(stderr),
      combined,
      truncated:
        response.truncated ||
        stdout.length > maxBytes ||
        stderr.length > maxBytes,
    };
  }

  async putArchive(id: string, path: string, tar: Buffer) {
    const response = await this.request(
      `/containers/${id}/archive?path=${encodeURIComponent(path)}`,
      {
        method: "PUT",
        body: tar,
        headers: { "Content-Type": "application/x-tar" },
        timeoutMs: 120_000,
      },
    );
    if (response.status >= 400)
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  createNetwork(
    name: string,
    labels: Record<string, string>,
    internal: boolean,
  ) {
    return this.json<{ Id: string }>("/networks/create", {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        Driver: "bridge",
        Internal: internal,
        Labels: labels,
      }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async connectNetwork(
    network: string,
    container: string,
    aliases: string[] = [],
  ) {
    const response = await this.request(`/networks/${network}/connect`, {
      method: "POST",
      body: JSON.stringify({
        Container: container,
        EndpointConfig: aliases.length ? { Aliases: aliases } : undefined,
      }),
      headers: { "Content-Type": "application/json" },
    });
    if (response.status >= 400)
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  async removeNetwork(name: string) {
    const response = await this.request(`/networks/${name}`, {
      method: "DELETE",
    });
    if (response.status >= 400 && response.status !== 404)
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  createVolume(name: string, labels: Record<string, string>) {
    return this.json<{ Name: string }>("/volumes/create", {
      method: "POST",
      body: JSON.stringify({ Name: name, Labels: labels }),
      headers: { "Content-Type": "application/json" },
    });
  }

  async removeVolume(name: string) {
    const response = await this.request(`/volumes/${name}?force=true`, {
      method: "DELETE",
    });
    if (response.status >= 400 && response.status !== 404)
      throw new DockerError(response.body.toString("utf8"), response.status);
  }

  listContainers(labels: Record<string, string>) {
    const filters = JSON.stringify({
      label: Object.entries(labels).map(([key, value]) => `${key}=${value}`),
    });
    return this.json<
      Array<{ Id: string; Names: string[]; Labels: Record<string, string> }>
    >(`/containers/json?all=true&filters=${encodeURIComponent(filters)}`);
  }

  listImages(labels: Record<string, string>) {
    const filters = JSON.stringify({
      label: Object.entries(labels).map(([key, value]) => `${key}=${value}`),
    });
    return this.json<
      Array<{
        Id: string;
        RepoTags?: string[];
        Labels?: Record<string, string>;
      }>
    >(`/images/json?filters=${encodeURIComponent(filters)}`);
  }

  listNetworks(labels: Record<string, string>) {
    const filters = JSON.stringify({
      label: Object.entries(labels).map(([key, value]) => `${key}=${value}`),
    });
    return this.json<
      Array<{ Id: string; Name: string; Labels?: Record<string, string> }>
    >(`/networks?filters=${encodeURIComponent(filters)}`);
  }

  async listVolumes(labels: Record<string, string>) {
    const filters = JSON.stringify({
      label: Object.entries(labels).map(([key, value]) => `${key}=${value}`),
    });
    const result = await this.json<{
      Volumes: Array<{ Name: string; Labels?: Record<string, string> }> | null;
    }>(`/volumes?filters=${encodeURIComponent(filters)}`);
    return result.Volumes ?? [];
  }
}

function splitTag(reference: string): [string, string] {
  const slash = reference.lastIndexOf("/");
  const colon = reference.lastIndexOf(":");
  return colon > slash
    ? [reference.slice(0, colon), reference.slice(colon + 1)]
    : [reference, "latest"];
}

function compareVersions(a: string, b: string) {
  const [aMajor, aMinor] = a.split(".").map(Number);
  const [bMajor, bMinor] = b.split(".").map(Number);
  return aMajor === bMajor ? aMinor - bMinor : aMajor - bMajor;
}

const INSTALL_DOCS = "https://docs.docker.com/engine/install/";
const GET_DOCKER_DOCS = "https://docs.docker.com/get-started/get-docker/";

function hostInfo() {
  return { hostname: hostname(), platform: platform(), arch: arch() };
}

function baseStatus(
  state: ExecutionEnvironmentStatus["state"],
  endpoint: DockerEndpoint | null,
): Omit<ExecutionEnvironmentStatus, "summary" | "recovery" | "detail"> {
  return {
    state,
    ready: state === "ready",
    checkedAt: new Date().toISOString(),
    host: hostInfo(),
    endpoint:
      endpoint?.kind === "unix"
        ? `unix://${endpoint.path}`
        : (endpoint?.url ?? null),
    endpointSource: endpoint?.source ?? null,
    engine: null,
    verified: null,
  };
}

function startSteps(host: ReturnType<typeof hostInfo>) {
  return host.platform === "darwin"
    ? [
        "Open Docker Desktop, OrbStack or Colima on this Mac and wait until it reports the engine as running.",
        "Then choose Check again.",
      ]
    : host.platform === "linux"
      ? [
          "Start the engine, for example: sudo systemctl start docker",
          "Then choose Check again.",
        ]
      : [
          "Start Docker Desktop and wait until the engine reports running.",
          "Then choose Check again.",
        ];
}

/**
 * Connects to the configured engine and classifies what the evidence shows.
 * A missing socket is reported as not found, a socket nobody answers on as
 * unreachable, a refused connection as permission denied, and a remote or
 * non-Linux engine as unsupported by this build.
 */
export async function discoverExecutionEnvironment(
  options: {
    env?: Record<string, string | undefined>;
    home?: string;
    systemSocket?: string;
  } = {},
): Promise<ExecutionEnvironmentStatus> {
  const endpoint = resolveDockerEndpoint(
    options.env,
    options.home,
    options.systemSocket,
  );
  const host = hostInfo();
  const where = `${host.hostname} (${host.platform}/${host.arch}), the machine running Server Guy`;
  if (!endpoint)
    return {
      ...baseStatus("not-found", null),
      summary: `No Docker Engine was found on ${where}: DOCKER_HOST is not set, no Docker context is selected and none of the known engine sockets exist.`,
      recovery: {
        label: "Install Docker Engine (official instructions)",
        href: host.platform === "linux" ? INSTALL_DOCS : GET_DOCKER_DOCS,
        steps: [
          "Install Docker Engine (any distribution that exposes the standard engine socket works; Docker Desktop is not required).",
          "Start it once so its socket exists, then choose Check again.",
        ],
      },
      detail:
        "Checked DOCKER_HOST, ~/.docker/config.json currentContext and the standard socket paths.",
    };
  if (endpoint.kind === "remote")
    return {
      ...baseStatus("unsupported", endpoint),
      summary: `The configured Docker endpoint on ${where} is remote (${endpoint.url}); this build only executes through a local engine socket because it must copy source trees into containers.`,
      recovery: {
        label: "Use a local engine",
        href: GET_DOCKER_DOCS,
        steps: [
          "Point DOCKER_HOST or the active Docker context at a local unix socket, or unset them so the default socket is used.",
          "Then choose Check again.",
        ],
      },
      detail: `Endpoint from ${endpoint.source}.`,
    };
  try {
    if (!statSync(endpoint.path).isSocket()) throw new Error("not a socket");
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EACCES" || code === "EPERM")
      return {
        ...baseStatus("permission-denied", endpoint),
        summary: `The Docker socket on ${where} exists but this user account may not open it.`,
        recovery: {
          label: "Fix socket permissions",
          href: INSTALL_DOCS,
          steps: [
            host.platform === "linux"
              ? "Add your user to the docker group (sudo usermod -aG docker $USER), sign in again, or use rootless Docker."
              : "Check the socket's ownership and permissions, or restart the engine that owns it.",
            "Then choose Check again.",
          ],
        },
        detail: `${code} on ${endpoint.path}`,
      };
    return {
      ...baseStatus("not-found", endpoint),
      summary: `The Docker socket ${endpoint.path} does not exist on ${where}. Docker may not be installed, or its engine has never run.`,
      recovery: {
        label: "Install or start Docker Engine",
        href: host.platform === "linux" ? INSTALL_DOCS : GET_DOCKER_DOCS,
        steps: [
          "If Docker is installed, start it so the engine creates its socket; otherwise install Docker Engine.",
          "Then choose Check again.",
        ],
      },
      detail: `${code ?? "missing"} on ${endpoint.path} (from ${endpoint.source}).`,
    };
  }
  const client = new DockerClient(endpoint.path);
  try {
    await client.ping();
  } catch (error) {
    const code = (error as DockerError).code;
    if (code === "EACCES" || code === "EPERM")
      return {
        ...baseStatus("permission-denied", endpoint),
        summary: `The Docker Engine socket on ${where} refused this user account.`,
        recovery: {
          label: "Fix socket permissions",
          href: INSTALL_DOCS,
          steps: [
            host.platform === "linux"
              ? "Add your user to the docker group (sudo usermod -aG docker $USER) and sign in again, or use rootless Docker."
              : "Check the socket's ownership and permissions.",
            "Then choose Check again.",
          ],
        },
        detail: `${code} connecting to ${endpoint.path}`,
      };
    return {
      ...baseStatus("unreachable", endpoint),
      summary: `Docker is installed on ${where} but its engine is not answering on ${endpoint.path}; it is probably stopped.`,
      recovery: {
        label: "Start the Docker engine",
        href: GET_DOCKER_DOCS,
        steps: startSteps(host),
      },
      detail: `${code ?? "no response"} connecting to ${endpoint.path}`,
    };
  }
  try {
    const [version, info] = await Promise.all([
      client.version(),
      client.info(),
    ]);
    const engine = {
      version: version.Version,
      apiVersion: version.ApiVersion,
      platform: version.Platform?.Name ?? info.Name,
      os: info.OSType,
      arch: info.Architecture,
    };
    if (info.OSType !== "linux")
      return {
        ...baseStatus("unsupported", endpoint),
        engine,
        summary: `The engine on ${where} runs ${info.OSType} containers; the runner needs a Linux engine.`,
        recovery: {
          label: "Switch to Linux containers",
          href: GET_DOCKER_DOCS,
          steps: [
            "Switch the engine to Linux containers, then choose Check again.",
          ],
        },
        detail: `OSType ${info.OSType}`,
      };
    if (compareVersions(version.ApiVersion, MINIMUM_API_VERSION) < 0)
      return {
        ...baseStatus("unsupported", endpoint),
        engine,
        summary: `The engine on ${where} speaks Docker API ${version.ApiVersion}; the runner needs ${MINIMUM_API_VERSION} or newer.`,
        recovery: {
          label: "Update Docker Engine",
          href: INSTALL_DOCS,
          steps: ["Update the engine, then choose Check again."],
        },
        detail: `API ${version.ApiVersion} < ${MINIMUM_API_VERSION}`,
      };
    return {
      ...baseStatus("ready", endpoint),
      engine,
      summary: `Docker Engine ${version.Version} (${engine.platform}) is reachable on ${where} through ${endpoint.path}.`,
      recovery: {
        label: "Prepare the execution environment",
        href: null,
        steps: [],
      },
      detail: `API ${version.ApiVersion} · ${info.OSType}/${info.Architecture} · endpoint from ${endpoint.source}`,
    };
  } catch (error) {
    return {
      ...baseStatus("unreachable", endpoint),
      summary: `The Docker Engine on ${where} answered a ping but not a version request; it may still be starting.`,
      recovery: {
        label: "Wait for the engine to finish starting",
        href: GET_DOCKER_DOCS,
        steps: startSteps(host),
      },
      detail: error instanceof Error ? error.message : "unknown error",
    };
  }
}

export function dockerClientFor(status: ExecutionEnvironmentStatus) {
  if (!status.ready || !status.endpoint?.startsWith("unix://")) return null;
  return new DockerClient(status.endpoint.slice("unix://".length));
}
