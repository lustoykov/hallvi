import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
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
} from "../../../src/server/deployment-executor";
const digest = `sha256:${"a".repeat(64)}`;
const record = () =>
  ({
    id: "00000000-0000-4000-8000-000000000099",
    status: "live",
    serverId: 1,
    address: "203.0.113.1",
    imageId: digest,
    plan: {
      image: `example/app@${digest}`,
      volumes: [{ name: "data", target: "/data", kind: "files", sqlite: null }],
      services: [],
    },
    bundleHashes: { "compose.json": "b".repeat(64) },
  }) as unknown as DeploymentRecord;
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
beforeEach(() => {
  run.mockReset();
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
