// Opt-in (SG_RUN_DOCKER_PROOF=1): native Compose first deployments and
// releases through the real worker, approval route, operation boundary,
// pinned resolver and locked executor, against local Docker. Stand-ins: the
// SSH transport runs the host script locally, the provider API is a fake that
// "creates" this machine, and a scripted Pi submits files a model would
// author. SG_RUN_PI_PROOF runs the configured model instead.
import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { pushTestDatabase } from "../../test-database";

const host = vi.hoisted(() => ({
  id: "",
  root: "",
  endpoint: "",
  head: "",
  loseResult: false,
  executions: 0,
  trees: {} as Record<
    string,
    { path: string; mode: number; content: Buffer }[]
  >,
  pi: null as null | ((options: never) => Promise<void>),
  /** A scripted Pi session for planners that run through the SDK. */
  session: null as null | ((tools: unknown[]) => Promise<void>),
  /** What the fake provider API created. */
  cloud: {
    servers: [] as Record<string, unknown>[],
    firewall: null as null | Record<string, unknown>,
  },
  prepared: [] as {
    stage?: string;
    compose: string[];
    files: string[];
    criterion: boolean;
    accepted: boolean;
    message?: string;
  }[],
}));
const platform = { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" };
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  const local = (command: string) => {
    // A new host's preparation: the fixture has no cloud-init, the metadata
    // guard changes host firewall rules and never runs on this machine, and
    // the controller reaches the "host" over loopback.
    if (command.includes("cloud-init status --wait"))
      return "docker compose version";
    if (command.includes("server-guy-metadata-guard")) return "true";
    if (command.includes("$SSH_CONNECTION"))
      return "printf '%s' '127.0.0.1 50000 127.0.0.1 22'";
    return command
      .replace(/^flock -n \S+ /, "")
      .replaceAll(`/opt/server-guy/${host.id}`, host.root);
  };
  /** The loopback port of the stack's published web listener, if any. */
  const endpoint = () => {
    try {
      const compose = JSON.parse(
        readFileSync(join(host.root, "compose.json"), "utf8"),
      ) as {
        services: Record<string, { ports?: (string | { target: number })[] }>;
      };
      for (const [name, service] of Object.entries(compose.services))
        for (const port of service.ports ?? []) {
          host.endpoint = real
            .execFileSync(
              "docker",
              [
                "compose",
                "-p",
                `sg-${host.id.slice(0, 8)}`,
                "-f",
                join(host.root, "compose.json"),
                "port",
                name,
                String(
                  typeof port === "string"
                    ? port.split(":").at(-1)
                    : port.target,
                ),
              ],
              { encoding: "utf8" },
            )
            .trim();
          return;
        }
    } catch {
      /* worker-only arrangements publish nothing */
    }
  };
  return {
    ...real,
    spawn: (...input: unknown[]) => {
      const [file, args, options] = input as [string, string[], object];
      // Only SSH is the fixture's host; anything else runs normally.
      if (file !== "ssh")
        return (real.spawn as (...value: unknown[]) => unknown)(...input);
      const child = real.spawn("sh", ["-c", local(args.at(-1)!)], {
        ...options,
        env: platform,
      });
      // Recreation publishes the web container on a new loopback port.
      if (args.at(-1)!.includes("--force-recreate"))
        child.on("close", endpoint);
      return child;
    },
    execFile: (...input: unknown[]) => {
      const [file, args, options, callback] = input as [
        string,
        string[],
        object,
        (error: unknown, stdout: string) => void,
      ];
      if (file !== "ssh")
        return (real.execFile as (...value: unknown[]) => unknown)(...input);
      const release = args.at(-1)!.includes("run_release()");
      if (release) host.executions++;
      return real.execFile(
        "sh",
        ["-c", local(args.at(-1)!)],
        { ...options, env: platform },
        (error, stdout) => {
          if (!error && stdout.includes("SG_RELEASE_RESULT:replace:0"))
            endpoint();
          if (!error && release && host.loseResult) {
            host.loseResult = false;
            return callback(
              new Error("Synthetic lost SSH reply after the host completed"),
              "",
            );
          }
          callback(error, stdout);
        },
      );
    },
  };
});
// A fake Hetzner API: provisioning runs for real against it, and the server
// it "creates" is this machine, reached through the local SSH stand-in.
vi.mock("../../../src/server/hetzner", async (original) => ({
  ...(await original<object>()),
  hetznerConnectionId: () => "local-fixture",
  smallestHostOffer: async () => ({
    serverType: "cx23",
    location: "fsn1",
    cores: 2,
    memory: 4,
    monthly: 4.99,
    hourly: 0.008,
    currency: "EUR",
  }),
  hetzner: async (path: string, body?: Record<string, unknown>) => {
    const { pathname } = new URL(path, "https://provider.invalid");
    const cloud = host.cloud;
    if (pathname === "/servers" && body) {
      cloud.servers.push({
        id: 3,
        name: body.name,
        labels: body.labels,
        status: "running",
        public_net: { ipv4: { ip: "127.0.0.1" } },
      });
      return { server: cloud.servers[0] };
    }
    if (pathname === "/servers") return { servers: cloud.servers };
    if (pathname === "/servers/3") return { server: cloud.servers[0] };
    if (pathname === "/ssh_keys")
      return body ? { ssh_key: { id: 1 } } : { ssh_keys: [] };
    if (pathname === "/firewalls" && body) {
      cloud.firewall = body;
      return { firewall: { id: 2 } };
    }
    if (pathname === "/firewalls")
      return { firewalls: cloud.firewall ? [{ id: 2 }] : [] };
    if (pathname === "/firewalls/2/actions/set_rules") {
      cloud.firewall = { ...cloud.firewall, ...body };
      return { actions: [{ id: 9 }] };
    }
    if (pathname === "/actions/9") return { action: { status: "success" } };
    throw new Error(`Unexpected provider request ${path}`);
  },
}));
// Scripted sessions stand in for the model unless a test runs the model.
vi.mock("@earendil-works/pi-coding-agent", async (original) => {
  const real =
    await original<typeof import("@earendil-works/pi-coding-agent")>();
  return {
    ...real,
    createAgentSession: (options: { customTools: unknown[] }) =>
      host.session
        ? {
            session: {
              prompt: () => host.session!(options.customTools),
              waitForIdle: async () => {},
              getLastAssistantText: () => "",
              dispose: () => {},
              abort: async () => {},
            },
          }
        : real.createAgentSession(
            options as Parameters<typeof real.createAgentSession>[0],
          ),
  };
});
vi.mock("../../../src/server/pi-configuration", async (original) => {
  const real =
    await original<typeof import("../../../src/server/pi-configuration")>();
  return {
    ...real,
    configuredPiRuntime: (
      sdk: Parameters<typeof real.configuredPiRuntime>[0],
    ) =>
      host.session
        ? {
            configuration: { reasoningEffort: "low" },
            model: {},
            modelRuntime: {},
          }
        : real.configuredPiRuntime(sdk),
  };
});
vi.mock("../../../src/server/http", () => ({
  handle: async (work: () => unknown) => {
    try {
      return Response.json(await work());
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 400 },
      );
    }
  },
}));
vi.mock("../../../src/server/deployment-source", () => ({
  checkDeploymentSource: async () => ({ token: "synthetic" }),
}));
vi.mock("../../../src/server/github-api", async (original) => ({
  ...(await original<object>()),
  githubJson: async (path: string) => {
    const tree = /\/git\/trees\/([0-9a-f]{40})/.exec(path);
    if (tree)
      return {
        data: {
          sha: tree[1],
          tree: host.trees[tree[1]].map((file) => ({
            path: file.path,
            type: "blob",
            size: file.content.length,
          })),
        },
      };
    const sha = path.split("/").at(-1)!;
    return { data: { sha: sha === "HEAD" ? host.head : sha } };
  },
}));
vi.mock("../../../src/server/execution-tree", async (original) => ({
  ...(await original<object>()),
  fetchBaseTree: async (_repository: string, revision: string) =>
    host.trees[revision],
}));
vi.mock("../../../src/server/deployment-source-files", () => ({
  deploymentSourceFiles: async (_repository: string, revision: string) => ({
    paths: host.trees[revision].map((item) => item.path),
    read: async (path: string) =>
      host.trees[revision]
        .find((item) => item.path === path)!
        .content.toString("utf8"),
  }),
}));
// Scripted selections stand in for Pi unless a test runs the configured model.
vi.mock("../../../src/server/deployment-planner", async (original) => {
  const real =
    await original<typeof import("../../../src/server/deployment-planner")>();
  return {
    ...real,
    planRelease: (...args: Parameters<typeof real.planRelease>) =>
      host.pi ? host.pi(args[3] as never) : real.planRelease(...args),
  };
});
// Record every selection's outcome, at intake and execution: the evidence of
// Pi's feedback loop.
vi.mock("../../../src/server/native-compose", async (original) => {
  const real =
    await original<typeof import("../../../src/server/native-compose")>();
  const recorded =
    <
      I extends {
        selection: import("../../../src/server/native-compose").NativeSelection;
      },
      R,
    >(
      stage: string,
      prepare: (input: I) => Promise<R>,
    ) =>
    async (input: I) => {
      const entry = {
        stage,
        compose: input.selection.compose,
        files: input.selection.files ?? [],
        criterion: input.selection.criterion !== undefined,
      };
      try {
        const native = await prepare(input);
        host.prepared.push({ ...entry, accepted: true });
        return native;
      } catch (error) {
        host.prepared.push({
          ...entry,
          accepted: false,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    };
  return {
    ...real,
    prepareNativeRelease: recorded("execution", real.prepareNativeRelease),
    prepareInitialRelease: recorded("intake", real.prepareInitialRelease),
    // Only transport differs: the host's port 80 becomes a loopback port on
    // this machine. Retained snapshots and facts keep port 80.
    executableCompose: (...args: Parameters<typeof real.executableCompose>) => {
      const compose = JSON.parse(real.executableCompose(...args)) as {
        services: Record<
          string,
          { ports?: { published?: string; host_ip?: string }[] }
        >;
      };
      for (const service of Object.values(compose.services))
        for (const port of service.ports ?? [])
          if (port.published === "80")
            Object.assign(port, { published: "", host_ip: "127.0.0.1" });
      return JSON.stringify(compose);
    },
  };
});
import { insertApplication, insertChat } from "../../../src/server/db";
import {
  applicationDeployment,
  requestDeployment,
  runDeploymentAttempt,
  saveDeployment,
} from "../../../src/server/deployment-store";
import {
  proposeApplicationRelease,
  runApplicationRelease,
} from "../../../src/server/application-releases";
import { operation, startChange } from "../../../src/server/operation-store";
import { executeOperation } from "../../../src/server/application-operations";
import { recreateDeployment } from "../../../src/server/deployment-executor";
import { executeRelease } from "../../../src/server/release-executor";
import { runDeploymentWorker } from "../../../src/server/deployment-worker";
import { POST as deploymentRoute } from "../../../src/app/api/applications/[applicationId]/deployment/route";
import {
  prepareNativeRelease,
  type NativeSelection,
} from "../../../src/server/native-compose";
import { releaseOf } from "../../../src/server/deployment-release";
import {
  currentFacts,
  nativeFacts,
  type ReleaseFacts,
} from "../../../src/server/release-facts";
import { scopeDifferences } from "../../../src/server/release-scope";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import {
  convertPlan,
  legacyReleaseId,
} from "../../../scripts/retire-preparation.mjs";
import type { TreeFile } from "../../../src/server/execution-tree";

const proof = process.env.SG_RUN_DOCKER_PROOF === "1";
const A = "a".repeat(40),
  B = "b".repeat(40);
const docker = (args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 180000,
    env: platform,
  }).trim();
const file = (
  path: string,
  content: string | Buffer,
  mode = 0o644,
): TreeFile => ({ path, mode, content: Buffer.from(content) });
type Pi = {
  workspaceFiles: TreeFile[];
  context: string;
  initial?: boolean;
  apply: (
    selection: NativeSelection,
    files: TreeFile[],
  ) => Promise<{
    ok: boolean;
    kind?: string;
    retryable?: boolean;
    message: string;
  }>;
  reconcile: () => Promise<{
    ok: boolean;
    completed?: boolean;
    message: string;
  }>;
};
let template: string, root: string;
beforeAll(() => {
  template = join(
    mkdtempSync(join(tmpdir(), "sg-native-schema-")),
    "db.sqlite",
  );
  pushTestDatabase(template);
});
afterAll(() => rmSync(dirname(template), { recursive: true, force: true }));
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sg-native-release-"));
  vi.stubEnv("SERVER_GUY_DB_PATH", join(root, "db.sqlite"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "private"));
  copyFileSync(template, process.env.SERVER_GUY_DB_PATH!);
  host.root = join(root, "host");
  mkdirSync(host.root);
  host.executions = 0;
  host.loseResult = false;
  host.pi = null;
  host.session = null;
  host.cloud = { servers: [], firewall: null };
  host.prepared = [];
});
/** Verification reaches the loopback web port; other requests pass through. */
function stubLocalFetch() {
  const originalFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      return url.startsWith("http://127.0.0.1/")
        ? originalFetch(
            url.replace("http://127.0.0.1/", `http://${host.endpoint}/`),
            init,
          )
        : originalFetch(input, init);
    },
  );
}
/** An application with a conversation and no deployment yet. */
function newApplication(repositoryName: string) {
  const app = insertApplication({
    name: repositoryName,
    repositoryUrl: `https://github.com/qa/${repositoryName}`,
    repositoryOwner: "qa",
    repositoryName,
  }).id;
  const chat = insertChat(app, "Release").id;
  return { app, chat };
}
/** A live application record on the "host" with its private inputs. */
function application(repositoryName: string) {
  const { app, chat } = newApplication(repositoryName);
  const record = requestDeployment(app, chat);
  host.id = record.id;
  mkdirSync(join(root, "private", "deployments", record.id), {
    recursive: true,
  });
  writeFileSync(
    join(root, "private", "deployments", record.id, "database-password"),
    "synthetic-password",
  );
  Object.assign(record, {
    status: "live",
    repositoryId: 10,
    serverId: 7,
    address: "127.0.0.1",
  });
  return { app, chat, record };
}
async function change(
  app: string,
  chat: string,
  pi: (options: Pi) => Promise<void>,
  rollback?: { releaseId: string; compatibilityEvidence: string },
) {
  const proposed = await proposeApplicationRelease(
    app,
    chat,
    "HEAD",
    "Update the application",
    rollback,
  );
  const started = startChange(proposed.id, proposed.updatedAt);
  host.pi = pi as never;
  await executeOperation(started, () =>
    runApplicationRelease(started, AbortSignal.timeout(600000)),
  );
  return operation(started.id)!;
}
function cleanup(id: string, images: string[]) {
  try {
    docker([
      "compose",
      "-p",
      `sg-${id.slice(0, 8)}`,
      "-f",
      join(host.root, "compose.json"),
      "down",
      "-v",
      "--remove-orphans",
    ]);
  } catch {
    /* report assertion failures while still removing images */
  }
  // Images this deployment built, whatever names Pi chose for them.
  const built = docker([
    "images",
    "--format",
    "{{.Repository}}:{{.Tag}}",
    "--filter",
    `label=com.docker.compose.project=sg-${id.slice(0, 8)}`,
  ])
    .split("\n")
    .filter(Boolean);
  for (const image of [...images, ...built])
    try {
      docker(["image", "rm", "-f", image]);
    } catch {
      /* absent after a failed build */
    }
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(root, { recursive: true, force: true });
}

