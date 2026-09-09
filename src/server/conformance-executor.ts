// Verification of one exact source tree. Source checks use a disposable
// Python workspace; runtime checks use the image built from the Dockerfile.
// Application containers have bounded resources, no host mounts or Docker
// socket, and no outbound network. Rootless image builds use a separate
// restricted download proxy. The trusted sibling probe records HTTP results.
// Owned resources are removed on completion or recovered after interruption.
import { createHash, randomBytes } from "node:crypto";

import {
  buildApplicationImage,
  removeBuiltImage,
  type BuiltApplicationImage,
} from "./application-image";
import {
  CHECK_ORDER,
  checkDefinition,
  CONFORMANCE_DEFINITION,
} from "./conformance-definition";
import { databasePath } from "./db";
import {
  discoverExecutionEnvironment,
  DockerClient,
  dockerClientFor,
  DockerError,
  type ContainerLogs,
} from "./docker";
import { treeArchive, type TreeFile } from "./execution-tree";
import { PROBE_SCRIPT, PROXY_SCRIPT } from "./runner-scripts";
import { redactSecrets } from "./secrets";
import type {
  AcceptanceStep,
  ConformanceCheckKey,
  ConformanceCheckResult,
  ConformanceRunConfiguration,
  ConformanceStepResult,
  ExecutionEnvironmentStatus,
} from "./types";

export interface ExecutionPlan {
  runId: string;
  applicationId: string;
  files: TreeFile[];
  configuration: ConformanceRunConfiguration;
  /** Variables removed for the configuration check. */
  secretVariables: string[];
  /** Steps for the behavior check; null when none is accepted or proposed. */
  acceptance: { steps: AcceptanceStep[]; label: string } | null;
  /** A command run executes only this after installation. */
  command?: string[];
  /** User-requested interactive preview; never supplied by Pi. */
  keepPreview?: boolean;
}

export interface PreviewRuntime {
  containerId: string;
  url: string;
}

export interface ExecutionOutcome {
  preview?: PreviewRuntime;
  status: "passed" | "failed" | "cancelled" | "timed-out" | "unavailable";
  results: ConformanceCheckResult[];
  imageDigest: string | null;
  error: string | null;
  environment: ExecutionEnvironmentStatus;
}

export interface ExecutionProgress {
  (event: { step: string; message: string }): void;
}

export interface ConformanceExecutor {
  environment(): Promise<ExecutionEnvironmentStatus>;
  /** Pulls the runner images and proves a constrained container runs. */
  prepare(options?: {
    signal?: AbortSignal;
    onProgress?: ExecutionProgress;
  }): Promise<ExecutionEnvironmentStatus>;
  execute(
    plan: ExecutionPlan,
    options?: { signal?: AbortSignal; onProgress?: ExecutionProgress },
  ): Promise<ExecutionOutcome>;
  /** Removes leftovers of runs this database owns, for example after a
   * crash. */
  cleanupLeftovers(runIds?: string[]): Promise<number>;
}

const OWNER_LABEL = "server-guy.owner";
const RUN_LABEL = "server-guy.run";
const APPLICATION_LABEL = "server-guy.application";

function ownerId() {
  return createHash("sha256").update(databasePath()).digest("hex").slice(0, 16);
}

function now() {
  return new Date().toISOString();
}

export class ExecutionCancelled extends Error {}

const limits = CONFORMANCE_DEFINITION.limits;

function bound(logs: string | ContainerLogs) {
  const text = typeof logs === "string" ? logs : logs.combined;
  const alreadyTruncated = typeof logs === "string" ? false : logs.truncated;
  const redacted = redactSecrets(text).text;
  return redacted.length > limits.outputBytes
    ? {
        output: `… (${redacted.length - limits.outputBytes} earlier characters omitted)\n${redacted.slice(-limits.outputBytes)}`,
        truncated: true,
      }
    : { output: redacted, truncated: alreadyTruncated };
}

function environmentList(variables: Record<string, string>) {
  return Object.entries(variables).map(([key, value]) => `${key}=${value}`);
}

const COMMON_ENVIRONMENT = {
  HOME: "/tmp/home",
  PATH: "/workspace/.venv/bin:/usr/local/bin:/usr/bin:/bin",
  VIRTUAL_ENV: "/workspace/.venv",
  UV_CACHE_DIR: "/tmp/uv-cache",
  UV_PYTHON_INSTALL_DIR: "/tmp/uv-python",
  UV_LINK_MODE: "copy",
  UV_NO_PROGRESS: "1",
  UV_PYTHON_PREFERENCE: "system",
  PYTHONUNBUFFERED: "1",
  PYTHONDONTWRITEBYTECODE: "1",
} as const;

/** Runs an arbitrary command after preparing the tmp home the runner needs. */
function wrapped(command: string[]) {
  return [
    "sh",
    "-c",
    'mkdir -p /tmp/home /tmp/uv-cache /tmp/uv-python && exec "$@"',
    "sh",
    ...command,
  ];
}

class DockerRun {
  private readonly prefix: string;
  private readonly labels: Record<string, string>;
  readonly network: string;
  readonly volume: string;
  private readonly created: string[] = [];
  private readonly deadline: number;

