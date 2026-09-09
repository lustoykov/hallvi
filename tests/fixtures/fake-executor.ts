// A conformance executor for the deterministic tests: outcomes follow the
// exact tree it is handed, so a preview over a fixed tree passes for the same
// reason the real runner would, without containers. It records every plan,
// can hang for cancellation tests and can report an unavailable environment.
import type {
  ConformanceExecutor,
  ExecutionOutcome,
  ExecutionPlan,
} from "../../src/server/conformance-executor";
import type {
  ConformanceCheckKey,
  ConformanceCheckResult,
  ExecutionEnvironmentStatus,
} from "../../src/server/types";

const ORDER: ConformanceCheckKey[] = [
  "install",
  "configuration",
  "database",
  "migrations",
  "startup",
  "health",
  "behavior",
  "tests",
];

export function readyEnvironment(): ExecutionEnvironmentStatus {
  return {
    state: "ready",
    ready: true,
    checkedAt: new Date().toISOString(),
    host: { hostname: "controller", platform: "linux", arch: "x64" },
    endpoint: "unix:///var/run/docker.sock",
    endpointSource: "known-socket",
    engine: {
      version: "28.5.1",
      apiVersion: "1.51",
      platform: "Synthetic",
      os: "linux",
      arch: "x86_64",
    },
    summary: "Docker Engine 28.5.1 (Synthetic) is reachable on controller.",
    recovery: { label: "", href: null, steps: [] },
    detail: null,
    verified: {
      at: new Date().toISOString(),
      runnerImage: "synthetic/runner",
      runnerImageDigest: "sha256:runner",
      databaseImage: "synthetic/postgres",
      databaseImageDigest: "sha256:postgres",
    },
  };
}

export function missingEnvironment(): ExecutionEnvironmentStatus {
  return {
    ...readyEnvironment(),
    state: "not-found",
    ready: false,
    endpoint: null,
    endpointSource: null,
    engine: null,
    verified: null,
    summary:
      "No Docker Engine was found on controller: DOCKER_HOST is not set, no Docker context is selected and none of the known engine sockets exist.",
    recovery: {
      label: "Install Docker Engine (official instructions)",
      href: "https://docs.docker.com/engine/install/",
      steps: ["Install Docker Engine.", "Then choose Check again."],
    },
  };
}

export class FakeExecutor implements ConformanceExecutor {
  plans: ExecutionPlan[] = [];
  status = readyEnvironment();
  /** When set, execute waits until release() is called. */
  hold: { resolve: () => void; promise: Promise<void> } | null = null;
  reached: (() => void) | null = null;