it.skipIf(!proof)(
  "runs a converted legacy release natively, lets Pi author equivalent Compose, corrects within scope, refuses a data move, reconciles a lost reply and rolls back to the converted release",
  async () => {
    const source = ["Dockerfile", "app.py"].map((path) =>
      file(path, readFileSync(join("tests/fixtures/release-app", path))),
    );
    host.trees = {
      [A]: [...source, file("version.txt", "v1")],
      [B]: [...source, file("version.txt", "v2")],
    };
    const { app, chat, record } = application("release");
    // The plan a retired Server Guy planner recorded for v1.
    const plan = {
      summary: "Synthetic source application with retained SQLite state",
      dockerfile: "Dockerfile",
      generatedDockerfile: null,
      context: ".",
      port: 8080,
      command: null,
      environment: [],
      postgres: null,
      missingInputs: [],
      healthPath: "/health",
      volumes: [
        {
          name: "data",
          target: "/data",
          kind: "database",
          sqlite: "/data/application.sqlite",
        },
      ],
      checks: [
        {
          name: "Version",
          method: "GET",
          path: "/version",
          body: null,
          expectedStatus: 200,
          contains: "v1",
          captureId: null,
        },
      ],
    };
    // Schema 14 converted the live record once, under the release identity
    // its approval named.
    const releaseId = legacyReleaseId(record.repository, A, plan);
    Object.assign(record, {
      revision: A,
      releaseId,
      native: convertPlan(plan, {
        deploymentId: record.id,
        repository: record.repository,
        revision: A,
      }),
    });
    saveDeployment(record);
    const v1 = releaseOf(record)!;
    expect(v1.id).toBe(releaseId);
    const project = `sg-${record.id.slice(0, 8)}`;
    stubLocalFetch();
    try {
      // v1 runs from its converted configuration through the native
      // executor, under the project, volume and image names it always had.
      const live = applicationDeployment(app)!;
      await runDeploymentAttempt(
        live,
        "release",
        "converted-v1",
        () =>
          executeRelease(live, v1, host.trees[A], AbortSignal.timeout(600000)),
        v1,
      );
      expect(applicationDeployment(app)!.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { releaseId },
      });
      expect(
        (
          await fetch(`http://${host.endpoint}/value`, {
            method: "POST",
            body: JSON.stringify({ value: "retained-user-data" }),
          })
        ).status,
      ).toBe(200);
      const container = () =>
        docker([
          "compose",
          "-p",
          project,
          "-f",
          join(host.root, "compose.json"),
          "ps",
          "-q",
          "app",
        ]);
      const volume = () =>
        docker([
          "volume",
          "inspect",
          "--format",
          "{{.CreatedAt}}",
          `${project}_data`,
        ]);
      const v1Volume = volume();

      // 1. Same revision, native representation: nothing restarts or moves.
      host.head = A;
      const converted = await change(app, chat, async (pi) => {
        // Pi reads the running configuration before writing its own.
        const view = JSON.parse(
          pi.workspaceFiles
            .find((f) => f.path === ".server-guy/current/compose.json")!
            .content.toString(),
        );
        expect(view.services.app.volumes).toEqual([
          { type: "volume", source: "data", target: "/data" },
        ]);
        const compose = `services:
  app:
    build: { context: ., dockerfile: Dockerfile }
    platform: linux/amd64
    restart: unless-stopped
    ports: ["80:8080"]
    volumes: ["data:/data"]
    logging: { driver: json-file, options: { max-size: 10m, max-file: "3" } }
volumes:
  data: {}
`;
        const applied = await pi.apply(
          {
            compose: ["compose.yaml"],
            summary: "The same release, authored as native Compose",
          },
          [file("compose.yaml", compose)],
        );
        expect(applied, applied.message).toMatchObject({ ok: true });
      });
      expect(converted.state).toBe("verified");
      // Equivalent effects need no new decision, and the data stays put.
      expect(volume()).toBe(v1Volume);
      let current = applicationDeployment(app)!;
      expect(
        scopeDifferences(nativeFacts(v1.native), currentFacts(current)!),
      ).toEqual([]);
      expect(current.native).toMatchObject({
        resolver: "docker compose 2.40.3",
        resolved: { name: project },
      });
      expect(current.native!.files.map((f) => f.path)).toEqual([
        "compose.yaml",
        ".server-guy/override.compose.json",
      ]);
      expect(current.lifecycle!.releases[0]).toEqual(v1);
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { releaseId: current.releaseId },
      });

      // 2. Update: a Compose error and an out-of-scope data move are feedback
      // before mutation; a lost reply is reconciled, never replayed.
      host.head = B;
      const executionsBefore = host.executions;
      const update = (volumes: string, extra = "") => `services:
  app:
    build: .
    platform: linux/amd64
    restart: unless-stopped
    ports: ["80:8080"]
    volumes: ["${volumes}:/data"]${extra}
volumes:
  ${volumes}: {}
`;
      const criterion = JSON.stringify({
        healthPath: "/health",
        checks: [
          {
            name: "Version",
            method: "GET",
            path: "/version",
            body: null,
            expectedStatus: 200,
            contains: "v2",
            captureId: null,
          },
          {
            name: "Retained data",
            method: "GET",
            path: "/value",
            body: null,
            expectedStatus: 200,
            contains: "retained-user-data",
            captureId: null,
          },
        ],
      });
      const selection = {
        compose: ["compose.yaml"],
        summary: "Revision v2 in native Compose, same data and listener",
        criterion,
      };
      const updated = await change(app, chat, async (pi) => {
        const invalid = await pi.apply(selection, [
          file("compose.yaml", update("data", "\n    env_file: [missing.env]")),
        ]);
        expect(invalid).toMatchObject({
          ok: false,
          kind: "configuration",
          retryable: true,
        });
        expect(invalid.message).toContain("missing.env");
        const moved = await pi.apply(
          {
            ...selection,
            data: [
              {
                volume: "state",
                kind: "database",
                sqlite: "application.sqlite",
              },
            ],
          },
          [file("compose.yaml", update("state"))],
        );
        expect(moved).toMatchObject({ ok: false, kind: "authorization" });
        expect(moved.message).toContain("Preserve volume data");
        // Workspace edits to repository files are not an owner-merged revision.
        const edited = await pi.apply({ ...selection, files: ["app.py"] }, [
          file("compose.yaml", update("data")),
          file("app.py", "print('edited in the workspace')\n"),
        ]);
        expect(edited).toMatchObject({ ok: false, kind: "configuration" });
        expect(edited.message).toContain(
          "Workspace edits to repository files are not deployed",
        );
        // Host effects without an established boundary are capability gaps.
        const hostEffects = await pi.apply(selection, [
          file(
            "compose.yaml",
            update("data", "\n    privileged: true\n    cap_add: [NET_ADMIN]"),
          ),
        ]);
        expect(hostEffects).toMatchObject({ ok: false, kind: "configuration" });
        expect(hostEffects.message).toMatch(
          /cap_add is not supported[\s\S]*privileged mode is not supported/,
        );
        const secret = await pi.apply(selection, [
          file(
            "compose.yaml",
            update("data", '\n    environment: { API_KEY: "${NEW_API_KEY}" }'),
          ),
        ]);
        expect(secret.message).toContain(
          "NEW_API_KEY: not a recorded private input",
        );
        // A volume subpath is other data; a foreign network is not ours.
        const subpath = await pi.apply(selection, [
          file(
            "compose.yaml",
            update("data").replace(
              'volumes: ["data:/data"]',
              "volumes: [{ type: volume, source: data, target: /data, volume: { subpath: other } }]",
            ),
          ),
        ]);
        expect(subpath.message).toContain("a subpath of volume data");
        const foreign = await pi.apply(selection, [
          file(
            "compose.yaml",
            `${update("data")}networks:\n  default:\n    name: another-application-default\n`,
          ),
        ]);
        expect(foreign.message).toContain("keep its project-scoped name");
        expect(host.executions).toBe(executionsBefore);
        // The release also mounts a selected configuration file read-only.
        const mounted = [
          file(
            "compose.yaml",
            update("data").replace(
              'volumes: ["data:/data"]',
              'volumes: ["data:/data", "./config/settings.ini:/etc/release/settings.ini:ro"]',
            ),
          ),
          file("config/settings.ini", "mode=release\n"),
        ];
        const withConfig = { ...selection, files: ["config/settings.ini"] };
        host.loseResult = true;
        expect(await pi.apply(withConfig, mounted)).toMatchObject({
          ok: false,
          kind: "transport",
          retryable: false,
        });
        const blocked = await pi.apply(withConfig, mounted);
        expect(blocked).toMatchObject({ ok: false, kind: "authorization" });
        expect(blocked.message).toContain("unknown");
        const running = container();
        expect(await pi.reconcile()).toMatchObject({
          ok: true,
          completed: true,
        });
        expect(container()).toBe(running);
      });
      expect(updated.state).toBe("verified");
      expect(host.executions).toBe(executionsBefore + 1);
      current = applicationDeployment(app)!;
      expect(
        current.lifecycle!.attempts.slice(-2).map((a) => [a.kind, a.outcome]),
      ).toEqual([
        ["release", "failed"],
        ["reconcile", "verified"],
      ]);
      expect(current.lifecycle!.runtime.lastVerified!.revision).toBe(B);
      expect(
        await (await fetch(`http://${host.endpoint}/value`)).json(),
      ).toEqual({ value: "retained-user-data" });
      expect(volume()).toBe(v1Volume);
      // The unprivileged application reads its mounted configuration file.
      expect(
        docker([
          "compose",
          "-p",
          project,
          "-f",
          join(host.root, "compose.json"),
          "exec",
          "-T",
          "app",
          "cat",
          "/etc/release/settings.ini",
        ]),
      ).toBe("mode=release");
      // Recreation replaces every container from the recorded images and
      // configuration fingerprints, and verifies again with the data kept.
      const recreated = await runDeploymentAttempt(
        current,
        "recreate",
        "recreate-proof",
        () => recreateDeployment(current, AbortSignal.timeout(300000)),
      );
      expect(recreated.after.some((id) => recreated.before.includes(id))).toBe(
        false,
      );
      current = applicationDeployment(app)!;
      expect(current.lifecycle!.attempts.at(-1)).toMatchObject({
        kind: "recreate",
        outcome: "verified",
      });
      expect(
        await (await fetch(`http://${host.endpoint}/value`)).json(),
      ).toEqual({ value: "retained-user-data" });

      // 3. Compatible rollback to the converted release's verified images.
      expect(current.lifecycle!.releases[0]).toEqual(v1);
      const back = await change(app, chat, async () => {}, {
        releaseId: v1.id,
        compatibilityEvidence:
          "v2 reads and writes the same settings table as v1.",
      });
      expect(back.state).toBe("verified");
      current = applicationDeployment(app)!;
      expect(current).toMatchObject({ revision: A, releaseId: v1.id });
      expect(current.native).toEqual(v1.native);
      expect(
        await (await fetch(`http://${host.endpoint}/version`)).text(),
      ).toContain("v1");
      expect(
        await (await fetch(`http://${host.endpoint}/value`)).json(),
      ).toEqual({ value: "retained-user-data" });
    } finally {
      cleanup(record.id, [
        `server-guy-${record.id}:${A}`,
        ...[A, B].map((revision) => `server-guy-${record.id}-app:${revision}`),
      ]);
    }
  },
  900000,
);