  constructor(
    private readonly client: DockerClient,
    private readonly plan: ExecutionPlan,
    private readonly signal: AbortSignal | undefined,
    private readonly progress: ExecutionProgress | undefined,
  ) {
    this.prefix = `sg-${createHash("sha256").update(plan.runId).digest("hex").slice(0, 10)}`;
    this.labels = {
      [OWNER_LABEL]: ownerId(),
      [RUN_LABEL]: plan.runId,
      [APPLICATION_LABEL]: plan.applicationId,
    };
    this.network = `${this.prefix}-net`;
    this.volume = `${this.prefix}-workspace`;
    this.deadline = Date.now() + limits.attemptSeconds * 1000;
  }

  private previewNetwork: string | null = null;
  private applicationImage: BuiltApplicationImage | null = null;
  preview: PreviewRuntime | undefined;

  get applicationImageId() {
    return this.applicationImage?.imageId ?? null;
  }

  async installAndBuild(): Promise<ConformanceCheckResult> {
    const installed = await this.install();
    if (installed.outcome !== "passed") return installed;
    try {
      this.applicationImage = await buildApplicationImage(
        this.client,
        this.plan.files,
        this.plan.configuration.build ?? { dockerfile: "Dockerfile" },
        {
          labels: this.labels,
          signal: this.signal,
          onProgress: (message) => this.say("build", message),
        },
      );
      const output = bound(
        [installed.output, this.applicationImage.output]
          .filter(Boolean)
          .join("\n"),
      );
      return {
        ...installed,
        summary: `Locked dependencies installed and the application Dockerfile built successfully: ${this.applicationImage.imageId}.`,
        output: output.output,
        outputTruncated:
          installed.outputTruncated ||
          this.applicationImage.outputTruncated ||
          output.truncated,
        finishedAt: now(),
      };
    } catch (error) {
      if (this.signal?.aborted) throw error;
      const failedOutput = bound(
        error instanceof Error ? error.message : String(error),
      );
      return {
        ...installed,
        outcome: "failed",
        exitCode: null,
        summary:
          "Locked dependencies installed, but the application image did not build. No application checks ran.",
        output: failedOutput.output,
        outputTruncated: failedOutput.truncated,
        finishedAt: now(),
      };
    }
  }

  private check() {
    if (this.signal?.aborted) throw new ExecutionCancelled("cancelled");
    if (Date.now() > this.deadline)
      throw new DockerError(
        "The execution exceeded its overall time limit.",
        0,
        "ETIMEDOUT",
      );
  }

  private remaining(seconds: number) {
    return Math.max(
      1_000,
      Math.min(seconds * 1000, this.deadline - Date.now()),
    );
  }

  private say(step: string, message: string) {
    this.progress?.({ step, message });
  }

  private hostConfig(extra: Record<string, unknown> = {}) {
    return {
      Binds: [`${this.volume}:/workspace`],
      NetworkMode: this.network,
      Memory: limits.memoryBytes,
      MemorySwap: limits.memoryBytes,
      NanoCpus: limits.cpus * 1_000_000_000,
      PidsLimit: limits.pids,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true,
      Tmpfs: { "/tmp": "rw,size=1073741824" },
      LogConfig: {
        Type: "json-file",
        Config: { "max-size": "4m", "max-file": "1" },
      },
      ...extra,
    };
  }

  private async create(
    name: string,
    config: Record<string, unknown>,
    aliases: string[] = [],
  ) {
    const container = await this.client.createContainer(
      `${this.prefix}-${name}`,
      {
        Labels: this.labels,
        ...config,
        NetworkingConfig: {
          EndpointsConfig: {
            [this.network]: { Aliases: aliases.length ? aliases : undefined },
          },
        },
      },
    );
    this.created.push(container.Id);
    return container.Id;
  }

  private async runToCompletion(
    name: string,
    config: Record<string, unknown>,
    timeoutSeconds: number,
    aliases: string[] = [],
  ) {
    this.check();
    const id = await this.create(name, config, aliases);
    const startedAt = now();
    await this.client.startContainer(id);
    const waited = await this.client.waitContainer(id, {
      timeoutMs: this.remaining(timeoutSeconds),
      signal: this.signal,
    });
    if (waited.timedOut)
      await this.client.stopContainer(id, 2).catch(() => undefined);
    const logs = await this.client.containerLogs(id, limits.outputBytes);
    await this.client.removeContainer(id).catch(() => undefined);
    return {
      exitCode: waited.exitCode,
      timedOut: waited.timedOut,
      logs,
      startedAt,
      finishedAt: now(),
    };
  }

  async setUp(imageDigest: string) {
    this.say("materialize", "Creating the isolated network and workspace");
    await this.client.createNetwork(this.network, this.labels, true);
    await this.client.createVolume(this.volume, this.labels);
    const materialize = await this.create("materialize", {
      Image: CONFORMANCE_DEFINITION.runnerImage,
      Cmd: ["sh", "-c", "chown 1000:1000 /workspace && sleep 600"],
      HostConfig: this.hostConfig({
        ReadonlyRootfs: false,
        CapDrop: ["ALL"],
        CapAdd: ["CHOWN"],
      }),
    });
    await this.client.startContainer(materialize);
    this.say(
      "materialize",
      `Copying ${this.plan.files.length} files of the exact tree into the workspace`,
    );
    await this.client.putArchive(
      materialize,
      "/workspace",
      treeArchive(this.plan.files),
    );
    await this.client.stopContainer(materialize, 1).catch(() => undefined);
    await this.client.removeContainer(materialize).catch(() => undefined);
    return imageDigest;
  }