  holdNext() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    this.hold = { resolve, promise };
  }

  async environment() {
    return this.status;
  }

  async prepare() {
    return this.status;
  }

  async cleanupLeftovers() {
    return 0;
  }

  async execute(
    plan: ExecutionPlan,
    options: { signal?: AbortSignal } = {},
  ): Promise<ExecutionOutcome> {
    this.plans.push(plan);
    if (!this.status.ready)
      return {
        status: "unavailable",
        results: ORDER.map((key) =>
          notRun(key, "The execution environment is not available."),
        ),
        imageDigest: null,
        error: this.status.summary,
        environment: this.status,
      };
    if (this.hold) {
      const { promise } = this.hold;
      this.hold = null;
      this.reached?.();
      await Promise.race([
        promise,
        new Promise<void>((resolve) =>
          options.signal?.addEventListener("abort", () => resolve(), {
            once: true,
          }),
        ),
      ]);
      if (options.signal?.aborted)
        return {
          status: "cancelled",
          results: ORDER.map((key) =>
            notRun(key, "Not run: the execution was cancelled."),
          ),
          imageDigest: "sha256:runner",
          error: null,
          environment: this.status,
        };
    }
    const text = (path: string) =>
      plan.files.find((file) => file.path === path)?.content.toString("utf8") ??
      "";
    if (plan.command) {
      const output = plan.command.join(" ").includes("ls /var/run/docker.sock")
        ? "ls: cannot access '/var/run/docker.sock': No such file or directory\nuid=1000\n"
        : `synthetic output of ${plan.command.join(" ")}\n`;
      return {
        status: "passed",
        results: [
          result(
            "install",
            "passed",
            "uv sync --locked installed the locked dependencies.",
          ),
          {
            ...result("command", "passed", `The command exited with 0.`),
            label: `Command: ${plan.command.join(" ")}`,
            output,
            exitCode: 0,
          },
        ],
        imageDigest: "sha256:runner",
        error: null,
        environment: this.status,
      };
    }
    const results: ConformanceCheckResult[] = [];
    const pyproject = text("pyproject.toml");
    const runtimeSection = pyproject.split("[tool.uv]")[0];
    const install = /"httpx>=0\.27"/.test(runtimeSection) ? "failed" : "passed";
    results.push(
      result(
        "install",
        install,
        install === "passed"
          ? "uv sync --locked installed the locked dependencies."
          : "uv sync --locked exited with 2: the lockfile needs to be updated.",
      ),
    );
    if (install === "failed") {
      for (const key of ORDER.slice(1))
        results.push(notRun(key, "Not run: the locked installation failed."));
      return {
        status: "failed",
        results,
        imageDigest: "sha256:runner",
        error: null,
        environment: this.status,
      };
    }
    const config = text("app/config.py");
    results.push(
      plan.secretVariables.length === 0
        ? {
            ...result(
              "configuration",
              "not-applicable",
              "The contract records no secret variables to withhold.",
            ),
            evidence:
              "Application Contract field configuration.secretVariables",
          }
        : result(
            "configuration",
            /secret_key: str\s*$/m.test(config) ? "passed" : "failed",
            /secret_key: str\s*$/m.test(config)
              ? "The application refused to start without SECRET_KEY and its output names secret_key."
              : "The application kept running for 30 seconds without SECRET_KEY: missing configuration is not enforced.",
          ),
    );
    results.push(
      plan.configuration.database === "postgresql"
        ? result(
            "database",
            "passed",
            "PostgreSQL accepted connections on the internal network.",
          )
        : {
            ...result(
              "database",
              "not-applicable",
              "The contract records no PostgreSQL database.",
            ),
            evidence: "Application Contract field persistence.database",
          },
    );
    const migration = text("alembic/versions/0001_initial.py");
    results.push(
      !plan.configuration.migrationTool
        ? {
            ...result(
              "migrations",
              "not-applicable",
              "The contract records no migration tool.",
            ),
            evidence: "Application Contract field migrations.tool",
          }
        : result(
            "migrations",
            migration.includes("CREATE TABLE todos (id") ? "failed" : "passed",
            migration.includes("CREATE TABLE todos (id")
              ? "alembic upgrade head exited with 1."
              : "alembic upgrade head applied every migration to the empty database.",
          ),
    );
    const main = text("app/main.py");
    const startup = main.includes("app.missing") ? "failed" : "passed";
    results.push(
      result(
        "startup",
        startup,
        startup === "passed"
          ? `The application started and stayed up. Start command from ${plan.configuration.startCommandSource === "dockerfile" ? "the tree's Dockerfile CMD" : "the Application Contract"}: ${plan.configuration.startCommand.join(" ")}.`
          : "The process exited (1) before answering: ModuleNotFoundError: No module named 'app.missing'.",
      ),
    );
    const bound = plan.configuration.startCommand.join(" ").includes("0.0.0.0");
    const health =
      startup === "passed" &&
      main.includes(`@app.get("${plan.configuration.healthPath}")`) &&
      bound
        ? "passed"
        : "failed";
    results.push(
      result(
        "health",
        health,
        health === "passed"
          ? `GET ${plan.configuration.healthPath} answered 200 on app:${plan.configuration.port} after 2 attempts.`
          : !bound
            ? `GET ${plan.configuration.healthPath} on app:${plan.configuration.port} was unreachable from a sibling container (connection refused); a localhost-only bind or wrong port looks like this.`
            : `GET ${plan.configuration.healthPath} on app:${plan.configuration.port} answered 404 within 90 seconds.`,
      ),
    );
    const todos = text("app/routes/todos.py");
    if (!plan.acceptance)
      results.push(
        notRun("behavior", "No application-behavior definition to execute."),
      );
    else if (health !== "passed")
      results.push(
        notRun("behavior", "Not run: the health probe did not pass."),
      );
    else {
      const persisted = todos.includes("session.commit()");
      const steps = plan.acceptance.steps.map((step, index) => ({
        name: step.name,
        request: `${step.method} ${step.path}`,
        status: step.path.startsWith("/todos")
          ? step.method === "POST"
            ? 201
            : 200
          : 404,
        passed: step.path.startsWith("/todos") && (index === 0 || persisted),
        detail: step.path.startsWith("/todos")
          ? index === 0 || persisted
            ? "ok"
            : 'body lacks "Buy milk"'
          : "status 404, expected 200",
      }));
      const passed = steps.every((step) => step.passed);
      results.push({
        ...result(
          "behavior",
          passed ? "passed" : "failed",
          `${plan.acceptance.label}: ${steps.filter((step) => step.passed).length} of ${steps.length} steps passed${passed ? "" : ` · first failure: ${steps.find((step) => !step.passed)!.name} (${steps.find((step) => !step.passed)!.detail})`}.`,
        ),
        steps,
      });
    }
    const hasTests = plan.files.some((file) =>
      /^tests\/.*\.py$/.test(file.path),
    );
    const testFile = text("tests/test_todos.py");
    const testsPass =
      hasTests &&
      !testFile.includes("created.status_code == 200") &&
      health === "passed";
    results.push(
      !hasTests
        ? {
            ...result("tests", "not-applicable", "The tree has no test files."),
            evidence:
              "Executed tree: no tests/ directory and no test_*.py files",
          }
        : result(
            "tests",
            testsPass ? "passed" : "failed",
            testsPass ? "pytest passed." : "pytest exited with 1.",
          ),
    );
    const ok = results.every(
      (item) => item.outcome === "passed" || item.outcome === "not-applicable",
    );
    return {
      status: ok ? "passed" : "failed",
      results,
      imageDigest: "sha256:runner",
      error: null,
      environment: this.status,
    };
  }
}

function result(
  key: ConformanceCheckKey,
  outcome: ConformanceCheckResult["outcome"],
  summary: string,
): ConformanceCheckResult {
  return {
    key,
    label: key,
    outcome,
    summary,
    output: outcome === "failed" ? `synthetic output for ${key}\n` : null,
    outputTruncated: false,
    exitCode: outcome === "passed" ? 0 : outcome === "failed" ? 1 : null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

function notRun(
  key: ConformanceCheckKey,
  reason: string,
): ConformanceCheckResult {
  return {
    key,
    label: key,
    outcome: "not-run",
    summary: reason,
    output: null,
    outputTruncated: false,
    exitCode: null,
    startedAt: null,
    finishedAt: null,
  };
}
