// A Run's Pi workspace against a synthetic Docker Engine on a unix socket:
// the real Docker client and transport, no containers. The real-container
// proof is the opt-in pi-workspace.docker.test.ts.
import * as sdk from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import type { Duplex } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  createTemporaryRoot,
  removeTemporaryRoot,
} from "../../temporary-root.mjs";
import { readTar } from "../../../src/server/tar";

const discovery = vi.hoisted(() => ({ missing: false }));
const imagePinning = vi.hoisted(() => ({
  calls: [] as Array<{ reference: string; architecture?: string }>,
}));
vi.mock("../../../src/server/docker", async (original) => {
  const actual = await original<typeof import("../../../src/server/docker")>();
  return {
    ...actual,
    resolveDockerEndpoint: (
      ...args: Parameters<typeof actual.resolveDockerEndpoint>
    ) => (discovery.missing ? null : actual.resolveDockerEndpoint(...args)),
  };
});
// Pinning the base image asks a public registry; these tests stay offline.
vi.mock("../../../src/server/container-images", async (original) => ({
  ...(await original<typeof import("../../../src/server/container-images")>()),
  pinContainerImage: async (
    reference: string,
    _signal: AbortSignal,
    architecture?: string,
  ) => {
    imagePinning.calls.push({ reference, architecture });
    return `${reference}@sha256:${"0".repeat(64)}`;
  },
}));

import {
  PiWorkspace,
  piWorkspaceTools,
} from "../../../src/server/pi-workspace";

type Exec = { container: string; name: string; id: string; args: unknown };
type Answer = (exec: Exec, response: ServerResponse) => void;
type Mount = { Type: string };

const variables = [
  "DOCKER_HOST",
  "HALLVI_DB_PATH",
  "HALLVI_PROBE_TOKEN",
] as const;
const saved = Object.fromEntries(
  variables.map((name) => [name, process.env[name]]),
);
let root: string;
let server: Server;
let engine: ReturnType<typeof syntheticEngine>;

/** Docker's multiplexed stdout frame. */
function frame(text: string) {
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(Buffer.byteLength(text), 4);
  return Buffer.concat([header, Buffer.from(text)]);
}

