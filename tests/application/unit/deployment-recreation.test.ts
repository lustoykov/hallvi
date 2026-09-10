import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  beginDeploymentAttempt,
  ensureDeploymentLifecycle,
} from "../../../src/server/deployment-lifecycle";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  deploymentPlanSchema,
  type DeploymentRecord,
} from "../../../src/server/deployment-types";
const run = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", async (original) => ({
  ...(await original<object>()),
  spawn: (...args: unknown[]) => run(...args),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  saveDeployment: vi.fn(),
  deploymentMessage: vi.fn(),
  deploymentEvent: vi.fn(),
}));
import {
  recreateDeployment,
  verifyServiceImages,
  verifyPrivateServices,
} from "../../../src/server/deployment-executor";
const digest = `sha256:${"a".repeat(64)}`;
const record = () =>
  ({
    id: "00000000-0000-4000-8000-000000000099",
    status: "live",
    serverId: 1,
    address: "203.0.113.1",
    imageId: digest,
    plan: deploymentPlanSchema.parse({
      summary: "A published image with a retained files volume",
      image: `example/app@${digest}`,
      dockerfile: "Dockerfile",
      generatedDockerfile: null,
      context: ".",
      port: 8080,
      command: null,
      environment: [],
      postgres: null,
      missingInputs: [],
      healthPath: "/health",
      volumes: [{ name: "data", target: "/data", kind: "files", sqlite: null }],
      services: [],
      checks: [
        {
          name: "Home",
          method: "GET",
          path: "/",
          body: null,
          expectedStatus: 200,
          contains: "ok",
          captureId: null,
        },
      ],
    }),
    bundleHashes: { "compose.json": "b".repeat(64) },
  }) as unknown as DeploymentRecord;
const worker = () => ({
  name: "worker",
  imageFrom: "app",
  command: ["python", "worker.py"],
  environment: [],
  volumes: [],
  configs: [],
  port: null,
  healthPath: null,
  checks: [],
});
function result(output: string, code = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    stdin: PassThrough;
    kill: () => boolean;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.kill = () => true;
  queueMicrotask(() => {
    child.stdout.write(output);
    child.emit("close", code);
  });
  return child;
}
let privateDirectory: string;
beforeEach(() => {
  privateDirectory = mkdtempSync(join(tmpdir(), "sg-recreation-unit-"));
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", privateDirectory);
  run.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(privateDirectory, { recursive: true, force: true });
});
it("stops before container replacement when a persistent volume is missing", async () => {
  run.mockImplementation((_file: string, args: string[]) => {
    const command = args.at(-1)!;
    if (command.includes("sha256sum"))
      return result(`${"b".repeat(64)}  compose.json\n`);
    if (command.includes("ps -q")) return result("old-container\n");
    if (command.includes("volume inspect")) return result("no such volume", 1);
    throw Error(`Unexpected mutation: ${command}`);
  });
  await expect(
    recreateDeployment(record(), new AbortController().signal),
  ).rejects.toThrow("ssh failed");
  expect(
    run.mock.calls.some((c) => c[1].at(-1).includes("--force-recreate")),
  ).toBe(false);
});
it("rejects a running container from an unapproved image without reading environment values", async () => {
  run.mockImplementation(() =>
    result(
      JSON.stringify([digest, "example/other:latest", "app", true]) + "\n",
    ),
  );
  await expect(
    verifyServiceImages(record(), new AbortController().signal),
  ).rejects.toThrow("differs from its approved image");
  const command = run.mock.calls[0][1].at(-1);
  expect(command).toContain("--format");
  expect(command).not.toContain(".Config.Env");
});
it("records each accepted running service image", async () => {
  const r = record();
  run.mockImplementation(() =>
    result(
      JSON.stringify([digest, `example/app@${digest}`, "app", true]) + "\n",
    ),
  );
  await verifyServiceImages(r, new AbortController().signal);
  expect(r.serviceImages).toEqual({ app: digest });
});

it("rejects a shared-image worker that is actually running different bytes", async () => {
  const r = record();
  r.plan!.services = [worker()];
  run.mockImplementation(() =>
    result(
      [
        [digest, `example/app@${digest}`, "app", true],
        [`sha256:${"b".repeat(64)}`, `example/app@${digest}`, "worker", true],
      ]
        .map((c) => JSON.stringify(c))
        .join("\n"),
    ),
  );
  await expect(
    verifyServiceImages(r, new AbortController().signal),
  ).rejects.toThrow("same image as app");
});

it("clears earlier readiness when a service is no longer running", async () => {
  const r = record();
  r.serviceReadiness = {
    app: { checkedAt: "yesterday", kind: "command", imageId: digest },
  };
  run.mockImplementation(() =>
    result(JSON.stringify([digest, `example/app@${digest}`, "app", false])),
  );
  await expect(
    verifyServiceImages(r, new AbortController().signal),
  ).rejects.toThrow("not running");
  expect(r.serviceReadiness).toEqual({});
});

it("does not record a passing readiness result for an unhealthy worker", async () => {
  const r = record();
  r.plan!.services = [{ ...worker(), healthCommand: ["python", "ready.py"] }];
  run.mockImplementation(() => result("unhealthy\n"));
  await expect(
    verifyPrivateServices(r, new AbortController().signal),
  ).rejects.toThrow("has not passed");
  expect(r.serviceReadiness).toEqual({});
  expect(run.mock.calls[0][1].at(-1)).not.toContain(".Config.Env");
});

it("persists runtime uncertainty before sending the recreation command", async () => {
  const r = record();
  Object.assign(r, {
    repository: "qa/example",
    revision: "a".repeat(40),
    events: [],
    createdAt: "2026-09-10T08:00:00Z",
    verifiedAt: "2026-09-10T08:30:00Z",
  });
  r.plan!.missingInputs = [];
  r.logs = "";
  const previous = structuredClone(
    ensureDeploymentLifecycle(r).runtime.lastVerified,
  );
  const attempt = beginDeploymentAttempt(r, "recreate", "recreate-1");
  run.mockImplementation((_file: string, args: string[]) => {
    const command = args.at(-1)!;
    if (command.includes("sha256sum"))
      return result(`${"b".repeat(64)}  compose.json\n`);
    if (command.includes("ps -q")) return result("old-container\n");
    if (command.includes("volume inspect")) return result("retained-volume\n");
    if (command.includes("--force-recreate")) {
      expect(attempt.remoteStartedAt).not.toBeNull();
      expect(r.lifecycle!.runtime).toEqual({
        state: "unknown",
        lastVerified: previous,
      });
      return result("Synthetic SSH interruption", 1);
    }
    throw Error(`Unexpected command: ${command}`);
  });
  await expect(
    recreateDeployment(r, new AbortController().signal),
  ).rejects.toThrow("ssh failed");
  expect(attempt.remoteStartedAt).not.toBeNull();
  expect(r.lifecycle!.runtime.lastVerified).toEqual(previous);
});
