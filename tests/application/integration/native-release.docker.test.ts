// Opt-in (SG_RUN_DOCKER_PROOF=1): native Compose releases through the real
// operation boundary, pinned resolver and locked executor, against local
// Docker. Only the SSH transport and Pi are stand-ins: the transport runs the
// host script locally, and a scripted Pi submits files a model would author.
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
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
}));
const platform = { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" };
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  const local = (command: string) =>
    command
      .replace(/^flock -n \S+ /, "")
      .replaceAll(`/opt/server-guy/${host.id}`, host.root);
  const endpoint = () => {
    try {
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
            "app",
            "8080",
          ],
          { encoding: "utf8" },
        )
        .trim();
    } catch {
      /* worker-only arrangements publish nothing */
    }
  };
  return {
    ...real,
    spawn: (file: string, args: string[], options: object) => {
      if (file !== "ssh") throw new Error("Unexpected fixture transport");
      return real.spawn("sh", ["-c", local(args.at(-1)!)], {
        ...options,
        env: platform,
      });
    },
    execFile: (
      file: string,
      args: string[],
      options: object,
      callback: (error: unknown, stdout: string) => void,
    ) => {
      if (file !== "ssh") throw new Error("Unexpected fixture transport");
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
vi.mock("../../../src/server/deployment-compose", async (original) => {
  const real =
    await original<typeof import("../../../src/server/deployment-compose")>();
  return {
    ...real,
    // The legacy renderer publishes port 80; bind a loopback port locally.
    composeDefinition: (...args: Parameters<typeof real.composeDefinition>) => {
      const value = real.composeDefinition(...args);
      (value.services.app as { ports: string[] }).ports = ["127.0.0.1::8080"];
      for (const service of Object.values(value.services))
        (service as Record<string, unknown>).platform = "linux/amd64";
      return value;
    },
  };
});
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
vi.mock("../../../src/server/deployment-planner", () => ({
  planRelease: async (
    _source: unknown,
    _record: unknown,
    _signal: AbortSignal,
    options: never,
  ) => host.pi!(options),
}));
import {
  insertApplication,
  insertChat,
  insertWorkspace,
} from "../../../src/server/db";
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
import {
  composeDefinition,
  composeStartCommand,
} from "../../../src/server/deployment-compose";
import {
  verifyDeployment,
  verifyServiceImages,
} from "../../../src/server/deployment-executor";
import { executeRelease } from "../../../src/server/release-executor";
import {
  prepareNativeRelease,
  type NativeSelection,
} from "../../../src/server/native-compose";
import { releaseOf } from "../../../src/server/deployment-release";
import {
  currentFacts,
  planFacts,
  type ReleaseFacts,
} from "../../../src/server/release-facts";
import { scopeDifferences } from "../../../src/server/release-scope";
import type { DeploymentPlan } from "../../../src/server/deployment-types";
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
});
/** A live application record on the "host" with its private inputs. */
function application(repositoryName: string) {
  const app = insertApplication({
    name: repositoryName,
    repositoryUrl: `https://github.com/qa/${repositoryName}`,
    repositoryOwner: "qa",
    repositoryName,
    environment: "production",
    approvalMode: "always-ask",
    approvalScope: "Test",
  }).id;
  const chat = insertChat(insertWorkspace(app).id, "Release", true).id;
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
  for (const image of images)
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
  "converts an existing app to equivalent native Compose, corrects within scope, refuses a data move, reconciles a lost reply and rolls back",
  async () => {
    const source = ["Dockerfile", "app.py"].map((path) =>
      file(path, readFileSync(join("tests/fixtures/release-app", path))),
    );
    host.trees = {
      [A]: [...source, file("version.txt", "v1")],
      [B]: [...source, file("version.txt", "v2")],
    };
    const { app, chat, record } = application("release");
    const plan: DeploymentPlan = {
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
    Object.assign(record, { revision: A, plan });
    saveDeployment(record);
    const project = `sg-${record.id.slice(0, 8)}`;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (input: string | URL | Request, init?: RequestInit) =>
        originalFetch(
          String(input instanceof Request ? input.url : input).replace(
            "http://127.0.0.1/",
            `http://${host.endpoint}/`,
          ),
          init,
        ),
    );
    try {
      // v1 runs as the legacy renderer deployed it.
      mkdirSync(join(host.root, "source"));
      for (const item of host.trees[A])
        writeFileSync(join(host.root, "source", item.path), item.content);
      writeFileSync(
        join(host.root, "compose.json"),
        JSON.stringify(
          composeDefinition(plan, A, record.id, "synthetic-password", {}),
        ),
      );
      execFileSync(
        "sh",
        [
          "-c",
          composeStartCommand(
            plan,
            `docker compose -p ${project} -f compose.json`,
          ),
        ],
        { cwd: host.root, stdio: "pipe", timeout: 300000, env: platform },
      );
      host.endpoint = docker([
        "compose",
        "-p",
        project,
        "-f",
        join(host.root, "compose.json"),
        "port",
        "app",
        "8080",
      ]);
      const live = applicationDeployment(app)!;
      await verifyServiceImages(live, AbortSignal.timeout(90000));
      await verifyDeployment(live, AbortSignal.timeout(90000));
      Object.assign(live, {
        imageId: live.serviceImages!.app,
        verifiedAt: new Date().toISOString(),
      });
      saveDeployment(live);
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
        expect(view.services.app.volumes).toEqual(["data:/data"]);
        const compose = `services:
  app:
    build: { context: ., dockerfile: Dockerfile }
    platform: linux/amd64
    restart: unless-stopped
    ports: ["127.0.0.1::8080"]
    volumes: ["data:/data"]
    logging: { driver: json-file, options: { max-size: 10m, max-file: "3" } }
volumes:
  data: {}
`;
        expect(
          await pi.apply(
            {
              compose: ["compose.yaml"],
              summary: "The same release, authored as native Compose",
            },
            [file("compose.yaml", compose)],
          ),
        ).toMatchObject({ ok: true });
      });
      expect(converted.state).toBe("verified");
      // Equivalent effects need no new decision; the rebuilt image replaces
      // the container exactly as a legacy release of this revision would.
      expect(volume()).toBe(v1Volume);
      let current = applicationDeployment(app)!;
      expect(
        scopeDifferences(planFacts(plan, record.id, A), currentFacts(current)!),
      ).toEqual([]);
      expect(current.plan).toBeNull();
      expect(current.native).toMatchObject({
        resolver: "docker compose 2.40.3",
        resolved: { name: project },
      });
      expect(current.native!.files.map((f) => f.path)).toEqual([
        "compose.yaml",
        ".server-guy/override.compose.json",
      ]);
      expect(current.lifecycle!.releases[0].plan).toEqual(plan);
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
    ports: ["127.0.0.1::8080"]
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
        expect(host.executions).toBe(executionsBefore);
        host.loseResult = true;
        expect(
          await pi.apply(selection, [file("compose.yaml", update("data"))]),
        ).toMatchObject({ ok: false, kind: "transport", retryable: false });
        const blocked = await pi.apply(selection, [
          file("compose.yaml", update("data")),
        ]);
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

      // 3. Compatible rollback to the legacy release's verified images.
      const v1 = current.lifecycle!.releases[0];
      const back = await change(app, chat, async () => {}, {
        releaseId: v1.id,
        compatibilityEvidence:
          "v2 reads and writes the same settings table as v1.",
      });
      expect(back.state).toBe("verified");
      current = applicationDeployment(app)!;
      expect(current).toMatchObject({ plan, revision: A });
      expect(current.native).toBeUndefined();
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
  "runs a worker-only arrangement as observed, never verified, and still updates it from that baseline",
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

      // The observed baseline takes a scoped update; it stays unverified.
      host.head = B;
      const updated = await change(app, chat, async (pi) => {
        expect(await pi.apply(selection, [compose])).toMatchObject({
          ok: true,
        });
      });
      expect(updated.evidence).toContain("Behavior is unverified");
      current = applicationDeployment(app)!;
      expect(current.lifecycle!.attempts.map((a) => a.outcome)).toEqual([
        "observed",
        "observed",
      ]);
      expect(current.lifecycle!.runtime).toMatchObject({
        state: "observed",
        lastVerified: null,
      });
      await expect
        .poll(() => exec("consumer", ["cat", "/output/job.txt"]), {
          timeout: 30000,
        })
        .toBe("job@v2@v2");
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
