// Real containers: the Docker executor runs the executable fixture variants
// through the check set and proves the isolation boundary from inside the
// workload. Opt in with SERVER_GUY_DOCKER_TESTS=1 on a host whose engine is
// reachable; otherwise every case is reported as skipped, never as passed.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  dockerConformanceExecutor,
  type ExecutionPlan,
} from "../../../src/server/conformance-executor";
import { CONFORMANCE_DEFINITION } from "../../../src/server/conformance-definition";
import {
  DockerClient,
  discoverExecutionEnvironment,
} from "../../../src/server/docker";
import { dockerfileStartCommand } from "../../../src/server/execution-tree";
import type { ConformanceRunConfiguration } from "../../../src/server/types";
import { buildAcceptanceChecks } from "../../fixtures/conformance-builder";
import {
  repositoryFixtures,
  type RepositoryFixtureName,
} from "../../fixtures/repositories";

const optedIn = process.env.SERVER_GUY_DOCKER_TESTS === "1";
if (!optedIn)
  console.info(
    "conformance-executor.docker.test.ts: NOT RUN (set SERVER_GUY_DOCKER_TESTS=1 with a reachable Docker Engine to execute the real runner).",
  );

const executor = dockerConformanceExecutor();

function plan(
  name: RepositoryFixtureName,
  runId: string,
  extra: Partial<ExecutionPlan> = {},
): ExecutionPlan {
  const files = repositoryFixtures[name].map((file) => ({
    path: file.path,
    content: Buffer.from(file.content),
    mode: 0o644,
  }));
  const configuration: ConformanceRunConfiguration = {
    startCommand: dockerfileStartCommand(files) ?? [
      "uv",
      "run",
      "uvicorn",
      "app.main:app",
      "--host",
      "0.0.0.0",
      "--port",
      "8000",
    ],
    startCommandSource: "dockerfile",
    port: 8000,
    healthPath: "/health",
    environment: {
      DATABASE_URL: "postgresql+psycopg://app:<synthetic-per-run>@db:5432/app",
      SECRET_KEY: "synthetic-secret-key",
      LOG_LEVEL: "info",
    },
    database: "postgresql",
    migrationTool: "alembic",
  };
  const router = repositoryFixtures[name].find(
    (file) => file.path === "app/routes/todos.py",
  )!;
  const acceptance = buildAcceptanceChecks([
    {
      status: "read",
      observationId: "read",
      path: router.path,
      content: router.content,
    },
  ]);
  return {
    runId,
    applicationId: "docker-test",
    files,
    configuration,
    secretVariables: ["DATABASE_URL", "SECRET_KEY"],
    acceptance: { steps: acceptance.steps, label: "accepted v1" },
    ...extra,
  };
}

const outcomes = (results: Array<{ key: string; outcome: string }>) =>
  Object.fromEntries(results.map((result) => [result.key, result.outcome]));