function syntheticEngine() {
  const state = {
    sockets: new Set<Duplex>(),
    prepare: undefined as undefined | ((response: ServerResponse) => void),
    requests: [] as Array<{
      method: string;
      path: string;
      url: string;
      body: Buffer;
    }>,
    architecture: "arm64",
    containers: [] as Array<{
      id: string;
      config: { HostConfig: Record<string, unknown> };
    }>,
    started: [] as string[],
    removed: [] as string[],
    volumes: [] as string[],
    removedVolumes: [] as string[],
    execs: [] as Exec[],
    // How a started exec answers. Default: the bridge's successful result.
    answer: ((exec, response) => {
      response.writeHead(200);
      response.end(
        frame(
          JSON.stringify({
            result: {
              content: [
                { type: "text", text: `${exec.name} ran in ${exec.container}` },
              ],
              details: {},
            },
          }),
        ),
      );
    }) as Answer,
  };
  let image = false;
  server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks);
    const path = new URL(request.url!, "http://docker").pathname.replace(
      /^\/v[\d.]+/,
      "",
    );
    state.requests.push({
      method: request.method!,
      path,
      url: request.url!,
      body,
    });
    const reply = (status: number, value?: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(value === undefined ? undefined : JSON.stringify(value));
    };
    if (path === "/info")
      return reply(200, { Architecture: state.architecture });
    const [, kind, id, action] = path.split("/");
    if (kind === "images")
      return image
        ? reply(200, { Id: "sha256:workspace" })
        : reply(404, { message: "No such image" });
    if (kind === "build") {
      if (state.prepare) return state.prepare(response);
      image = true;
      return reply(200, { stream: "built" });
    }
    if (kind === "volumes") {
      if (request.method === "DELETE") {
        state.removedVolumes.push(id);
        return reply(204);
      }
      const { Name } = JSON.parse(body.toString()) as { Name: string };
      state.volumes.push(Name);
      return reply(201, { Name });
    }
    if (kind === "exec")
      return action === "json"
        ? reply(200, { Running: false })
        : state.answer(state.execs[Number(id)], response);
    if (kind !== "containers") return reply(404, { message: path });
    if (id === "create") {
      const created = {
        id: `container-${state.containers.length + 1}`,
        config: JSON.parse(body.toString()),
      };
      state.containers.push(created);
      return reply(201, { Id: created.id });
    }
    if (state.removed.includes(id))
      return reply(404, { message: `No such container: ${id}` });
    if (request.method === "DELETE") {
      state.removed.push(id);
      return reply(204);
    }
    if (action === "start") state.started.push(id);
    if (action === "exec") {
      const { Cmd, AttachStdin } = JSON.parse(body.toString());
      expect(Cmd).toEqual(["node", "/opt/pi/bridge.mjs"]);
      expect(AttachStdin).toBe(true);
      state.execs.push({ container: id, name: "", id: "", args: {} });
      return reply(201, { Id: String(state.execs.length - 1) });
    }
    if (action === "archive" && request.method === "GET") {
      response.writeHead(200);
      return response.end(Buffer.alloc(1024));
    }
    reply(action === "start" || action === "stop" ? 204 : 200);
  });
  server.on("upgrade", (request, socket, head) => {
    socket.allowHalfOpen = true;
    state.sockets.add(socket);
    socket.once("close", () => state.sockets.delete(socket));
    socket.on("error", () => undefined);
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n",
    );
    const chunks = [head];
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => {
      // Everything after the upgrade is the tool's stdin. Whether the HTTP
      // request body precedes it in this stream depends on when Node's
      // parser hands the socket over — with the body in the upgrade head, or
      // already consumed and head empty. Both are valid HTTP and the real
      // engine takes either, so the body is skipped only when it is there.
      const all = Buffer.concat(chunks);
      const body = Number(request.headers["content-length"] ?? 0);
      const read = () => {
        for (const candidate of [all, all.subarray(body)]) {
          try {
            return JSON.parse(candidate.toString());
          } catch {
            /* the other layout */
          }
        }
        throw new Error(
          `Synthetic engine could not read tool stdin from ${all.length} bytes: ${all.toString().slice(0, 120)}`,
        );
      };
      const execIndex = Number(request.url!.split("/").at(-2));
      Object.assign(state.execs[execIndex], read());
      state.answer(state.execs[execIndex], {
        writeHead: () => undefined,
        end: (data: Buffer) => socket.end(data),
        socket,
      } as unknown as ServerResponse);
    });
  });
  return state;
}

beforeEach(async () => {
  root = createTemporaryRoot("/tmp/hallvi-pi-workspace-");
  // Workspace ownership labels and event logs belong to this scratch root.
  process.env.HALLVI_DB_PATH = join(root, "hallvi.db");
  process.env.DOCKER_HOST = `unix://${join(root, "docker.sock")}`;
  discovery.missing = false;
  imagePinning.calls = [];
  engine = syntheticEngine();
  await new Promise<void>((resolve) =>
    server.listen(join(root, "docker.sock"), resolve),
  );
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const socket of engine.sockets) socket.destroy();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  for (const name of variables)
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  removeTemporaryRoot(root);
});