  async install(): Promise<ConformanceCheckResult> {
    const definition = checkDefinition("install");
    this.say(
      "install",
      "Starting the allowlisting proxy and installing locked dependencies",
    );
    const proxy = await this.client.createContainer(`${this.prefix}-proxy`, {
      Labels: this.labels,
      Image: CONFORMANCE_DEFINITION.runnerImage,
      Cmd: ["python3", "-c", PROXY_SCRIPT],
      User: "1000:1000",
      Env: [
        `ALLOWED_HOSTS=${CONFORMANCE_DEFINITION.dependencyHosts.join(",")}`,
      ],
      HostConfig: {
        NetworkMode: "bridge",
        Memory: 256 * 1024 * 1024,
        MemorySwap: 256 * 1024 * 1024,
        PidsLimit: 64,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,size=16777216" },
        LogConfig: {
          Type: "json-file",
          Config: { "max-size": "1m", "max-file": "1" },
        },
      },
    });
    this.created.push(proxy.Id);
    await this.client.startContainer(proxy.Id);
    await this.client.connectNetwork(this.network, proxy.Id, ["proxy"]);
    let result: ConformanceCheckResult;
    try {
      const run = await this.runToCompletion(
        "install",
        {
          Image: CONFORMANCE_DEFINITION.runnerImage,
          Cmd: wrapped(["uv", "sync", "--locked"]),
          User: "1000:1000",
          WorkingDir: "/workspace",
          Env: environmentList({
            ...COMMON_ENVIRONMENT,
            HTTPS_PROXY: "http://proxy:3128",
            HTTP_PROXY: "http://proxy:3128",
            NO_PROXY: "localhost,127.0.0.1,db,app",
          }),
          HostConfig: this.hostConfig(),
        },
        limits.installSeconds,
      );
      const { output, truncated } = bound(run.logs);
      result = {
        key: "install",
        label: definition.label,
        outcome: run.exitCode === 0 ? "passed" : "failed",
        summary:
          run.exitCode === 0
            ? "uv sync --locked installed the locked dependencies."
            : run.timedOut
              ? `uv sync --locked did not finish within ${limits.installSeconds} seconds.`
              : `uv sync --locked exited with ${run.exitCode}.`,
        output,
        outputTruncated: truncated,
        exitCode: run.exitCode,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
      };
    } finally {
      // Remove installation egress before application runtime checks.
      await this.client.removeContainer(proxy.Id).catch(() => undefined);
    }
    return result;
  }

  private workload(
    name: string,
    command: string[],
    environment: Record<string, string>,
    aliases: string[] = [],
  ) {
    if (
      this.applicationImage &&
      ["app", "configuration", "migrations"].includes(name)
    ) {
      const startup = name !== "migrations";
      return {
        Image: this.applicationImage.imageId,
        // The image owns its entrypoint, command, user and working directory.
        // A migration uses its explicit command, not the server entrypoint.
        ...(startup ? {} : { Entrypoint: [], Cmd: command }),
        Env: environmentList(environment),
        HostConfig: this.hostConfig({ Binds: [] }),
        name,
        aliases,
      };
    }
    return {
      Image: CONFORMANCE_DEFINITION.runnerImage,
      Cmd: wrapped(command),
      User: "1000:1000",
      WorkingDir: "/workspace",
      Env: environmentList({
        ...COMMON_ENVIRONMENT,
        UV_FROZEN: "1",
        UV_OFFLINE: "1",
        ...environment,
      }),
      HostConfig: this.hostConfig(),
      name,
      aliases,
    };
  }

  async configuration(): Promise<ConformanceCheckResult> {
    const definition = checkDefinition("configuration");
    const secrets = this.plan.secretVariables.filter(
      (name) => name in this.plan.configuration.environment,
    );
    if (!secrets.length)
      return {
        key: "configuration",
        label: definition.label,
        outcome: "not-applicable",
        summary: "The contract records no secret variables to withhold.",
        output: null,
        outputTruncated: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        evidence: "Application Contract field configuration.secretVariables",
      };
    this.say(
      "configuration",
      `Starting without ${secrets.join(", ")} to confirm the application refuses`,
    );
    const environment = Object.fromEntries(
      Object.entries(this.plan.configuration.environment).filter(
        ([name]) => !secrets.includes(name),
      ),
    );
    const { name, aliases, ...config } = this.workload(
      "configuration",
      this.plan.configuration.startCommand,
      environment,
    );
    const id = await this.create(name, config, aliases);
    const startedAt = now();
    await this.client.startContainer(id);
    const waited = await this.client.waitContainer(id, {
      timeoutMs: this.remaining(30),
      signal: this.signal,
    });
    if (waited.timedOut)
      await this.client.stopContainer(id, 2).catch(() => undefined);
    const logs = await this.client.containerLogs(id, limits.outputBytes);
    await this.client.removeContainer(id).catch(() => undefined);
    const { output, truncated } = bound(logs);
    const named = secrets.filter((secret) =>
      logs.combined.toLowerCase().includes(secret.toLowerCase()),
    );
    const refused = !waited.timedOut && waited.exitCode !== 0;
    return {
      key: "configuration",
      label: definition.label,
      outcome: refused && named.length ? "passed" : "failed",
      summary: waited.timedOut
        ? `The application kept running for 30 seconds without ${secrets.join(", ")}: missing configuration is not enforced.`
        : waited.exitCode === 0
          ? `The application exited successfully without ${secrets.join(", ")}.`
          : named.length
            ? `The application refused to start without ${secrets.join(", ")} and its output names ${named.join(", ")}.`
            : `The application exited with ${waited.exitCode} without ${secrets.join(", ")}, but its output does not name the missing variable.`,
      output,
      outputTruncated: truncated,
      exitCode: waited.exitCode,
      startedAt,
      finishedAt: now(),
    };
  }