const empty: ReleaseFacts = {
  services: [],
  volumes: [],
  exposure: [],
  httpAccess: "public",
  database: null,
  inputs: [],
  variables: [],
  criterion: null,
  summary: "",
};
it.skipIf(!proof)(
  "runs a worker-only arrangement as observed, never verified, and refuses criterion-less releases",
  async () => {
    const worker = (path: string) =>
      file(
        `consumer/${path}`,
        readFileSync(join("tests/fixtures/shared-builds/worker", path)),
      );
    const tree = (version: string) => [
      file(
        "producer/Dockerfile",
        'FROM python:3.12-alpine\nWORKDIR /producer\nCOPY producer.py version.txt ./\nCMD ["python", "producer.py"]\n',
      ),
      file(
        "producer/producer.py",
        'from pathlib import Path\nfrom time import sleep\nPath("/documents/job.txt").write_text("job@" + Path("version.txt").read_text().strip())\nwhile True:\n    sleep(60)\n',
      ),
      file("producer/version.txt", version),
      worker("Dockerfile"),
      worker("worker.py"),
      file("consumer/version.txt", version),
    ];
    host.trees = { [A]: tree("v1"), [B]: tree("v2") };
    const compose = file(
      "compose.yaml",
      `services:
  producer:
    build: ./producer
    platform: linux/amd64
    volumes: ["documents:/documents"]
  consumer:
    build: ./consumer
    platform: linux/amd64
    depends_on: [producer]
    volumes: ["documents:/input:ro", "results:/output"]
    environment: { TOKEN: "\${WORKER_TOKEN}" }
    healthcheck: { test: ["CMD", "python", "-c", "from pathlib import Path; assert Path('/tmp/ready').exists()"], interval: 1s, timeout: 5s, retries: 30 }
volumes:
  documents: {}
  results: {}
`,
    );
    const selection: NativeSelection = {
      compose: ["compose.yaml"],
      summary: "Producer and consumer workers sharing documents, no endpoint",
      data: [
        { volume: "documents", kind: "files" },
        { volume: "results", kind: "files" },
      ],
    };
    const { app, chat, record } = application("workers");
    const token = "synthetic-$ecret-value";
    writeFileSync(
      join(root, "private", "deployments", record.id, "inputs.json"),
      JSON.stringify({ WORKER_TOKEN: token }),
    );
    record.revision = A;
    saveDeployment(record);
    const project = `sg-${record.id.slice(0, 8)}`;
    try {
      // No intake admits this arrangement yet; the executor runs it directly.
      const native = await prepareNativeRelease({
        deploymentId: record.id,
        revision: A,
        selection,
        artifacts: [compose],
        repositoryFile: async () => null,
        inputs: ["WORKER_TOKEN"],
        baseline: empty,
        signal: AbortSignal.timeout(120000),
      });
      expect(native.criterion).toBeNull();
      // Private values stay references in the retained snapshot.
      expect(native.inputs).toEqual(["WORKER_TOKEN"]);
      expect(native.resolved.services.consumer.environment).toEqual({
        TOKEN: "${WORKER_TOKEN}",
      });
      const seed = releaseOf({
        repository: record.repository,
        revision: A,
        native,
      })!;
      const live = applicationDeployment(app)!;
      await runDeploymentAttempt(
        live,
        "release",
        "seed",
        () =>
          executeRelease(
            live,
            seed,
            host.trees[A],
            AbortSignal.timeout(600000),
          ),
        seed,
      );
      let current = applicationDeployment(app)!;
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "observed",
        lastVerified: null,
        observed: { releaseId: seed.id, behavior: "unverified" },
      });
      const exec = (service: string, command: string[]) =>
        docker([
          "compose",
          "-p",
          project,
          "-f",
          join(host.root, "compose.json"),
          "exec",
          "-T",
          service,
          ...command,
        ]);
      // The test's own evidence of work, which the product does not claim.
      await expect
        .poll(() => exec("consumer", ["cat", "/output/job.txt"]), {
          timeout: 30000,
        })
        .toBe("job@v1@v1");
      expect(() => exec("consumer", ["touch", "/input/forbidden"])).toThrow();
      expect(exec("consumer", ["printenv", "TOKEN"])).toBe(token);
      expect(JSON.stringify(current)).not.toContain(token);

      // Without a behavior criterion a release could only be observed, so the
      // operation refuses it instead of reporting it verified.
      host.head = B;
      await expect(
        change(app, chat, async (pi) => {
          const refused = await pi.apply(selection, [compose]);
          expect(refused).toMatchObject({
            ok: false,
            kind: "authorization",
            retryable: false,
          });
          throw new Error(refused.message);
        }),
      ).rejects.toThrow("no behavior criterion");
      expect(host.executions).toBe(1);
      current = applicationDeployment(app)!;
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "observed",
        lastVerified: null,
      });
      await expect(
        proposeApplicationRelease(app, chat, "HEAD", "Go back", {
          releaseId: seed.id,
          compatibilityEvidence: "Same files.",
        }),
      ).rejects.toThrow("verified images");
    } finally {
      cleanup(
        record.id,
        ["producer", "consumer"].flatMap((name) =>
          [A, B].map((rev) => `server-guy-${record.id}-${name}:${rev}`),
        ),
      );
    }
  },
  900000,
);