it("starts one isolated container on first use and keeps a Run's sequential calls in it", async () => {
  const secret = `ghp_${"S".repeat(36)}`;
  process.env.HALLVI_PROBE_TOKEN = secret;
  const file = (path: string, content: string) => ({
    path,
    mode: 0o644,
    content: Buffer.from(content),
  });
  const source = vi.fn(async () => ({
    description: "qa/example@abc123",
    files: [
      file("src/server.js", "listen(3000)\n"),
      file("src/config.js", `export const token = "${secret}";\n`),
      file(".env.example", "TOKEN=\n"),
      file(".env", `TOKEN=${secret}\n`),
      file("deploy/id_ed25519", "private key\n"),
    ],
  }));
  const tools = piWorkspaceTools(
    sdk,
    new PiWorkspace({ applicationId: "app-a", chatId: "run-a", source }),
  );
  const call = (name: string, id: string, args: object) =>
    tools.find((tool) => tool.name === name)!.execute(id, args);
  expect(engine.requests).toEqual([]);

  const edit = tools.find((tool) => tool.name === "edit")!;
  const legacyEdit = { path: "file", oldText: "old", newText: "new" };
  expect(edit.prepareArguments!(legacyEdit)).toEqual(
    sdk.createEditToolDefinition("/workspace").prepareArguments!(legacyEdit),
  );

  const first = await call("write", "first", {
    path: "check.sh",
    content: "echo ok",
  });
  const second = await call("bash", "second", { command: "sh check.sh" });

  // One model namespace, alive across calls; the snapshot is loaded once.
  expect(engine.started).toHaveLength(1);
  const [namespace] = engine.started;
  expect([first, second]).toEqual([
    {
      content: [{ type: "text", text: `write ran in ${namespace}` }],
      details: {},
    },
    {
      content: [{ type: "text", text: `bash ran in ${namespace}` }],
      details: {},
    },
  ]);
  expect(
    engine.execs.map(({ name, id, args }) => ({ name, id, args })),
  ).toEqual([
    {
      name: "write",
      id: "first",
      args: { path: "check.sh", content: "echo ok" },
    },
    { name: "bash", id: "second", args: { command: "sh check.sh" } },
  ]);
  expect(engine.removed).not.toContain(namespace);
  expect(engine.removedVolumes).toEqual([]);
  expect(source).toHaveBeenCalledOnce();

  // The image holds only the workspace runtime, pinned to the controller's
  // Pi SDK version; never the controller tree.
  const context = readTar(
    engine.requests.find((request) => request.path === "/build")!.body,
  );
  expect(context.map((entry) => entry.path).sort()).toEqual([
    "Dockerfile",
    "bridge.mjs",
    "package.json",
  ]);
  const runtime = JSON.parse(
    context.find((entry) => entry.path === "package.json")!.content.toString(),
  );
  const controller = JSON.parse(readFileSync("package.json", "utf8"));
  expect(runtime.dependencies).toEqual({
    "@earendil-works/pi-coding-agent":
      controller.dependencies["@earendil-works/pi-coding-agent"],
  });
  expect(imagePinning.calls).toEqual([
    { reference: "node:24-bookworm-slim", architecture: "arm64" },
  ]);
  const buildUrl = engine.requests.find(
    (request) => request.path === "/build",
  )!.url;
  const buildQuery = new URL(buildUrl, "http://docker").searchParams;
  expect(buildQuery.get("platform")).toBe("linux/arm64");
  expect(JSON.parse(buildQuery.get("buildargs")!)).toEqual({
    WORKSPACE_ARCH: "arm64",
  });

  // No network, host paths, Docker socket or controller credentials reach any
  // container, including one that loads the snapshot.
  for (const { config } of engine.containers) {
    expect(config.HostConfig.NetworkMode).toBe("none");
    expect(config.HostConfig.Binds ?? []).toEqual([]);
    expect(
      ((config.HostConfig.Mounts ?? []) as Mount[]).filter(
        (mount) => mount.Type === "bind",
      ),
    ).toEqual([]);
    expect(config.HostConfig.Privileged ?? false).toBe(false);
  }
  const sent = engine.requests.map((request) => request.body.toString());
  expect(sent.join("\n")).not.toContain(secret);
  expect(sent.join("\n")).not.toContain("docker.sock");

  // The selected snapshot arrives without credential-bearing paths.
  const seeded = readTar(
    engine.requests.find((request) => request.method === "PUT")!.body,
  );
  expect(
    seeded
      .filter((entry) => entry.type === "file")
      .map((entry) => entry.path)
      .sort(),
  ).toEqual([
    ".env.example",
    ".hallvi-source.txt",
    "src/config.js",
    "src/server.js",
  ]);
  expect(
    seeded
      .find((entry) => entry.path === ".hallvi-source.txt")!
      .content.toString(),
  ).toContain("qa/example@abc123");
});