  async database(password: string): Promise<ConformanceCheckResult> {
    const definition = checkDefinition("database");
    if (this.plan.configuration.database !== "postgresql")
      return {
        key: "database",
        label: definition.label,
        outcome: "not-applicable",
        summary: "The contract records no PostgreSQL database.",
        output: null,
        outputTruncated: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        evidence: "Application Contract field persistence.database",
      };
    this.say(
      "database",
      "Starting a disposable PostgreSQL with synthetic credentials",
    );
    const startedAt = now();
    const db = await this.create(
      "db",
      {
        Image: CONFORMANCE_DEFINITION.databaseImage,
        User: "70:70",
        Env: [
          "POSTGRES_USER=app",
          `POSTGRES_PASSWORD=${password}`,
          "POSTGRES_DB=app",
        ],
        HostConfig: {
          NetworkMode: this.network,
          Memory: 512 * 1024 * 1024,
          MemorySwap: 512 * 1024 * 1024,
          PidsLimit: 128,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges:true"],
          LogConfig: {
            Type: "json-file",
            Config: { "max-size": "1m", "max-file": "1" },
          },
        },
      },
      ["db"],
    );
    await this.client.startContainer(db);
    const wait = await this.runToCompletion(
      "db-wait",
      {
        Image: CONFORMANCE_DEFINITION.databaseImage,
        User: "70:70",
        Cmd: [
          "sh",
          "-c",
          "i=0; while [ $i -lt 60 ]; do pg_isready -h db -U app -d app -q && exit 0; i=$((i+1)); sleep 1; done; exit 1",
        ],
        HostConfig: {
          NetworkMode: this.network,
          Memory: 128 * 1024 * 1024,
          MemorySwap: 128 * 1024 * 1024,
          PidsLimit: 32,
          CapDrop: ["ALL"],
          SecurityOpt: ["no-new-privileges:true"],
        },
      },
      75,
    );
    const dbLogs = await this.client.containerLogs(db, limits.outputBytes);
    const { output, truncated } = bound(dbLogs);
    return {
      key: "database",
      label: definition.label,
      outcome: wait.exitCode === 0 ? "passed" : "failed",
      summary:
        wait.exitCode === 0
          ? "PostgreSQL accepted connections on the internal network."
          : "PostgreSQL did not accept connections within 60 seconds.",
      output,
      outputTruncated: truncated,
      exitCode: wait.exitCode,
      startedAt,
      finishedAt: now(),
    };
  }