const piProof = process.env.SG_RUN_PI_PROOF === "1";
const evidenceDirectory = join(
  process.cwd(),
  "tests/results/native-compose-execution/pi-proof",
);
it.skipIf(!piProof)(
  "the configured Pi model releases a managed PostgreSQL app with a private input, then corrects a release from actual host feedback",
  async () => {
    // The product's saved Pi choice. Only the settings file is copied; the
    // credential it names stays in place and is read by Pi's runtime alone.
    const settings = process.env.SG_PI_SETTINGS;
    if (!settings || !existsSync(settings))
      throw new Error("Set SG_PI_SETTINGS to a saved pi-settings.json.");
    mkdirSync(join(root, "private"), { recursive: true });
    copyFileSync(settings, join(root, "private", "pi-settings.json"));
    const fixture = (path: string) =>
      file(path, readFileSync(join("tests/fixtures/notes-app", path)));
    const base = [
      "Dockerfile",
      "requirements.txt",
      "app.py",
      "README.md",
      "docker-compose.yml",
    ].map(fixture);
    // v3's upstream Dockerfile pins a base image digest no registry serves:
    // a failure only the host build can reveal to Pi.
    const missing = createHash("sha256")
      .update("unpublished base")
      .digest("hex");
    const C = "c".repeat(40);
    host.trees = {
      [A]: [...base, file("version.txt", "v1")],
      [B]: [...base, fixture("worker.py"), file("version.txt", "v2")],
      [C]: [
        ...base.map((item) =>
          item.path === "Dockerfile"
            ? file(
                "Dockerfile",
                item.content
                  .toString()
                  .replace(
                    "FROM python:3.12-alpine",
                    `FROM python:3.12-alpine@sha256:${missing}`,
                  ),
              )
            : item.path === "README.md"
              ? file(
                  "README.md",
                  `${item.content}\nSince v3 the Dockerfile pins its base image by digest for reproducible builds.\n`,
                )
              : item,
        ),
        fixture("worker.py"),
        file("version.txt", "v3"),
      ],
    };
    const { app, chat, record } = application("notes");
    const secret = "synthetic-notes-signing-value";
    writeFileSync(
      join(root, "private", "deployments", record.id, "inputs.json"),
      JSON.stringify({ APP_SECRET: secret }),
    );
    const check = (name: string, path: string, contains: string) => ({
      name,
      method: "GET" as const,
      path,
      body: null,
      expectedStatus: 200,
      contains,
      captureId: null,
    });
    // The plan a retired Server Guy planner recorded for v1.
    const plan = {
      summary:
        "Notes web application with managed PostgreSQL and a private signing key",
      dockerfile: "Dockerfile",
      generatedDockerfile: null,
      context: ".",
      port: 8080,
      command: null,
      environment: [],
      postgres: {
        version: "16",
        variable: "DATABASE_URL",
        scheme: "postgresql",
      },
      missingInputs: [
        { name: "APP_SECRET", reason: "Signs the digest returned with notes" },
      ],
      healthPath: "/health",
      checks: [
        check("Version", "/version", "v1"),
        check("Notes", "/notes", '"notes"'),
      ],
    };
    // Schema 14 converted the live record once, under the release identity
    // its approval named.
    const releaseId = legacyReleaseId(record.repository, A, plan);
    Object.assign(record, {
      revision: A,
      releaseId,
      native: convertPlan(plan, {
        deploymentId: record.id,
        repository: record.repository,
        revision: A,
      }),
    });
    saveDeployment(record);
    const v1 = releaseOf(record)!;
    expect(v1.id).toBe(releaseId);
    const project = `sg-${record.id.slice(0, 8)}`;
    const compose = (...args: string[]) =>
      docker([
        "compose",
        "-p",
        project,
        "-f",
        join(host.root, "compose.json"),
        ...args,
      ]);
    const workspaces = join(root, "pi-workspaces");
    const journal = (ids: string[]) =>
      ids.flatMap((id) =>
        readFileSync(join(workspaces, id, "events.jsonl"), "utf8")
          .trim()
          .split("\n")
          .map(
            (line) =>
              JSON.parse(line) as {
                type: string;
                name?: string;
                args?: unknown;
              },
          ),
      );
    /** One owner request through the real planner, workspace and executor. */
    async function release(request: string, head: string) {
      host.head = head;
      host.prepared = [];
      const before = applicationDeployment(app)!;
      const known = new Set(
        existsSync(workspaces) ? readdirSync(workspaces) : [],
      );
      const proposed = await proposeApplicationRelease(
        app,
        chat,
        "HEAD",
        request,
      );
      const started = startChange(proposed.id, proposed.updatedAt);
      const began = Date.now();
      const outcome = await executeOperation(started, () =>
        runApplicationRelease(started, AbortSignal.timeout(45 * 60_000)),
      ).then(
        () => "completed",
        (error: unknown) =>
          error instanceof Error ? error.message : String(error),
      );
      const current = applicationDeployment(app)!;
      const native = current.native;
      const attempts = current
        .lifecycle!.attempts.slice(before.lifecycle?.attempts.length ?? 0)
        .map(({ kind, outcome, error, remoteResult }) => ({
          kind,
          outcome,
          error: error?.slice(-1200) ?? null,
          remoteResult,
        }));
      const events = journal(
        readdirSync(workspaces).filter((id) => !known.has(id)),
      );
      return {
        request,
        revision: head,
        minutes: Math.round((Date.now() - began) / 600) / 100,
        outcome,
        operation: {
          state: operation(started.id)!.state,
          evidence: operation(started.id)!.evidence,
        },
        selections: host.prepared.map((entry) => ({
          ...entry,
          message: entry.message?.slice(-1500),
        })),
        attempts,
        corrected:
          attempts.some(
            (a) => a.kind === "release" && a.outcome === "failed",
          ) || host.prepared.some((entry) => !entry.accepted),
        feedback: current.events
          .slice(before.events.length)
          .filter((event) => event.message.startsWith("Release feedback:"))
          // The actionable error ends the output: keep the tail.
          .map((event) => event.message.slice(-1500)),
        tools: events
          .filter((event) => event.type === "tool-start")
          .map(
            (event) =>
              `${event.name} ${JSON.stringify(event.args).slice(0, 200)}`,
          ),
        journal: events,
        release: native && {
          resolver: native.resolver,
          compose: native.compose,
          files: native.files.map((item) => item.path),
          inputs: native.inputs,
          services: Object.keys(native.resolved.services),
          database: native.database,
          criterion: native.criterion,
        },
        // Every file Pi selected, except the controller's own override.
        authored: native?.files
          .filter((item) => !item.path.startsWith(".server-guy/"))
          .map((item) => ({
            path: item.path,
            content: Buffer.from(item.content, "base64").toString("utf8"),
          })),
      };
    }
    stubLocalFetch();
    try {
      // v1 runs from its converted configuration, with its private values.
      const live = applicationDeployment(app)!;
      await runDeploymentAttempt(
        live,
        "release",
        "converted-v1",
        () =>
          executeRelease(live, v1, host.trees[A], AbortSignal.timeout(600000)),
        v1,
      );
      const note = "retained note from v1";
      expect(
        (
          await fetch(`http://${host.endpoint}/notes`, {
            method: "POST",
            body: JSON.stringify({ body: note }),
          })
        ).status,
      ).toBe(201);
      const database = () =>
        docker([
          "volume",
          "inspect",
          "--format",
          "{{.CreatedAt}}",
          `${project}_database`,
        ]);
      const [v1Database, v1Postgres] = [
        database(),
        compose("ps", "-q", "postgres"),
      ];

      // Real planner, workspace, export, resolver and executor; only the SSH
      // transport is local. The model never receives private values.
      const first = await release(
        "Update to the latest revision. It adds a background worker that counts the words in each note; run it as the repository README describes and keep the existing notes.",
        B,
      );
      const second = await release(
        "Update to the latest revision and keep the existing notes.",
        C,
      );
      const current = applicationDeployment(app)!;
      const chosen = JSON.parse(readFileSync(settings, "utf8"));
      const phases = [first, second].map((phase) => ({
        ...phase,
        journal: undefined,
      }));
      const text = JSON.stringify(
        {
          model: {
            providerId: chosen.providerId,
            modelId: chosen.modelId,
            reasoningEffort: chosen.reasoningEffort,
          },
          phases,
          runtime: current.lifecycle!.runtime,
        },
        null,
        2,
      );
      mkdirSync(evidenceDirectory, { recursive: true });
      writeFileSync(join(evidenceDirectory, "evidence.json"), text);
      // No private value reached the evidence, the record or Pi's workspace.
      for (const value of [secret, "synthetic-password"]) {
        expect(text).not.toContain(value);
        expect(JSON.stringify(current)).not.toContain(value);
        expect(JSON.stringify([first.journal, second.journal])).not.toContain(
          value,
        );
      }
      expect(first.outcome).toBe("completed");
      expect(first.release!.services.length).toBe(3);
      expect(second.outcome).toBe("completed");
      // The unserved base image surfaced on the host and Pi corrected it.
      expect(second.corrected).toBe(true);
      const native = current.native!;
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { revision: C },
      });
      expect(
        Object.values(native.resolved.services).some((service) =>
          JSON.stringify([service.command, service.entrypoint]).includes(
            "worker.py",
          ),
        ),
      ).toBe(true);
      // The worker keeps processing through the managed database, existing
      // data survived both releases, and the private key reached the app.
      await expect
        .poll(
          async () =>
            (
              await (await fetch(`http://${host.endpoint}/notes`)).json()
            ).notes.find((item: { body: string }) => item.body === note)?.words,
          { timeout: 60000 },
        )
        .toBe(4);
      const notes = await (await fetch(`http://${host.endpoint}/notes`)).json();
      expect(notes.digest).toBe(
        createHmac("sha256", secret)
          .update(JSON.stringify(notes.notes))
          .digest("hex"),
      );
      expect(
        await (await fetch(`http://${host.endpoint}/version`)).text(),
      ).toContain("v3");
      expect(database()).toBe(v1Database);
      writeFileSync(
        join(evidenceDirectory, "checks.json"),
        JSON.stringify(
          {
            postgresContainerKept:
              compose("ps", "-q", "postgres") === v1Postgres,
            databaseVolumeKept: true,
            notes: notes.notes,
            digestMatchesPrivateInput: true,
            version: "v3",
          },
          null,
          2,
        ),
      );
    } finally {
      cleanup(record.id, [`server-guy-${record.id}:${A}`]);
    }
  },
  60 * 60_000,
);