it("cancels during shared runtime preparation without creating a late workspace", async () => {
  let preparation: ServerResponse | undefined;
  engine.prepare = (response) => {
    preparation = response;
  };
  const call = new AbortController();
  const workspace = new PiWorkspace({
    applicationId: "app-a",
    chatId: "run-a",
  });
  const result = workspace.execute("ls", "first", {}, call.signal);
  const rejected = expect(result).rejects.toThrow();
  await vi.waitFor(() => expect(preparation).toBeDefined());
  call.abort();
  await rejected;
  expect(engine.containers).toEqual([]);
  preparation!.end(JSON.stringify({ error: "fixture build ended" }));
  await workspace.dispose();
  expect(engine.containers).toEqual([]);
});

it("reports a missing Docker Engine as tool feedback and never runs the built-in on the controller", async () => {
  discovery.missing = true;
  const target = join(root, "controller.txt");
  const tools = piWorkspaceTools(
    sdk,
    new PiWorkspace({ applicationId: "app-a", chatId: "run-a" }),
  );
  for (const [name, args] of [
    ["write", { path: target, content: "from Pi" }],
    ["bash", { command: `touch ${target}` }],
  ] as const)
    await expect(
      tools.find((tool) => tool.name === name)!.execute(name, args),
    ).rejects.toThrow(/Docker Engine/);
  expect(existsSync(target)).toBe(false);
  expect(engine.requests).toEqual([]);
});

const interruptions: Array<[string, (call: AbortController) => Answer]> = [
  ["the call is cancelled", (call) => () => call.abort()],
  [
    "its deadline passes",
    () => {
      const deadline = new AbortController();
      vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
      return () =>
        deadline.abort(new DOMException("Deadline passed", "TimeoutError"));
    },
  ],
  [
    "the Docker connection drops",
    () => (_exec, response) => response.socket?.destroy(),
  ],
];

it.each(interruptions)(
  "removes the Run's namespace and replays nothing when %s mid-command",
  async (_case, interrupt) => {
    const call = new AbortController();
    engine.answer = interrupt(call);
    const workspace = new PiWorkspace({
      applicationId: "app-a",
      chatId: "run-a",
    });
    await expect(
      workspace.execute("bash", "long", { command: "sleep 600" }, call.signal),
    ).rejects.toThrow();
    // Work may still be running inside; the container and its files must go.
    const [namespace] = engine.started;
    expect(engine.removed).toContain(namespace);
    expect(engine.removedVolumes).toEqual(engine.volumes);
    const created = engine.containers.length;
    await expect(
      workspace.execute("bash", "next", { command: "true" }),
    ).rejects.toThrow();
    expect(engine.containers).toHaveLength(created);
    expect(engine.execs.map((exec) => exec.id)).toEqual(["long"]);
  },
);

it("streams split Docker frames and UTF-8 before the final result arrives", async () => {
  const workspace = new PiWorkspace({
    applicationId: "app-stream",
    chatId: "run-stream",
  });
  const updates: unknown[] = [];
  let finish: () => void = () => {};
  engine.answer = (_exec, response) => {
    const partial =
      JSON.stringify({
        partial: { content: [{ type: "text", text: "tick-é\n" }] },
      }) + "\n";
    const data = Buffer.from(partial);
    const split = data.indexOf(Buffer.from("é")) + 1;
    // Build frames with the original bytes, including the split multibyte char.
    const pack = (payload: Buffer) => {
      const header = Buffer.alloc(8);
      header[0] = 1;
      header.writeUInt32BE(payload.length, 4);
      return Buffer.concat([header, payload]);
    };
    const framed = Buffer.concat([
      pack(data.subarray(0, split)),
      pack(data.subarray(split)),
    ]);
    response.socket!.write(framed.subarray(0, 5));
    setImmediate(() => response.socket!.write(framed.subarray(5)));
    finish = () =>
      response.end(
        frame(
          JSON.stringify({
            result: { content: [{ type: "text", text: "done" }] },
          }) + "\n",
        ),
      );
  };
  let completed = false;
  const call = workspace
    .execute(
      "bash",
      "stream",
      { command: "printf ticks" },
      undefined,
      (value) => updates.push(value),
    )
    .then((value) => {
      completed = true;
      return value;
    });
  try {
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      content: [{ type: "text", text: "tick-é\n" }],
    });
    expect(completed).toBe(false);
  } finally {
    finish();
  }
  expect(await call).toEqual({ content: [{ type: "text", text: "done" }] });
  await workspace.dispose();
});