  async migrations(): Promise<ConformanceCheckResult> {
    const definition = checkDefinition("migrations");
    const tool = this.plan.configuration.migrationTool;
    if (!tool)
      return {
        key: "migrations",
        label: definition.label,
        outcome: "not-applicable",
        summary: "The contract records no migration tool.",
        output: null,
        outputTruncated: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        evidence: "Application Contract field migrations.tool",
      };
    if (tool !== "alembic")
      return {
        key: "migrations",
        label: definition.label,
        outcome: "failed",
        summary: `Migration tool ${tool} is not supported by check set v${CONFORMANCE_DEFINITION.version}; only alembic is.`,
        output: null,
        outputTruncated: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
      };
    this.say("migrations", "Applying alembic migrations to the empty database");
    const { name, aliases, ...config } = this.workload(
      "migrations",
      this.applicationImage
        ? ["alembic", "upgrade", "head"]
        : ["uv", "run", "--frozen", "alembic", "upgrade", "head"],
      this.plan.configuration.environment,
    );
    const run = await this.runToCompletion(
      name,
      config,
      limits.migrationSeconds,
      aliases,
    );
    const { output, truncated } = bound(run.logs);
    return {
      key: "migrations",
      label: definition.label,
      outcome: run.exitCode === 0 ? "passed" : "failed",
      summary:
        run.exitCode === 0
          ? "alembic upgrade head applied every migration to the empty database."
          : run.timedOut
            ? `alembic upgrade head did not finish within ${limits.migrationSeconds} seconds.`
            : `alembic upgrade head exited with ${run.exitCode}.`,
      output,
      outputTruncated: truncated,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  /** Startup, health and behavior share one application container. */
  async application(): Promise<ConformanceCheckResult[]> {
    const startup = checkDefinition("startup");
    const health = checkDefinition("health");
    const behavior = checkDefinition("behavior");
    const { port, healthPath, startCommand, startCommandSource } =
      this.plan.configuration;
    this.say(
      "startup",
      `Starting the application with ${startCommand.join(" ")}`,
    );
    const { name, aliases, ...config } = this.workload(
      "app",
      startCommand,
      this.plan.configuration.environment,
      ["app"],
    );
    const startedAt = now();
    const app = await this.create(name, config, aliases);
    await this.client.startContainer(app);
    const plan = {
      baseUrl: `http://app:${port}`,
      healthPath,
      healthTimeout: limits.startupSeconds,
      steps: this.plan.acceptance?.steps ?? [],
    };
    this.say(
      "health",
      `Probing ${healthPath} on port ${port} from a sibling container`,
    );
    const probe = await this.runProbe(plan, app);
    const state = await this.client.inspectContainer(app).catch(() => null);
    const running = state?.State.Running ?? false;
    if (this.plan.keepPreview && running) {
      const address =
        state?.NetworkSettings?.Networks?.[this.network]?.IPAddress;
      if (!address)
        throw new Error("The preview application has no internal address.");
      this.previewNetwork = `${this.prefix}-preview`;
      await this.client.createNetwork(this.previewNetwork, this.labels, false);
      // Only this trusted fixed-destination TCP relay joins the ingress
      // network. Repository code stays on the isolated internal network.
      const relay = await this.client.createContainer(
        `${this.prefix}-preview`,
        {
          Image: CONFORMANCE_DEFINITION.runnerImage,
          User: "1000:1000",
          Labels: this.labels,
          Cmd: ["python3", "-c", PREVIEW_RELAY, address, String(port)],
          ExposedPorts: { "8080/tcp": {} },
          HostConfig: this.hostConfig({
            NetworkMode: this.previewNetwork,
            Binds: [],
            Memory: 64 * 1024 * 1024,
            MemorySwap: 64 * 1024 * 1024,
            PidsLimit: 64,
            PortBindings: {
              "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }],
            },
          }),
        },
      );
      this.created.push(relay.Id);
      await this.client.connectNetwork(this.network, relay.Id);
      await this.client.startContainer(relay.Id);
      const relayState = await this.client.inspectContainer(relay.Id);
      const binding = relayState.NetworkSettings?.Ports?.["8080/tcp"]?.find(
        (item) => item.HostIp === "127.0.0.1",
      );
      if (!binding || !/^\d+$/.test(binding.HostPort))
        throw new Error("Docker did not provide a local preview port.");
      this.preview = {
        containerId: app,
        url: `http://127.0.0.1:${binding.HostPort}`,
      };
    } else {
      await this.client.stopContainer(app, 5).catch(() => undefined);
    }
    const appLogs = await this.client.containerLogs(app, limits.outputBytes);
    if (!this.preview)
      await this.client.removeContainer(app).catch(() => undefined);
    const observations = probe.logs.stdout
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      });
    const healthRecord = observations.find((item) => item.phase === "health");
    const healthy = healthRecord?.status === 200;
    const appOutput = bound(appLogs);
    const commandNote = this.applicationImage
      ? `Started the built image ${this.applicationImage.imageId} with its declared ENTRYPOINT/CMD, working directory and user.`
      : `Start command from ${startCommandSource === "dockerfile" ? "the tree's Dockerfile CMD" : "the Application Contract"}: ${startCommand.join(" ")}.`;
    const startupResult: ConformanceCheckResult = {
      key: "startup",
      label: startup.label,
      outcome: healthy || running ? "passed" : "failed",
      summary: healthy
        ? `The application started and stayed up. ${commandNote}`
        : running
          ? `The process was still running when the probe gave up. ${commandNote}`
          : `The process exited (${state?.State.ExitCode ?? "unknown"}) before answering. ${commandNote}`,
      output: appOutput.output,
      outputTruncated: appOutput.truncated,
      exitCode: running ? null : (state?.State.ExitCode ?? null),
      startedAt,
      finishedAt: now(),
    };
    const probeOutput = bound(probe.logs);
    const healthResult: ConformanceCheckResult = {
      key: "health",
      label: health.label,
      outcome: healthy ? "passed" : "failed",
      summary: healthy
        ? `GET ${healthPath} answered 200 on app:${port} after ${healthRecord?.attempts ?? "?"} attempt${healthRecord?.attempts === 1 ? "" : "s"}.`
        : healthRecord
          ? `GET ${healthPath} on app:${port} ${
              healthRecord.status === null
                ? `was unreachable from a sibling container (${String(healthRecord.error ?? "no connection")}); a localhost-only bind or wrong port looks like this`
                : `answered ${String(healthRecord.status)}`
            } within ${limits.startupSeconds} seconds.`
          : "The probe produced no health observation.",
      output: probeOutput.output,
      outputTruncated: probeOutput.truncated,
      exitCode: probe.exitCode,
      startedAt: probe.startedAt,
      finishedAt: probe.finishedAt,
    };
    const steps: ConformanceStepResult[] = observations
      .filter((item) => item.phase === "step")
      .map((item) => ({
        name: String(item.name),
        request: String(item.request),
        status: typeof item.status === "number" ? item.status : null,
        passed: item.passed === true,
        detail: String(item.detail ?? ""),
      }));
    const behaviorResult: ConformanceCheckResult = !this.plan.acceptance
      ? {
          key: "behavior",
          label: behavior.label,
          outcome: "not-run",
          summary: "No application-behavior definition to execute.",
          output: null,
          outputTruncated: false,
          exitCode: null,
          startedAt: null,
          finishedAt: null,
        }
      : !healthy
        ? {
            key: "behavior",
            label: behavior.label,
            outcome: "not-run",
            summary: "Not run: the health probe did not pass.",
            output: null,
            outputTruncated: false,
            exitCode: null,
            startedAt: null,
            finishedAt: null,
          }
        : {
            key: "behavior",
            label: behavior.label,
            outcome:
              steps.length === this.plan.acceptance.steps.length &&
              steps.every((step) => step.passed)
                ? "passed"
                : "failed",
            summary: `${this.plan.acceptance.label}: ${steps.filter((step) => step.passed).length} of ${this.plan.acceptance.steps.length} steps passed${
              steps.some((step) => !step.passed)
                ? ` · first failure: ${steps.find((step) => !step.passed)!.name} (${steps.find((step) => !step.passed)!.detail})`
                : ""
            }.`,
            output: probeOutput.output,
            outputTruncated: probeOutput.truncated,
            exitCode: probe.exitCode,
            startedAt: probe.startedAt,
            finishedAt: probe.finishedAt,
            steps,
          };
    return [startupResult, healthResult, behaviorResult];
  }