/** The owner's approval, posted as the deployment card posts it. */
function approve(
  app: string,
  record: DeploymentRecord,
  inputs: Record<string, string>,
) {
  return deploymentRoute(
    new Request("http://localhost:3000/api/deployment", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      body: JSON.stringify({
        action: "approve",
        deploymentId: record.id,
        recommendationId: record.recommendationId,
        maxMonthly: record.offer!.monthly,
        inputs,
      }),
    }),
    { params: Promise.resolve({ applicationId: app }) },
  );
}
/**
 * A first deployment through the product's worker: Pi's read-only intake,
 * the owner's approval with private values, provisioning against the fake
 * provider, then the shared release loop on this machine.
 */
async function install(
  app: string,
  chat: string,
  request: string,
  inputs: (record: DeploymentRecord) => Record<string, string>,
  timeout: number,
) {
  const controller = new AbortController();
  const worker = runDeploymentWorker(controller.signal);
  const settled = async (states: string[]) => {
    await expect
      .poll(() => applicationDeployment(app)?.status, {
        timeout,
        interval: 1000,
      })
      .toSatisfy((status) => states.includes(status as string));
    return applicationDeployment(app)!;
  };
  try {
    host.id = requestDeployment(app, chat, "user", request).id;
    const recommended = await settled(["awaiting-approval", "failed"]);
    if (recommended.status === "failed") return recommended;
    expect((await approve(app, recommended, inputs(recommended))).status).toBe(
      200,
    );
    // Done when the worker has finished the deployment: live with its URL,
    // which it records after Pi's session ends, or failed.
    await expect
      .poll(
        () => {
          const current = applicationDeployment(app)!;
          return (
            current.status === "failed" ||
            (current.status === "live" && current.url !== null)
          );
        },
        { timeout, interval: 1000 },
      )
      .toBe(true);
  } finally {
    controller.abort();
    await worker;
  }
  return applicationDeployment(app)!;
}
/** What one Pi-driven phase did: selections, feedback, attempts and tools. */
async function observe(app: string, work: () => Promise<unknown>) {
  const workspaces = join(root, "pi-workspaces");
  const listed = () => (existsSync(workspaces) ? readdirSync(workspaces) : []);
  const known = new Set(listed());
  const before = applicationDeployment(app);
  host.prepared = [];
  const began = Date.now();
  const outcome = await work().then(
    () => "completed",
    (error: unknown) =>
      error instanceof Error ? error.message : String(error),
  );
  const current = applicationDeployment(app)!;
  const sessions = listed()
    .filter((id) => !known.has(id))
    .map((id) =>
      readFileSync(join(workspaces, id, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map(
          (line) =>
            JSON.parse(line) as {
              at: string;
              type: string;
              name?: string;
              args?: unknown;
            },
        ),
    )
    .sort((a, b) => a[0].at.localeCompare(b[0].at));
  const summary = (release: DeploymentRecord["native"]) =>
    release && {
      resolver: release.resolver,
      compose: release.compose,
      files: release.files.map((item) => item.path),
      inputs: release.inputs,
      inputReasons: release.inputReasons,
      services: Object.keys(release.resolved.services),
      database: release.database,
      httpAccess: release.httpAccess,
      data: release.data,
      criterion: release.criterion,
      authored: release.files
        .filter((item) => !item.path.startsWith(".server-guy/"))
        .map((item) => ({
          path: item.path,
          content: Buffer.from(item.content, "base64").toString("utf8"),
        })),
    };
  const approved = current.lifecycle?.releases.find(
    (release) => release.id === current.authority?.releaseId,
  );
  return {
    minutes: Math.round((Date.now() - began) / 600) / 100,
    outcome,
    status: current.status,
    error: current.error,
    selections: host.prepared.map((entry) => ({
      ...entry,
      message: entry.message?.slice(-1500),
    })),
    attempts: (current.lifecycle?.attempts ?? [])
      .slice(before?.lifecycle?.attempts.length ?? 0)
      .map(({ kind, outcome, error, remoteResult }) => ({
        kind,
        outcome,
        error: error?.slice(-1500) ?? null,
        remoteResult,
      })),
    feedback: current.events
      .slice(before?.events.length ?? 0)
      .filter((event) => event.message.startsWith("Release feedback:"))
      // The actionable error ends the output: keep the tail.
      .map((event) => event.message.slice(-1500)),
    sessions: sessions.map((events) =>
      events
        .filter((event) => event.type === "tool-start")
        .map(
          (event) =>
            `${event.name} ${JSON.stringify(event.args).slice(0, 200)}`,
        ),
    ),
    journal: sessions,
    approved: before ? undefined : approved && summary(approved.native),
    release: { id: current.releaseId, ...summary(current.native) },
  };
}

const notes = (path: string) =>
  file(path, readFileSync(join("tests/fixtures/notes-app", path)));
const notesSource = () =>
  [
    "Dockerfile",
    "requirements.txt",
    "app.py",
    "README.md",
    "docker-compose.yml",
  ].map(notes);
const getCheck = (name: string, path: string, contains: string) => ({
  name,
  method: "GET" as const,
  path,
  body: null,
  expectedStatus: 200,
  contains,
  captureId: null,
});
const notesCriterion = (version: string) =>
  JSON.stringify({
    healthPath: "/health",
    checks: [
      getCheck("Version", "/version", version),
      getCheck("Notes", "/notes", '"notes"'),
    ],
  });
/** Notes on managed PostgreSQL with a private key, as Pi might author it. */
function notesCompose(
  options: { command?: string[]; worker?: boolean; image?: string } = {},
) {
  const image = options.image ?? "notes:v1";
  const database =
    "postgresql://serverguy:${SERVER_GUY_DATABASE_PASSWORD}@postgres:5432/application";
  const worker = `  worker:
    image: ${image}
    command: ["python", "worker.py"]
    environment:
      DATABASE_URL: ${database}
    depends_on:
      postgres: { condition: service_healthy }
    healthcheck: { test: ["CMD", "python", "-c", "import os; assert os.path.exists('/tmp/worker-ready')"], interval: 2s, timeout: 5s, retries: 30 }
`;
  return `services:
  app:
    build: .
    image: ${image}
    ports: ["80:8080"]${options.command ? `\n    command: ${JSON.stringify(options.command)}` : ""}
    environment:
      APP_SECRET: \${APP_SECRET}
      DATABASE_URL: ${database}
    depends_on:
      postgres: { condition: service_healthy }
${options.worker ? worker : ""}  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: serverguy
      POSTGRES_DB: application
      POSTGRES_PASSWORD: \${SERVER_GUY_DATABASE_PASSWORD}
    volumes: ["database:/var/lib/postgresql/data"]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U serverguy -d application"], interval: 2s, timeout: 5s, retries: 30 }
volumes:
  database: {}
`;
}
const retainedNote = "retained note from v1";

it.skipIf(!proof)(
  "installs a first deployment from Pi-authored native Compose through the worker and shared loop, corrects a host failure within the approval, then updates it keeping its data",
  async () => {
    host.trees = {
      [A]: [...notesSource(), file("version.txt", "v1")],
      [B]: [...notesSource(), notes("worker.py"), file("version.txt", "v2")],
    };
    host.head = A;
    const { app, chat } = newApplication("notes");
    const secret = "synthetic-notes-signing-value";
    const intake = {
      compose: ["deploy.compose.yml"],
      summary:
        "Notes web service on managed PostgreSQL with a private signing key",
      data: [{ volume: "database", kind: "database" }],
      criterion: notesCriterion("v1"),
      httpAccess: "public",
      database: { service: "postgres", version: "16" },
    };
    // Intake runs the real planner, workspace, export and resolver; only the
    // model's tool calls are scripted. Its entry point is wrong, which only
    // the host reveals after approval.
    host.session = async (tools) => {
      const call = async (name: string, args: object) =>
        (
          await (
            tools as {
              name: string;
              execute: (
                id: string,
                args: object,
              ) => Promise<{ content: { text: string }[] }>;
            }[]
          )
            .find((tool) => tool.name === name)!
            .execute(`call-${name}`, args)
        ).content[0].text;
      await call("write", {
        path: "deploy.compose.yml",
        content: notesCompose({ command: ["python", "server.py"] }),
      });
      // An undeclared private value is feedback, not an approval request.
      const undeclared = JSON.parse(await call("recommend_deployment", intake));
      expect(undeclared).toMatchObject({ ok: false, retryable: true });
      expect(undeclared.message).toContain("APP_SECRET");
      expect(
        JSON.parse(
          await call("recommend_deployment", {
            ...intake,
            inputs: [
              {
                name: "APP_SECRET",
                reason: "Signs the digest returned with notes",
              },
            ],
          }),
        ),
      ).toMatchObject({ ok: true });
    };
    // The approved release fails on the host; Pi corrects it in scope.
    host.pi = (async (pi: Pi) => {
      expect(pi.initial).toBe(true);
      expect(pi.context).toContain(
        "The previous execution under this authorization failed",
      );
      const exposed = await pi.apply(
        {
          compose: ["deploy.compose.yml"],
          summary: "Also publish the application directly on port 8080",
        },
        [
          file(
            "deploy.compose.yml",
            notesCompose().replace(
              'ports: ["80:8080"]',
              'ports: ["80:8080", "8080:8080"]',
            ),
          ),
        ],
      );
      expect(exposed).toMatchObject({ ok: false, kind: "authorization" });
      expect(
        await pi.apply(
          {
            compose: ["deploy.compose.yml"],
            summary: "Run the image's documented entry point",
          },
          [file("deploy.compose.yml", notesCompose())],
        ),
      ).toMatchObject({ ok: true });
    }) as never;
    stubLocalFetch();
    try {
      const live = await install(
        app,
        chat,
        "Deploy the notes service.",
        () => ({ APP_SECRET: secret }),
        15 * 60_000,
      );
      expect(live.error).toBeNull();
      expect(live).toMatchObject({
        status: "live",
        url: "http://127.0.0.1",
      });
      const approvedId = live.authority!.releaseId!;
      expect(live.lifecycle!.releases[0].id).toBe(approvedId);
      expect(live.lifecycle!.attempts.map((a) => [a.kind, a.outcome])).toEqual([
        ["deploy", "failed"],
        ["deploy", "verified"],
      ]);
      expect(live.lifecycle!.attempts[0].remoteResult).toMatchObject({
        phase: "replace",
      });
      expect(live.releaseId).not.toBe(approvedId);
      expect(live.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { releaseId: live.releaseId, revision: A },
      });
      expect(
        host.prepared.map((entry) => [entry.stage, entry.accepted]),
      ).toEqual([
        ["intake", false],
        ["intake", true],
        ["execution", true],
        ["execution", true],
      ]);
      // One server, with the firewall the approval implies, and no private
      // value in the record.
      expect(host.cloud.servers).toHaveLength(1);
      expect(host.cloud.firewall).toMatchObject({
        rules: [{ port: "22" }, { port: "80" }],
      });
      // The recommendation's records stay with the approved release.
      expect(live.lifecycle!.releases[0].native!.inputReasons).toEqual({
        APP_SECRET: "Signs the digest returned with notes",
      });
      expect(JSON.stringify(live)).not.toContain(secret);
      const project = `sg-${live.id.slice(0, 8)}`;
      const compose = (...args: string[]) =>
        docker([
          "compose",
          "-p",
          project,
          "-f",
          join(host.root, "compose.json"),
          ...args,
        ]);
      expect(
        (
          await fetch(`http://${host.endpoint}/notes`, {
            method: "POST",
            body: JSON.stringify({ body: retainedNote }),
          })
        ).status,
      ).toBe(201);
      const database = () =>
        docker([
          "volume",
          "inspect",
          "--format",
          "{{.CreatedAt}}",
          `${project}_database`,
        ]);
      const [v1Database, v1Postgres] = [
        database(),
        compose("ps", "-q", "postgres"),
      ];

      // The update runs through the same loop, from the verified runtime.
      host.head = B;
      const updated = await change(app, chat, async (pi) => {
        expect(pi.initial).toBeFalsy();
        expect(
          await pi.apply(
            {
              compose: ["deploy.compose.yml"],
              summary:
                "v2 with the README's word-count worker on the app image",
              criterion: notesCriterion("v2"),
            },
            [
              file(
                "deploy.compose.yml",
                notesCompose({ worker: true, image: "notes:v2" }),
              ),
            ],
          ),
        ).toMatchObject({ ok: true });
      });
      expect(updated.state).toBe("verified");
      await expect
        .poll(
          async () =>
            (
              await (await fetch(`http://${host.endpoint}/notes`)).json()
            ).notes.find((item: { body: string }) => item.body === retainedNote)
              ?.words,
          { timeout: 60000 },
        )
        .toBe(4);
      const listed = await (
        await fetch(`http://${host.endpoint}/notes`)
      ).json();
      expect(listed.digest).toBe(
        createHmac("sha256", secret)
          .update(JSON.stringify(listed.notes))
          .digest("hex"),
      );
      expect(database()).toBe(v1Database);
      expect(compose("ps", "-q", "postgres")).toBe(v1Postgres);
      expect(applicationDeployment(app)!.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { revision: B },
      });
    } finally {
      cleanup(host.id, ["notes:v1", "notes:v2"]);
    }
  },
  30 * 60_000,
);