describe.skipIf(!optedIn)("the Docker conformance executor", () => {
  let client: DockerClient;
  beforeAll(async () => {
    const status = await discoverExecutionEnvironment();
    expect(status.ready, status.summary).toBe(true);
    client = new DockerClient(status.endpoint!.slice("unix://".length));
    const prepared = await executor.prepare();
    expect(prepared.verified).not.toBeNull();
  }, 20 * 60_000);
  afterAll(async () => {
    await executor.cleanupLeftovers();
  });

  it(
    "keeps the verified application reachable on loopback until explicitly stopped",
    async () => {
      const runId = "docker-interactive-preview";
      const result = await executor.execute(
        plan("fastapi-conforming", runId, { keepPreview: true }),
      );
      try {
        expect(
          result.status,
          JSON.stringify({
            error: result.error,
            results: result.results.map((r) => [r.key, r.outcome, r.summary]),
          }),
        ).toBe("passed");
        expect(result.preview?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
        const response = await fetch(`${result.preview!.url}/todos`);
        expect(response.status).toBe(200);
        const container = await client.inspectContainer(
          result.preview!.containerId,
        );
        expect(container.State.Running).toBe(true);
        expect(
          container.NetworkSettings?.Ports?.["8000/tcp"] ?? null,
        ).toBeNull();
      } finally {
        await executor.cleanupLeftovers([runId]);
      }
      await expect(
        client.inspectContainer(result.preview!.containerId),
      ).rejects.toThrow();
    },
    20 * 60_000,
  );

  it(
    "passes every check for the conforming fixture with per-check evidence and cleans up",
    async () => {
      const outcome = await executor.execute(
        plan("fastapi-conforming", "docker-conforming-1"),
      );
      expect(
        outcome.status,
        JSON.stringify(
          outcome.results.map((r) => [
            r.key,
            r.outcome,
            r.summary,
            r.outcome === "failed" ? r.output : null,
          ]),
        ),
      ).toBe("passed");
      expect(outcomes(outcome.results)).toEqual({
        install: "passed",
        configuration: "passed",
        database: "passed",
        migrations: "passed",
        startup: "passed",
        health: "passed",
        behavior: "passed",
        tests: "passed",
      });
      expect(outcome.imageDigest).toMatch(/astral\/uv@sha256:|^sha256:/);
      const behavior = outcome.results.find(
        (result) => result.key === "behavior",
      )!;
      expect(behavior.steps).toEqual([
        expect.objectContaining({
          name: "create a todo",
          status: 201,
          passed: true,
        }),
        expect.objectContaining({
          name: "read it back",
          status: 200,
          passed: true,
        }),
      ]);
      expect(
        outcome.results.find((result) => result.key === "configuration")
          ?.summary,
      ).toMatch(/names .*SECRET_KEY/i);
      expect(
        outcome.results.find((result) => result.key === "health")?.summary,
      ).toContain("answered 200 on app:8000");
      expect(
        await client.listContainers({
          "server-guy.run": "docker-conforming-1",
        }),
      ).toEqual([]);
      expect(
        await client.listNetworks({ "server-guy.run": "docker-conforming-1" }),
      ).toEqual([]);
      expect(
        await client.listVolumes({ "server-guy.run": "docker-conforming-1" }),
      ).toEqual([]);
    },
    15 * 60_000,
  );

  it.each([
    [
      "fastapi-import-error",
      "startup",
      { startup: "failed", health: "failed", behavior: "not-run" },
    ],
    [
      "fastapi-nohealth",
      "health",
      {
        startup: "passed",
        health: "failed",
        behavior: "not-run",
        tests: "failed",
      },
    ],
    ["fastapi-localhost", "health", { health: "failed" }],
    [
      "fastapi-broken-behavior",
      "behavior",
      { health: "passed", behavior: "failed" },
    ],
    [
      "fastapi-failing-tests",
      "tests",
      { health: "passed", behavior: "passed", tests: "failed" },
    ],
    ["fastapi-bad-migration", "migrations", { migrations: "failed" }],
    [
      "fastapi-insecure-config",
      "configuration",
      { configuration: "failed", health: "passed" },
    ],
  ] as const)(
    "fails %s at the %s check and nowhere it should not",
    async (name, _key, expected) => {
      const outcome = await executor.execute(plan(name, `docker-${name}`));
      expect(outcome.status).toBe("failed");
      expect(outcomes(outcome.results)).toMatchObject(expected);
      if (name === "fastapi-localhost")
        expect(
          outcome.results.find((result) => result.key === "health")?.summary,
        ).toContain("unreachable from a sibling container");
      if (name === "fastapi-import-error")
        expect(
          outcome.results.find((result) => result.key === "startup")?.output,
        ).toContain("No module named 'app.missing'");
      if (name === "fastapi-broken-behavior")
        expect(
          outcome.results.find((result) => result.key === "behavior")
            ?.steps?.[1],
        ).toMatchObject({
          passed: false,
          detail: expect.stringContaining("Buy milk"),
        });
    },
    15 * 60_000,
  );

  it(
    "fails a stale lockfile at installation and runs nothing else",
    async () => {
      const outcome = await executor.execute(
        plan("fastapi-stale-lock", "docker-stale-lock"),
      );
      expect(outcome.status).toBe("failed");
      expect(outcomes(outcome.results)).toMatchObject({
        install: "failed",
        configuration: "not-run",
        startup: "not-run",
        tests: "not-run",
      });
      expect(outcome.results[0].output).toMatch(/lockfile|--locked/i);
    },
    10 * 60_000,
  );

  it(
    "keeps the workload away from the controller: no socket, home, host network or egress",
    async () => {
      const outcome = await executor.execute(
        plan("fastapi-conforming", "docker-isolation", {
          acceptance: null,
          command: [
            "sh",
            "-c",
            [
              "id -u",
              "ls /var/run/docker.sock 2>&1",
              "ls /Users /root/.server-guy 2>&1",
              "grep -i CapEff /proc/self/status",
              "cat /proc/sys/kernel/hostname",
              "python3 -c \"import urllib.request; urllib.request.urlopen('https://pypi.org', timeout=5)\" 2>&1 | tail -1",
              "python3 -c \"import socket; s=socket.socket(); s.settimeout(3); print('host', s.connect_ex(('host.docker.internal', 3000)))\" 2>&1 | tail -1",
              "touch /usr/local/marker 2>&1",
              "ulimit -u",
            ].join("; "),
          ],
        }),
      );
      const command = outcome.results.find(
        (result) => result.key === "command",
      )!;
      expect(outcome.results[0].outcome).toBe("passed");
      expect(command.output).toContain("1000");
      expect(command.output).toContain("cannot access '/var/run/docker.sock'");
      expect(command.output).toContain("cannot access '/Users'");
      expect(command.output).toMatch(/CapEff:\s+0000000000000000/);
      expect(command.output).toMatch(
        /Temporary failure in name resolution|Name or service not known|urlopen error/,
      );
      expect(command.output).not.toContain("host 0\n");
      expect(command.output).toContain("Read-only file system");
      expect(
        await client.listContainers({ "server-guy.run": "docker-isolation" }),
      ).toEqual([]);
    },
    10 * 60_000,
  );

  it(
    "stops and removes everything when cancelled mid-run, and truncates long output",
    async () => {
      const controller = new AbortController();
      const started = executor.execute(
        plan("fastapi-conforming", "docker-cancel"),
        {
          signal: controller.signal,
          onProgress: (event) => {
            if (event.step === "install")
              setTimeout(() => controller.abort(), 1_500);
          },
        },
      );
      const outcome = await started;
      expect(outcome.status).toBe("cancelled");
      expect(
        outcome.results.some((result) => result.outcome === "not-run"),
      ).toBe(true);
      expect(
        await client.listContainers({ "server-guy.run": "docker-cancel" }),
      ).toEqual([]);
      expect(
        await client.listVolumes({ "server-guy.run": "docker-cancel" }),
      ).toEqual([]);
      const noisy = await executor.execute(
        plan("fastapi-conforming", "docker-truncate", {
          acceptance: null,
          command: [
            "python3",
            "-c",
            `print('x' * ${CONFORMANCE_DEFINITION.limits.outputBytes * 3})`,
          ],
        }),
      );
      const command = noisy.results.find((result) => result.key === "command")!;
      expect(command.outputTruncated).toBe(true);
      expect(command.output?.length).toBeLessThan(
        CONFORMANCE_DEFINITION.limits.outputBytes + 200,
      );
    },
    10 * 60_000,
  );
});