  /**
   * Runs the probe beside the application. When the application process
   * exits before the health path answers, the probe is stopped early: its
   * partial output is the evidence, and nothing waits out the full bound.
   */
  private async runProbe(plan: Record<string, unknown>, app: string) {
    this.check();
    const id = await this.create("probe", {
      Image: CONFORMANCE_DEFINITION.runnerImage,
      Cmd: ["python3", "-c", PROBE_SCRIPT],
      User: "1000:1000",
      Env: [`PROBE_PLAN=${JSON.stringify(plan)}`, "PYTHONUNBUFFERED=1"],
      HostConfig: this.hostConfig({
        Binds: [],
        Memory: 256 * 1024 * 1024,
        MemorySwap: 256 * 1024 * 1024,
        PidsLimit: 32,
      }),
    });
    const startedAt = now();
    await this.client.startContainer(id);
    const deadline =
      Date.now() +
      this.remaining(limits.startupSeconds + limits.behaviorSeconds + 15);
    let exitCode: number | null = null;
    let timedOut = false;
    let appExitedAt = 0;
    for (;;) {
      const probe = await this.client.inspectContainer(id).catch(() => null);
      if (probe && !probe.State.Running) {
        exitCode = probe.State.ExitCode;
        break;
      }
      const application = await this.client
        .inspectContainer(app)
        .catch(() => null);
      if (application && !application.State.Running) {
        appExitedAt ||= Date.now();
        // Give the probe a moment to record the refusal, then stop it.
        if (Date.now() - appExitedAt > 3_000) {
          await this.client.stopContainer(id, 1).catch(() => undefined);
          break;
        }
      }
      if (Date.now() > deadline) {
        await this.client.stopContainer(id, 2).catch(() => undefined);
        timedOut = true;
        break;
      }
      this.check();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    const logs = await this.client.containerLogs(id, limits.outputBytes);
    await this.client.removeContainer(id).catch(() => undefined);
    return { exitCode, timedOut, logs, startedAt, finishedAt: now() };
  }

  async tests(): Promise<ConformanceCheckResult> {
    const definition = checkDefinition("tests");
    const hasTests = this.plan.files.some(
      (file) =>
        /(^|\/)tests?\/.*\.py$/.test(file.path) ||
        /(^|\/)test_[^/]*\.py$/.test(file.path),
    );
    if (!hasTests)
      return {
        key: "tests",
        label: definition.label,
        outcome: "not-applicable",
        summary: "The tree has no test files.",
        output: null,
        outputTruncated: false,
        exitCode: null,
        startedAt: null,
        finishedAt: null,
        evidence: "Executed tree: no tests/ directory and no test_*.py files",
      };
    this.say("tests", "Running the repository's pytest suite");
    const { name, aliases, ...config } = this.workload(
      "tests",
      ["uv", "run", "--frozen", "pytest", "-q", "-p", "no:cacheprovider"],
      this.plan.configuration.environment,
    );
    const run = await this.runToCompletion(
      name,
      config,
      limits.testSeconds,
      aliases,
    );
    const { output, truncated } = bound(run.logs);
    return {
      key: "tests",
      label: definition.label,
      outcome: run.exitCode === 0 ? "passed" : "failed",
      summary:
        run.exitCode === 0
          ? "pytest passed."
          : run.timedOut
            ? `pytest did not finish within ${limits.testSeconds} seconds.`
            : `pytest exited with ${run.exitCode}.`,
      output,
      outputTruncated: truncated,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  async command(command: string[]): Promise<ConformanceCheckResult> {
    this.say("command", `Running ${command.join(" ")}`);
    const { name, aliases, ...config } = this.workload(
      "command",
      command,
      this.plan.configuration.environment,
    );
    const run = await this.runToCompletion(
      name,
      config,
      limits.commandSeconds,
      aliases,
    );
    const { output, truncated } = bound(run.logs);
    return {
      key: "command",
      label: `Command: ${command.join(" ")}`,
      outcome: run.exitCode === 0 ? "passed" : "failed",
      summary: run.timedOut
        ? `The command did not finish within ${limits.commandSeconds} seconds.`
        : `The command exited with ${run.exitCode}.`,
      output,
      outputTruncated: truncated,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    };
  }

  async tearDown() {
    for (const id of this.created.reverse())
      await this.client.removeContainer(id).catch(() => undefined);
    await this.client.removeNetwork(this.network).catch(() => undefined);
    if (this.previewNetwork)
      await this.client
        .removeNetwork(this.previewNetwork)
        .catch(() => undefined);
    await this.client.removeVolume(this.volume).catch(() => undefined);
    if (this.applicationImage)
      await removeBuiltImage(
        this.client,
        this.applicationImage.reference,
      ).catch(() => undefined);
  }
}

function notRun(
  key: ConformanceCheckKey,
  reason: string,
): ConformanceCheckResult {
  return {
    key,
    label: checkDefinition(key).label,
    outcome: "not-run",
    summary: reason,
    output: null,
    outputTruncated: false,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
  };
}

let cachedEnvironment: ExecutionEnvironmentStatus | null = null;

/** The engine status as last checked; null until the first check. */
export function lastKnownEnvironment() {
  return cachedEnvironment;
}

export function rememberEnvironment(status: ExecutionEnvironmentStatus) {
  cachedEnvironment = {
    ...status,
    verified: status.verified ?? cachedEnvironment?.verified ?? null,
  };
  return cachedEnvironment;
}

export function dockerConformanceExecutor(): ConformanceExecutor {
  return {
    async environment() {
      return rememberEnvironment(await discoverExecutionEnvironment());
    },
    async prepare(options = {}) {
      const status = await this.environment();
      const client = dockerClientFor(status);
      if (!client) return status;
      const pull = async (reference: string) => {
        options.onProgress?.({
          step: "images",
          message: `Checking ${reference}`,
        });
        try {
          return await client.inspectImage(reference);
        } catch {
          options.onProgress?.({
            step: "images",
            message: `Pulling ${reference}`,
          });
          return client.pullImage(reference, {
            signal: options.signal,
            onProgress: (line) =>
              options.onProgress?.({
                step: "images",
                message: line.slice(0, 160),
              }),
          });
        }
      };
      const runner = await pull(CONFORMANCE_DEFINITION.runnerImage);
      const database = await pull(CONFORMANCE_DEFINITION.databaseImage);
      options.onProgress?.({
        step: "verify",
        message: "Running a constrained container to verify the runner",
      });
      const id = (
        await client.createContainer(
          `sg-verify-${randomBytes(4).toString("hex")}`,
          {
            Image: CONFORMANCE_DEFINITION.runnerImage,
            Cmd: ["python3", "-c", "print('runner ok')"],
            User: "1000:1000",
            Labels: { [OWNER_LABEL]: ownerId() },
            HostConfig: {
              NetworkMode: "none",
              Memory: 128 * 1024 * 1024,
              MemorySwap: 128 * 1024 * 1024,
              PidsLimit: 16,
              CapDrop: ["ALL"],
              SecurityOpt: ["no-new-privileges:true"],
              ReadonlyRootfs: true,
            },
          },
        )
      ).Id;
      try {
        await client.startContainer(id);
        const waited = await client.waitContainer(id, {
          timeoutMs: 60_000,
          signal: options.signal,
        });
        const logs = await client.containerLogs(id, 1024);
        if (waited.exitCode !== 0 || !logs.stdout.includes("runner ok"))
          throw new DockerError(
            `The verification container exited with ${waited.exitCode ?? "timeout"}.`,
            0,
          );
      } finally {
        await client.removeContainer(id).catch(() => undefined);
      }
      return rememberEnvironment({
        ...status,
        verified: {
          at: now(),
          runnerImage: CONFORMANCE_DEFINITION.runnerImage,
          runnerImageDigest: runner.RepoDigests?.[0] ?? runner.Id,
          databaseImage: CONFORMANCE_DEFINITION.databaseImage,
          databaseImageDigest: database.RepoDigests?.[0] ?? database.Id,
        },
      });
    },
    async execute(plan, options = {}) {
      const environment = await this.environment();
      const client = dockerClientFor(environment);
      if (!client)
        return {
          status: "unavailable",
          results: CHECK_ORDER.map((key) =>
            notRun(key, "The execution environment is not available."),
          ),
          imageDigest: null,
          error: environment.summary,
          environment,
        };
      let imageDigest: string | null = null;
      try {
        const image = await client.inspectImage(
          CONFORMANCE_DEFINITION.runnerImage,
        );
        imageDigest = image.RepoDigests?.[0] ?? image.Id;
      } catch {
        const prepared = await this.prepare(options);
        imageDigest = prepared.verified?.runnerImageDigest ?? null;
        if (!imageDigest)
          return {
            status: "unavailable",
            results: CHECK_ORDER.map((key) =>
              notRun(key, "The runner image is not available."),
            ),
            imageDigest: null,
            error: "The runner image could not be prepared.",
            environment: prepared,
          };
      }
      const results: ConformanceCheckResult[] = [];
      const password = randomBytes(12).toString("hex");
      const configuration: ConformanceRunConfiguration = {
        ...plan.configuration,
        environment: Object.fromEntries(
          Object.entries(plan.configuration.environment).map(([key, value]) => [
            key,
            value.replace("<synthetic-per-run>", password),
          ]),
        ),
      };
      const executionPlan: ExecutionPlan = { ...plan, configuration };
      const executing = new DockerRun(
        client,
        executionPlan,
        options.signal,
        options.onProgress,
      );
      try {
        await executing.setUp(imageDigest);
        if (plan.command) {
          const install = await executing.install();
          results.push(install);
          if (install.outcome === "passed")
            results.push(await executing.command(plan.command));
          else
            results.push(
              notRun("command", "Not run: the locked installation failed."),
            );
        } else {
          const install = await executing.installAndBuild();
          imageDigest = executing.applicationImageId;
          results.push(install);
          if (install.outcome !== "passed") {
            for (const key of CHECK_ORDER.slice(1))
              results.push(
                notRun(
                  key,
                  "Not run: dependency installation or application image build failed.",
                ),
              );
          } else {
            results.push(await executing.configuration());
            const database = await executing.database(password);
            results.push(database);
            if (database.outcome === "failed") {
              for (const key of [
                "migrations",
                "startup",
                "health",
                "behavior",
                "tests",
              ] as const)
                results.push(
                  notRun(
                    key,
                    "Not run: the disposable database is not reachable.",
                  ),
                );
            } else {
              results.push(await executing.migrations());
              results.push(...(await executing.application()));
              results.push(await executing.tests());
            }
          }
        }
      } catch (error) {
        await executing.tearDown();
        if (error instanceof ExecutionCancelled || options.signal?.aborted) {
          for (const key of CHECK_ORDER)
            if (!results.some((item) => item.key === key))
              results.push(
                notRun(key, "Not run: the execution was cancelled."),
              );
          return {
            status: "cancelled",
            results,
            imageDigest,
            error: null,
            environment,
          };
        }
        const timedOut =
          error instanceof DockerError && error.code === "ETIMEDOUT";
        for (const key of CHECK_ORDER)
          if (!results.some((item) => item.key === key))
            results.push(
              notRun(
                key,
                timedOut
                  ? "Not run: the execution exceeded its time limit."
                  : "Not run: the runner failed.",
              ),
            );
        return {
          status: timedOut ? "timed-out" : "unavailable",
          results,
          imageDigest,
          error: redactSecrets(
            error instanceof Error ? error.message : "The runner failed.",
          ).text,
          environment,
        };
      }
      const required = plan.command
        ? results
        : results.filter((item) => checkDefinition(item.key).required);
      const passed = required.every(
        (item) =>
          item.outcome === "passed" || item.outcome === "not-applicable",
      );
      const preview =
        passed && plan.keepPreview ? executing.preview : undefined;
      if (!preview) await executing.tearDown();
      return {
        ...(preview ? { preview } : {}),
        status: passed ? "passed" : "failed",
        results,
        imageDigest,
        error: null,
        environment,
      };
    },
    async cleanupLeftovers(runIds) {
      const status = await this.environment();
      const client = dockerClientFor(status);
      if (!client) return 0;
      const labels = { [OWNER_LABEL]: ownerId() };
      const keep = (runId: string | undefined) =>
        runIds !== undefined && (!runId || !runIds.includes(runId));
      let removed = 0;
      for (const container of await client.listContainers(labels)) {
        if (keep(container.Labels[RUN_LABEL])) continue;
        await client.removeContainer(container.Id).catch(() => undefined);
        removed++;
      }
      for (const network of await client.listNetworks(labels)) {
        if (keep(network.Labels?.[RUN_LABEL])) continue;
        await client.removeNetwork(network.Id).catch(() => undefined);
        removed++;
      }
      for (const volume of await client.listVolumes(labels)) {
        if (keep(volume.Labels?.[RUN_LABEL])) continue;
        await client.removeVolume(volume.Name).catch(() => undefined);
        removed++;
      }
      for (const image of await client.listImages(labels)) {
        if (keep(image.Labels?.[RUN_LABEL])) continue;
        for (const reference of image.RepoTags ?? []) {
          if (!/^server-guy-build:[a-f0-9]{24}$/.test(reference)) continue;
          await removeBuiltImage(client, reference).catch(() => undefined);
          removed++;
        }
      }
      return removed;
    },
  };
}

// A bounded byte relay supports HTTP and WebSockets without interpreting a
// user-controlled URL or allowing CONNECT requests to choose a destination.
const PREVIEW_RELAY = `
import os, socket, socketserver, select, sys, threading
host, port = sys.argv[1], int(sys.argv[2])
slots = threading.BoundedSemaphore(24)
class Relay(socketserver.BaseRequestHandler):
    def handle(self):
        if not slots.acquire(blocking=False): return
        try:
            with socket.create_connection((host, port), timeout=10) as upstream:
                self.request.settimeout(30)
                upstream.settimeout(30)
                peers = [self.request, upstream]
                while True:
                    ready, _, _ = select.select(peers, [], [], 30)
                    if not ready: break
                    for source in ready:
                        data = source.recv(65536)
                        if not data: return
                        (upstream if source is self.request else self.request).sendall(data)
        except OSError: pass
        finally: slots.release()
class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
threading.Timer(3600, lambda: os._exit(0)).start()
with Server(("0.0.0.0", 8080), Relay) as server: server.serve_forever()
`;