const intakeEvidence = join(
  process.cwd(),
  "tests/results/native-compose-intake/pi-proof",
);
it.skipIf(!piProof)(
  "the configured Pi model prepares a first deployment, corrects its execution from host feedback within the approval, then updates it",
  async () => {
    // The product's saved Pi choice. Only the settings file is copied; the
    // credential it names stays in place and is read by Pi's runtime alone.
    const settings = process.env.SG_PI_SETTINGS;
    if (!settings || !existsSync(settings))
      throw new Error("Set SG_PI_SETTINGS to a saved pi-settings.json.");
    mkdirSync(join(root, "private"), { recursive: true });
    copyFileSync(settings, join(root, "private", "pi-settings.json"));
    // The repository pins its base image to a digest no registry serves: a
    // failure only the host build reveals, after the owner's approval.
    const missing = createHash("sha256")
      .update("unpublished base")
      .digest("hex");
    const pinned = (item: TreeFile) =>
      item.path === "Dockerfile"
        ? file(
            "Dockerfile",
            item.content
              .toString()
              .replace(
                "FROM python:3.12-alpine",
                `FROM python:3.12-alpine@sha256:${missing}`,
              ),
          )
        : item.path === "README.md"
          ? file(
              "README.md",
              `${item.content}\nThe Dockerfile pins its base image by digest for reproducible builds.\n`,
            )
          : item;
    host.trees = {
      [A]: [...notesSource().map(pinned), file("version.txt", "v1")],
      [B]: [
        ...notesSource().map(pinned),
        notes("worker.py"),
        file("version.txt", "v2"),
      ],
    };
    host.head = A;
    const { app, chat } = newApplication("notes");
    const secret = "synthetic-notes-signing-value";
    stubLocalFetch();
    try {
      const installed = await observe(app, () =>
        install(
          app,
          chat,
          "Deploy this notes service. Its notes live in PostgreSQL and its signing key is private.",
          (record) =>
            Object.fromEntries(
              currentFacts(record)!.inputs.map((name) => [
                name,
                name === "APP_SECRET"
                  ? secret
                  : `synthetic-${name.toLowerCase()}`,
              ]),
            ),
          40 * 60_000,
        ),
      );
      // Harness steps between phases must not lose the model evidence: a
      // failure is recorded, the evidence written, and then it is reported.
      let problem: unknown = null;
      let noteStatus: number | null = null;
      let beforeUpdate: string | null = null;
      let updated: Awaited<ReturnType<typeof observe>> | null = null;
      let listed: { notes: unknown[] } | null = null;
      // The managed database's volume, whatever name Pi gave it.
      const database = () => {
        const facts = currentFacts(applicationDeployment(app))!;
        const volume = facts.volumes.find(
          (item) => item.name === facts.database?.volume,
        );
        if (!volume) throw new Error("No managed database volume is recorded.");
        return docker([
          "volume",
          "inspect",
          "--format",
          "{{.CreatedAt}}",
          volume.dockerName,
        ]);
      };
      try {
        if (installed.status === "live") {
          noteStatus = (
            await fetch(`http://${host.endpoint}/notes`, {
              method: "POST",
              body: JSON.stringify({ body: retainedNote }),
            })
          ).status;
          beforeUpdate = database();
          updated = await observe(app, async () => {
            host.head = B;
            const proposed = await proposeApplicationRelease(
              app,
              chat,
              "HEAD",
              "Update to the latest revision. It adds a background worker that counts the words in each note; run it as the repository README describes and keep the existing notes.",
            );
            const started = startChange(proposed.id, proposed.updatedAt);
            await executeOperation(started, () =>
              runApplicationRelease(started, AbortSignal.timeout(45 * 60_000)),
            );
          });
          if (updated.outcome === "completed")
            listed = await (
              await fetch(`http://${host.endpoint}/notes`)
            ).json();
        }
      } catch (error) {
        problem = error;
      }
      const current = applicationDeployment(app)!;
      const chosen = JSON.parse(readFileSync(settings, "utf8"));
      const phases = [installed, updated].map(
        (phase) => phase && { ...phase, journal: undefined },
      );
      const text = JSON.stringify(
        {
          model: {
            providerId: chosen.providerId,
            modelId: chosen.modelId,
            reasoningEffort: chosen.reasoningEffort,
          },
          transport:
            "Worker, approval route, provisioning code, planners, workspace, resolver, executor and verification are real. Stand-ins: SSH runs the host script locally; the provider API is a fake that returns this machine; GitHub listings come from fixture trees; the host's port 80 is mapped to a loopback port at execution.",
          provider: {
            servers: host.cloud.servers.length,
            firewall: host.cloud.firewall,
          },
          phases,
          runtime: current.lifecycle?.runtime,
          harnessError: problem ? String(problem) : null,
        },
        null,
        2,
      );
      mkdirSync(intakeEvidence, { recursive: true });
      writeFileSync(join(intakeEvidence, "evidence.json"), text);
      const journals = JSON.stringify([installed.journal, updated?.journal]);
      // No private value reached the evidence, the record or Pi's workspace.
      for (const value of [
        secret,
        readFileSync(
          join(root, "private", "deployments", host.id, "database-password"),
          "utf8",
        ),
      ]) {
        expect(text).not.toContain(value);
        expect(JSON.stringify(current)).not.toContain(value);
        expect(journals).not.toContain(value);
      }
      writeFileSync(join(intakeEvidence, "journal.json"), journals);
      if (problem) throw problem;
      expect(installed).toMatchObject({ outcome: "completed", status: "live" });
      expect(
        installed.selections.some(
          (entry) => entry.stage === "intake" && entry.accepted,
        ),
      ).toBe(true);
      expect(noteStatus).toBe(201);
      expect(updated).toMatchObject({ outcome: "completed" });
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { revision: B },
      });
      await expect
        .poll(
          async () =>
            (
              await (await fetch(`http://${host.endpoint}/notes`)).json()
            ).notes.find((item: { body: string }) => item.body === retainedNote)
              ?.words,
          { timeout: 60000 },
        )
        .toBe(4);
      const final = await (await fetch(`http://${host.endpoint}/notes`)).json();
      expect(final.digest).toBe(
        createHmac("sha256", secret)
          .update(JSON.stringify(final.notes))
          .digest("hex"),
      );
      expect(database()).toBe(beforeUpdate);
      writeFileSync(
        join(intakeEvidence, "checks.json"),
        JSON.stringify(
          {
            noteRetained: true,
            words: 4,
            digestMatchesPrivateInput: true,
            databaseVolumeKept: true,
            version: await (
              await fetch(`http://${host.endpoint}/version`)
            ).json(),
            listedAfterUpdate: listed?.notes,
          },
          null,
          2,
        ),
      );
    } finally {
      cleanup(host.id, []);
    }
  },
  90 * 60_000,
);

