import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import type {
  DeploymentRecord,
  DeploymentPlan,
} from "../../../src/server/deployment-types";
const transport = vi.hoisted(() => ({
  root: "",
  endpoint: "",
  record: null as DeploymentRecord | null,
}));
vi.mock("../../../src/server/deployment-store", () => ({
  saveDeployment: vi.fn(),
  deploymentMessage: vi.fn(),
  deploymentEvent: (r: DeploymentRecord, message: string) =>
    r.events.push({ at: new Date().toISOString(), message }),
}));
vi.mock("../../../src/server/application-operations", () => ({
  recordOperationRemoteEffect: vi.fn(),
}));
vi.mock("../../../src/server/deployment-compose", async (original) => {
  const real =
    await original<typeof import("../../../src/server/deployment-compose")>();
  return {
    ...real,
    composeDefinition: (...args: Parameters<typeof real.composeDefinition>) => {
      const value = real.composeDefinition(...args);
      (value.services.app as { ports: string[] }).ports = ["127.0.0.1::8080"];
      for (const service of Object.values(value.services))
        (service as Record<string, unknown>).platform = "linux/amd64";
      return value;
    },
  };
});
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  const map = (command: string) =>
    command
      .replace(/^flock -n \S+ /, "")
      .replaceAll(`/opt/server-guy/${transport.record!.id}`, transport.root);
  return {
    ...real,
    spawn: (file: string, args: string[], options: object) => {
      if (file !== "ssh") throw new Error("Unexpected fixture transport");
      return real.spawn("sh", ["-c", map(args.at(-1)!)], {
        ...options,
        env: { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" },
      });
    },
    execFile: (
      file: string,
      args: string[],
      options: object,
      callback: (error: unknown, stdout: string) => void,
    ) => {
      if (file !== "ssh") throw new Error("Unexpected fixture transport");
      return real.execFile(
        "sh",
        ["-c", map(args.at(-1)!)],
        {
          ...options,
          env: { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" },
        },
        (error, stdout) => {
          try {
            if (!error && stdout.includes("SG_RELEASE_RESULT:replace:0"))
              transport.endpoint = real
                .execFileSync(
                  "docker",
                  [
                    "compose",
                    "-p",
                    `sg-${transport.record!.id.slice(0, 8)}`,
                    "-f",
                    join(transport.root, "compose.json"),
                    "port",
                    "app",
                    "8080",
                  ],
                  { encoding: "utf8" },
                )
                .trim();
            callback(error, stdout);
          } catch (transportError) {
            callback(transportError, stdout);
          }
        },
      );
    },
  };
});
import {
  composeDefinition,
  composeStartCommand,
} from "../../../src/server/deployment-compose";
import { inspectRelease } from "../../../src/server/release-diagnostics";
import { executeRelease } from "../../../src/server/release-executor";
import {
  verifyServiceImages,
  verifyDeployment,
} from "../../../src/server/deployment-executor";
import {
  beginDeploymentAttempt,
  finishDeploymentAttempt,
} from "../../../src/server/deployment-lifecycle";
import { releaseOf } from "../../../src/server/deployment-release";

