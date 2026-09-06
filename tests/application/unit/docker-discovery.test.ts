import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  demultiplex,
  discoverExecutionEnvironment,
  resolveDockerEndpoint,
} from "../../../src/server/docker";

const servers: Server[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function home() {
  const root = mkdtempSync(join(tmpdir(), "sg-docker-"));
  roots.push(root);
  return root;
}

function engine(
  socketPath: string,
  info: Partial<{ OSType: string; ApiVersion: string; Version: string }> = {},
) {
  const server = createServer((request, response) => {
    if (request.url?.endsWith("/_ping")) {
      response.writeHead(200);
      response.end("OK");
    } else if (request.url?.endsWith("/version")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          Version: info.Version ?? "28.5.1",
          ApiVersion: info.ApiVersion ?? "1.51",
          Os: "linux",
          Arch: "arm64",
          Platform: { Name: "Synthetic Engine" },
        }),
      );
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          OSType: info.OSType ?? "linux",
          Architecture: "aarch64",
          ServerVersion: info.Version ?? "28.5.1",
          Name: "synthetic",
        }),
      );
    }
  });
  servers.push(server);
  return new Promise<void>((resolve) => server.listen(socketPath, resolve));
}

describe("execution environment discovery", () => {
  it("prefers DOCKER_HOST, then the Docker context, then known sockets", async () => {
    const root = home();
    expect(
      resolveDockerEndpoint({ DOCKER_HOST: "unix:///x/docker.sock" }, root),
    ).toEqual({
      kind: "unix",
      path: "/x/docker.sock",
      source: "DOCKER_HOST",
    });
    expect(
      resolveDockerEndpoint({ DOCKER_HOST: "tcp://10.0.0.5:2376" }, root),
    ).toMatchObject({
      kind: "remote",
      source: "DOCKER_HOST",
    });
    mkdirSync(join(root, ".docker", "contexts", "meta", "a".repeat(64)), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".docker", "config.json"),
      JSON.stringify({ currentContext: "desktop-linux" }),
    );
    const digest = (await import("node:crypto"))
      .createHash("sha256")
      .update("desktop-linux")
      .digest("hex");
    mkdirSync(join(root, ".docker", "contexts", "meta", digest), {
      recursive: true,
    });
    writeFileSync(
      join(root, ".docker", "contexts", "meta", digest, "meta.json"),
      JSON.stringify({
        Endpoints: {
          docker: { Host: `unix://${root}/.docker/run/docker.sock` },
        },
      }),
    );
    expect(resolveDockerEndpoint({}, root)).toEqual({
      kind: "unix",
      path: `${root}/.docker/run/docker.sock`,
      source: "docker-context",
    });
    expect(
      resolveDockerEndpoint({}, home(), "/nonexistent/docker.sock"),
    ).toBeNull();
  });

  it("classifies a missing socket, a socket nobody answers on, and a reachable engine", async () => {
    const root = home();
    const missing = await discoverExecutionEnvironment({
      env: { DOCKER_HOST: `unix://${root}/none.sock` },
      home: root,
    });
    expect(missing.state).toBe("not-found");
    expect(missing.summary).toContain("does not exist");
    expect(missing.summary).not.toContain("not installed.");
    expect(missing.recovery.href).toMatch(/docs\.docker\.com/);
    expect(missing.host.hostname.length).toBeGreaterThan(0);

    // A socket that exists but whose owner drops every connection: the
    // engine is installed but not answering.
    const path = join(root, "engine.sock");
    const silent = createServer();
    silent.on("connection", (socket) => socket.destroy());
    servers.push(silent);
    await new Promise<void>((resolve) => silent.listen(path, resolve));
    const stopped = await discoverExecutionEnvironment({
      env: { DOCKER_HOST: `unix://${path}` },
      home: root,
    });
    expect(stopped.state).toBe("unreachable");
    expect(stopped.summary).toContain("not answering");
    expect(stopped.recovery.steps.at(-1)).toBe("Then choose Check again.");

    const live = join(root, "live.sock");
    await engine(live);
    const ready = await discoverExecutionEnvironment({
      env: { DOCKER_HOST: `unix://${live}` },
      home: root,
    });
    expect(ready).toMatchObject({
      state: "ready",
      ready: true,
      endpointSource: "DOCKER_HOST",
      engine: { version: "28.5.1", apiVersion: "1.51", os: "linux" },
    });
    expect(ready.summary).toContain("Synthetic Engine");
  });

  it("reports remote endpoints, non-Linux engines and old APIs as unsupported, never as missing", async () => {
    const root = home();
    const remote = await discoverExecutionEnvironment({
      env: { DOCKER_HOST: "ssh://user@host" },
      home: root,
    });
    expect(remote.state).toBe("unsupported");
    expect(remote.summary).toContain("remote");
    const windows = join(root, "win.sock");
    await engine(windows, { OSType: "windows" });
    expect(
      (
        await discoverExecutionEnvironment({
          env: { DOCKER_HOST: `unix://${windows}` },
          home: root,
        })
      ).state,
    ).toBe("unsupported");
    const old = join(root, "old.sock");
    await engine(old, { ApiVersion: "1.24" });
    const status = await discoverExecutionEnvironment({
      env: { DOCKER_HOST: `unix://${old}` },
      home: root,
    });
    expect(status.state).toBe("unsupported");
    expect(status.summary).toContain("1.41");
  });

  it("splits multiplexed log streams", () => {
    const frame = (type: number, text: string) => {
      const payload = Buffer.from(text);
      const header = Buffer.alloc(8);
      header[0] = type;
      header.writeUInt32BE(payload.length, 4);
      return Buffer.concat([header, payload]);
    };
    expect(
      demultiplex(
        Buffer.concat([frame(1, "out\n"), frame(2, "err\n"), frame(1, "more")]),
      ),
    ).toEqual({
      stdout: "out\nmore",
      stderr: "err\n",
    });
  });
});
