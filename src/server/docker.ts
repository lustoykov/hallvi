// A minimal Docker Engine API client over the local socket the controller
// host is configured to use, for Pi's disposable workspace. No CLI is
// executed: finding a `docker` binary proves nothing about a running engine.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";

export type DockerEndpoint =
  | {
      kind: "unix";
      path: string;
      source: "DOCKER_HOST" | "docker-context" | "known-socket";
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
  /** Input for an attached Docker exec, sent after the HTTP upgrade. */
  stdin?: Buffer;
}

export interface DockerResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
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
      const receive = (chunk: Buffer) => {
        options.onChunk?.(chunk);
        if (received >= maxBytes) {
          truncated = true;
          return;
        }
        const room = maxBytes - received;
        if (chunk.length > room) truncated = true;
        const kept = chunk.subarray(0, room);
        chunks.push(kept);
        received += kept.length;
      };
      const finish = (res: IncomingMessage) =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
          truncated,
        });
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
            ...(options.stdin ? { Connection: "Upgrade", Upgrade: "tcp" } : {}),
            ...headers,
          },
          signal: options.signal,
        },
        (res) => {
          res.on("data", (chunk: Buffer) => {
            try {
              receive(chunk);
            } catch (error) {
              req.destroy(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          });
          res.on("end", () => finish(res));
          res.on("error", reject);
        },
      );
      if (options.stdin)
        req.on("upgrade", (res, socket, head) => {
          const abort = () =>
            socket.destroy(
              new DockerError(
                "Workspace execution interrupted.",
                0,
                "ABORT_ERR",
              ),
            );
          options.signal?.addEventListener("abort", abort, { once: true });
          let ended = false;
          socket.once("close", () => {
            options.signal?.removeEventListener("abort", abort);
            if (!ended)
              reject(
                new DockerError(
                  "Docker exec connection closed before its result completed.",
                  0,
                  "ECONNRESET",
                ),
              );
          });
          socket.on("error", reject);
          socket.setTimeout(timeoutMs, () =>
            socket.destroy(
              new DockerError(
                "The Docker Engine did not answer in time.",
                0,
                "ETIMEDOUT",
              ),
            ),
          );
          socket.on("data", (chunk: Buffer) => {
            try {
              receive(chunk);
            } catch (error) {
              socket.destroy(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          });
          socket.on("end", () => {
            ended = true;
            finish(res);
          });
          try {
            if (head.length) receive(head);
            if (options.signal?.aborted) abort();
            else socket.end(options.stdin!);
          } catch (error) {
            socket.destroy(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        });
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

  createVolume(
    name: string,
    labels: Record<string, string>,
    driverOptions?: Record<string, string>,
  ) {
    return this.json<{ Name: string }>("/volumes/create", {
      method: "POST",
      body: JSON.stringify({
        Name: name,
        Labels: labels,
        ...(driverOptions
          ? { Driver: "local", DriverOpts: driverOptions }
          : {}),
      }),
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