const reuseEvidence = join(
  process.cwd(),
  "tests/results/native-compose-proof/pi-proof",
);
const sharedBuilds = (path: string) =>
  file(path, readFileSync(join("tests/fixtures/shared-builds", path)));
it.skipIf(!piProof)(
  "the configured Pi model installs independently built web and worker services that share files and SQLite, then updates them keeping their data",
  async () => {
    // The product's saved Pi choice. Only the settings file is copied; the
    // credential it names stays in place and is read by Pi's runtime alone.
    const settings = process.env.SG_PI_SETTINGS;
    if (!settings || !existsSync(settings))
      throw new Error("Set SG_PI_SETTINGS to a saved pi-settings.json.");
    mkdirSync(join(root, "private"), { recursive: true });
    copyFileSync(settings, join(root, "private", "pi-settings.json"));
    const tree = (version: string) => [
      ...[
        "README.md",
        "web/Dockerfile",
        "web/app.py",
        "worker/Dockerfile",
        "worker/worker.py",
      ].map(sharedBuilds),
      file("web/version.txt", version),
      file("worker/version.txt", version),
    ];
    // v2's worker runs as its own UID. A fresh install tolerates that, but
    // the results volume v1 created stays owned by the old UID. Pi may
    // anticipate this from retained release files or correct host feedback.
    host.trees = {
      [A]: tree("v1"),
      [B]: tree("v2").map((item) =>
        item.path === "worker/Dockerfile"
          ? file(
              item.path,
              item.content.toString().replaceAll("65534:65534", "10001:10001"),
            )
          : item,
      ),
    };
    host.head = A;
    const { app, chat } = newApplication("shared-builds");
    const web = (path: string, init?: RequestInit) =>
      fetch(`http://${host.endpoint}${path}`, init);
    const result = async () => (await (await web("/result")).json()).result;
    const compose = (...args: string[]) =>
      docker([
        "compose",
        "-p",
        `sg-${host.id.slice(0, 8)}`,
        "-f",
        join(host.root, "compose.json"),
        ...args,
      ]);
    /** Each service's build, image and volume mounts, recorded and running. */
    const arrangement = () => {
      const record = applicationDeployment(app)!;
      const facts = currentFacts(record)!;
      const sorted = <T extends { target: string }>(items: T[]) =>
        items.sort((a, b) => a.target.localeCompare(b.target));
      return facts.services.map((service) => {
        const container = compose("ps", "-q", service.name);
        const [image, mounts] = JSON.parse(
          docker([
            "inspect",
            "--format",
            "[{{json .Image}},{{json .Mounts}}]",
            container,
          ]),
        ) as [
          string,
          { Type: string; Name?: string; Destination: string; RW: boolean }[],
        ];
        return {
          service: service.name,
          container,
          build: record.native?.resolved.services[service.name].build ?? null,
          image,
          recorded: sorted(
            facts.volumes.flatMap((volume) =>
              volume.mounts
                .filter((mount) => mount.service === service.name)
                .map((mount) => ({
                  volume: volume.dockerName,
                  target: mount.target,
                  readOnly: mount.readOnly,
                })),
            ),
          ),
          running: sorted(
            mounts
              .filter((mount) => mount.Type === "volume")
              .map((mount) => ({
                volume: mount.Name!,
                target: mount.Destination,
                readOnly: !mount.RW,
              })),
          ),
        };
      });
    };
    const created = () =>
      Object.fromEntries(
        currentFacts(applicationDeployment(app))!.volumes.map((volume) => [
          volume.dockerName,
          docker([
            "volume",
            "inspect",
            "--format",
            "{{.CreatedAt}}",
            volume.dockerName,
          ]),
        ]),
      );
    const value = "retained value from v1";
    stubLocalFetch();
    try {
      const installed = await observe(app, () =>
        install(
          app,
          chat,
          "Deploy this application with its background worker. Its stored value, submitted documents and results must survive updates.",
          (record) =>
            Object.fromEntries(
              currentFacts(record)!.inputs.map((name) => [
                name,
                `synthetic-${name.toLowerCase()}`,
              ]),
            ),
          40 * 60_000,
        ),
      );
      // Harness steps between phases must not lose the model evidence: a
      // failure is recorded, the evidence written, and then it is reported.
      let problem: unknown = null;
      let before: ReturnType<typeof arrangement> | null = null;
      let after: ReturnType<typeof arrangement> | null = null;
      let volumes: Record<string, string> | null = null;
      let processed: unknown = null;
      let updated: Awaited<ReturnType<typeof observe>> | null = null;
      try {
        if (installed.status === "live") {
          before = arrangement();
          volumes = created();
          expect(
            (
              await web("/value", {
                method: "POST",
                body: JSON.stringify({ value }),
              })
            ).status,
          ).toBe(200);
          // The job reaches the worker through the shared documents, and its
          // result returns through the shared results.
          await expect.poll(result, { timeout: 60000 }).toBe(`${value}@v1`);
          processed = await result();
          updated = await observe(app, async () => {
            host.head = B;
            const proposed = await proposeApplicationRelease(
              app,
              chat,
              "HEAD",
              "Update to the latest revision. Keep the stored value, the submitted documents and the worker's results.",
            );
            const started = startChange(proposed.id, proposed.updatedAt);
            await executeOperation(started, () =>
              runApplicationRelease(started, AbortSignal.timeout(45 * 60_000)),
            );
          });
          if (updated.outcome === "completed") after = arrangement();
        }
      } catch (error) {
        problem = error;
      }
      const current = applicationDeployment(app)!;
      const chosen = JSON.parse(readFileSync(settings, "utf8"));
      const text = JSON.stringify(
        {
          model: {
            providerId: chosen.providerId,
            modelId: chosen.modelId,
            reasoningEffort: chosen.reasoningEffort,
          },
          transport:
            "Worker, approval route, provisioning code, planners, workspace, resolver, executor and verification are real. Stand-ins: SSH runs the host script locally; the provider API is a fake that returns this machine; GitHub listings come from fixture trees; the host's port 80 is mapped to a loopback port at execution.",
          fixture:
            "tests/fixtures/shared-builds with version.txt v1 at A; B has v2 and a worker Dockerfile running as UID 10001 instead of 65534.",
          provider: {
            servers: host.cloud.servers.length,
            firewall: host.cloud.firewall,
          },
          phases: [installed, updated].map(
            (phase) => phase && { ...phase, journal: undefined },
          ),
          arrangement: { installed: before, updated: after },
          volumesCreated: volumes,
          processedBeforeUpdate: processed,
          runtime: current.lifecycle?.runtime,
          harnessError: problem ? String(problem) : null,
        },
        null,
        2,
      );
      mkdirSync(reuseEvidence, { recursive: true });
      writeFileSync(join(reuseEvidence, "evidence.json"), text);
      const journals = JSON.stringify([installed.journal, updated?.journal]);
      // No private value reached the evidence, the record or Pi's workspace.
      const password = join(
        root,
        "private",
        "deployments",
        host.id,
        "database-password",
      );
      for (const secret of [
        ...(existsSync(password) ? [readFileSync(password, "utf8")] : []),
        ...(currentFacts(current)?.inputs ?? []).map(
          (name) => `synthetic-${name.toLowerCase()}`,
        ),
      ]) {
        expect(text).not.toContain(secret);
        expect(JSON.stringify(current)).not.toContain(secret);
        expect(journals).not.toContain(secret);
      }
      writeFileSync(join(reuseEvidence, "journal.json"), journals);
      if (problem) throw problem;
      expect(installed).toMatchObject({ outcome: "completed", status: "live" });
      expect(
        installed.selections.some(
          (entry) => entry.stage === "intake" && entry.accepted,
        ),
      ).toBe(true);
      expect(updated).toMatchObject({ outcome: "completed" });
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "verified",
        lastVerified: { revision: B },
      });
      for (const services of [before!, after!]) {
        // What runs is what the release records.
        for (const item of services)
          expect(item.running).toEqual(item.recorded);
        // At least two services build their own, distinct images.
        const builds = services.filter((item) => item.build);
        expect(builds.length).toBeGreaterThanOrEqual(2);
        expect(new Set(builds.map((item) => item.image)).size).toBe(
          builds.length,
        );
      }
      // The update replaced every built image.
      for (const item of after!.filter((item) => item.build))
        expect(
          before!.find((previous) => previous.service === item.service)?.image,
        ).not.toBe(item.image);
      // A volume one service writes and another only reads; read-only mounts
      // refuse writes.
      const mounts = after!.flatMap((item) =>
        item.running.map((mount) => ({ ...mount, container: item.container })),
      );
      const shared = [...new Set(mounts.map((mount) => mount.volume))].filter(
        (volume) => {
          const users = mounts.filter((mount) => mount.volume === volume);
          return (
            users.some((mount) => mount.readOnly) &&
            users.some((mount) => !mount.readOnly)
          );
        },
      );
      expect(shared.length).toBeGreaterThanOrEqual(1);
      const readOnly = mounts.filter((mount) => mount.readOnly);
      for (const mount of readOnly)
        expect(() =>
          docker([
            "exec",
            mount.container,
            "touch",
            `${mount.target}/forbidden`,
          ]),
        ).toThrow(/Read-only file system/);
      // Old state survives, and the new worker processed the retained
      // document into the retained results.
      expect(await (await web("/value")).json()).toEqual({ value });
      await expect.poll(result, { timeout: 60000 }).toBe(`${value}@v2`);
      expect(await (await web("/version")).json()).toEqual({ version: "v2" });
      expect(created()).toEqual(volumes);
      writeFileSync(
        join(reuseEvidence, "checks.json"),
        JSON.stringify(
          {
            processedBeforeUpdate: processed,
            valueRetained: value,
            processedAfterUpdate: `${value}@v2`,
            version: "v2",
            volumesKept: volumes,
            sharedWithMixedAccess: shared,
            readOnlyWritesRefused: readOnly.map(
              ({ volume, target }) => `${volume} at ${target}`,
            ),
            builtImages: Object.fromEntries(
              after!
                .filter((item) => item.build)
                .map((item) => [
                  item.service,
                  {
                    before: before!.find(
                      (previous) => previous.service === item.service,
                    )?.image,
                    after: item.image,
                  },
                ]),
            ),
          },
          null,
          2,
        ),
      );
    } finally {
      cleanup(host.id, []);
    }
  },
  90 * 60_000,
);