it.skipIf(process.env.SG_RUN_DOCKER_PROOF !== "1").each([false, true])(
  "releases after failures and retains state (independent builds/shared volumes: %s)",
  async (shared) => {
    const root = mkdtempSync(join(tmpdir(), "sg-release-docker-"));
    const id = randomUUID(),
      project = `sg-${id.slice(0, 8)}`;
    transport.root = root;
    const originalFetch = globalThis.fetch;
    vi.stubGlobal(
      "fetch",
      (input: string | URL | Request, init?: RequestInit) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        return originalFetch(
          url.replace("http://127.0.0.1/", `http://${transport.endpoint}/`),
          init,
        );
      },
    );
    vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(root, "private"));
    const files = (
      shared
        ? [
            "web/Dockerfile",
            "web/app.py",
            "worker/Dockerfile",
            "worker/worker.py",
          ]
        : ["Dockerfile", "app.py"]
    ).map((path) => ({
      path,
      mode: 0o644,
      content: readFileSync(
        join(
          shared
            ? "tests/fixtures/shared-builds"
            : "tests/fixtures/release-app",
          path,
        ),
      ),
    }));
    const versions = (value: string) =>
      (shared
        ? ["web/version.txt", "worker/version.txt"]
        : ["version.txt"]
      ).map((path) => ({ path, mode: 0o644, content: Buffer.from(value) }));
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
    if (shared) {
      plan.context = "web";
      plan.dockerfile = "web/Dockerfile";
      plan.volumes!.push(
        {
          name: "documents",
          target: "/documents",
          kind: "files",
          sqlite: null,
        },
        {
          name: "results",
          target: "/results",
          kind: "files",
          sqlite: null,
          readOnly: true,
        },
      );
      plan.services = [
        {
          name: "worker",
          role: "worker",
          build: { context: "worker", dockerfile: "worker/Dockerfile" },
          command: null,
          environment: [],
          configs: [],
          port: null,
          healthPath: null,
          checks: [],
          healthCommand: [
            "python",
            "-c",
            "from pathlib import Path; assert Path('/tmp/ready').exists()",
          ],
          volumes: [
            {
              name: "documents",
              target: "/input",
              kind: "files",
              sqlite: null,
              readOnly: true,
            },
            { name: "results", target: "/output", kind: "files", sqlite: null },
          ],
        },
      ];
    }
    const record: DeploymentRecord = {
      id,
      applicationId: "fixture",
      chatId: "fixture",
      repository: "qa/release",
      status: "live",
      revision: "a".repeat(40),
      plan,
      serverId: 7,
      serverCreateAttempted: true,
      address: null,
      imageId: null,
      verifiedAt: null,
      offer: null,
      authority: null,
      url: null,
      error: null,
      events: [],
      logs: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    transport.record = record;
    const docker = (args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        timeout: 180000,
        env: { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" },
      }).trim();
    try {
      mkdirSync(join(root, "source"));
      mkdirSync(join(root, "private", "deployments", id), { recursive: true });
      writeFileSync(
        join(root, "private", "deployments", id, "database-password"),
        "synthetic-password",
      );
      for (const file of [...files, ...versions("v1")]) {
        mkdirSync(join(root, "source", file.path, ".."), { recursive: true });
        writeFileSync(join(root, "source", file.path), file.content);
      }
      writeFileSync(
        join(root, "compose.json"),
        JSON.stringify(
          composeDefinition(plan, record.revision!, id, "unused", {}),
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
        {
          cwd: root,
          stdio: "pipe",
          timeout: 180000,
          env: { ...process.env, DOCKER_DEFAULT_PLATFORM: "linux/amd64" },
        },
      );
      record.address = "127.0.0.1";
      transport.endpoint = docker([
        "compose",
        "-p",
        project,
        "-f",
        join(root, "compose.json"),
        "port",
        "app",
        "8080",
      ]);
      const signal = AbortSignal.timeout(90000);
      await verifyServiceImages(record, signal);
      await verifyDeployment(record, signal);
      record.imageId = record.serviceImages!.app;
      record.verifiedAt = new Date().toISOString();
      const originalImage = record.imageId;
      const seeded = await fetch(`http://${transport.endpoint}/value`, {
        method: "POST",
        body: JSON.stringify({ value: "retained-user-data" }),
      });
      expect(seeded.status).toBe(200);
      const next = structuredClone(plan);
      next.checks = [
        ...plan.checks.map((c) => ({ ...c, contains: "v2" })),
        {
          ...plan.checks[0],
          name: "Retained data",
          path: "/value",
          contains: "retained-user-data",
        },
      ];
      const v2Files = [...files, ...versions("v2")];
      if (shared)
        next.checks.push({
          ...next.checks[0],
          name: "Worker result",
          path: "/result",
          contains: "retained-user-data@v2",
          waitSeconds: 10,
        });
      const failed = releaseOf({
        repository: record.repository,
        revision: "b".repeat(40),
        plan: { ...next, context: "missing-directory" },
      })!;
      const first = beginDeploymentAttempt(
        record,
        "release",
        "fixture-release",
        failed,
      );
      try {
        await executeRelease(record, failed, v2Files, signal);
        throw new Error("Expected a native build failure");
      } catch (error) {
        expect(error).toMatchObject({ retryable: true, phase: "build" });
        expect((error as Error).message).toContain("missing-directory");
        finishDeploymentAttempt(
          record,
          first.id,
          "failed",
          (error as Error).message,
        );
      }
      expect(record.lifecycle!.runtime.lastVerified!.revision).toBe(
        "a".repeat(40),
      );
      const brokenCheck = releaseOf({
        repository: record.repository,
        revision: "b".repeat(40),
        plan: {
          ...next,
          checks: [{ ...next.checks[0], contains: "nonexistent-version" }],
        },
      })!;
      const behavioral = beginDeploymentAttempt(
        record,
        "release",
        "fixture-release",
        brokenCheck,
      );
      await expect(
        executeRelease(record, brokenCheck, v2Files, signal),
      ).rejects.toMatchObject({ phase: "verification", retryable: true });
      finishDeploymentAttempt(
        record,
        behavioral.id,
        "failed",
        "Behavior check failed",
      );
      const diagnostic = await inspectRelease(record, signal);
      expect(diagnostic.ok).toBe(true);
      expect(diagnostic.evidence).toContain('"running"');
      expect(diagnostic.evidence).toContain("GET /version");
      expect(record.lifecycle!.runtime.state).toBe("unknown");
      const corrected = releaseOf({
        repository: record.repository,
        revision: "b".repeat(40),
        plan: next,
      })!;
      const second = beginDeploymentAttempt(
        record,
        "release",
        "fixture-release",
        corrected,
      );
      await executeRelease(record, corrected, v2Files, signal);
      finishDeploymentAttempt(record, second.id, "verified");
      expect(record.imageId).not.toBe(originalImage);
      if (shared) {
        expect(record.serviceImages!.worker).not.toBe(record.imageId);
        for (const [service, forbidden] of [
          ["worker", "/input/forbidden"],
          ["app", "/results/forbidden"],
        ]) {
          const container = docker([
            "compose",
            "-p",
            project,
            "-f",
            join(root, "compose.json"),
            "ps",
            "-q",
            service,
          ]);
          expect(() =>
            docker(["exec", container, "touch", forbidden]),
          ).toThrow();
        }
      }
      expect(record.lifecycle!.runtime.lastVerified!.revision).toBe(
        "b".repeat(40),
      );
      expect(
        await (await fetch(`http://${transport.endpoint}/value`)).json(),
      ).toEqual({ value: "retained-user-data" });
      expect(
        docker([
          "volume",
          "inspect",
          "--format",
          "{{.Name}}",
          `${project}_data`,
        ]),
      ).toBe(`${project}_data`);
    } finally {
      try {
        docker([
          "compose",
          "-p",
          project,
          "-f",
          join(root, "compose.json"),
          "down",
          "-v",
          "--remove-orphans",
        ]);
      } catch {
        /* report assertion failure while still attempting image cleanup */
      }
      for (const revision of ["a".repeat(40), "b".repeat(40)]) {
        try {
          docker([
            "image",
            "rm",
            `server-guy-${id}:${revision}`,
            ...(shared ? [`server-guy-${id}-worker:${revision}`] : []),
          ]);
        } catch {
          /* absent after a failed build */
        }
      }
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      rmSync(root, { recursive: true, force: true });
    }
  },
  300000,
);
