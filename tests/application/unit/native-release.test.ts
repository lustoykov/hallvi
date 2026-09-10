import { expect, it } from "vitest";
import { executableCompose } from "../../../src/server/native-compose";
import { stackOf } from "../../../src/server/application-stack";
import { backupCapturePlan } from "../../../src/server/backup-capture-plan";
import { currentFacts } from "../../../src/server/release-facts";
import { deploymentOperation } from "../../../src/server/operation-record";
import type { NativeConfiguration } from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const project = "sg-0a1b2c3d";
const volume = (source: string, target: string, read_only?: boolean) => ({
  type: "volume",
  source,
  target,
  ...(read_only ? { read_only } : {}),
});
/** A retained snapshot as the pinned resolver leaves it: $$ is a literal. */
const native: NativeConfiguration = {
  format: 1,
  resolver: "docker compose 2.40.3",
  compose: ["compose.yaml", ".server-guy/override.compose.json"],
  files: [],
  resolved: {
    name: project,
    services: {
      web: {
        build: { context: "." },
        image: "server-guy-x-web:rev",
        ports: [{ target: 8000, published: "80", protocol: "tcp" }],
        environment: { API_TOKEN: "${API_TOKEN}", PRICE: "5$$" },
        depends_on: { queue: { condition: "service_healthy" } },
        volumes: [volume("documents", "/documents"), volume("state", "/state")],
      },
      indexer: {
        image: "server-guy-x-web:rev",
        command: ["python", "index.py"],
        healthcheck: { test: ["CMD", "python", "ready.py"] },
        volumes: [volume("documents", "/input", true)],
      },
      queue: {
        image: `valkey/valkey@sha256:${"b".repeat(64)}`,
        volumes: [volume("queue-data", "/data")],
      },
    },
    volumes: Object.fromEntries(
      ["documents", "state", "queue-data"].map((name) => [
        name,
        { name: `${project}_${name}` },
      ]),
    ),
  },
  inputs: ["API_TOKEN"],
  data: [
    { volume: "documents", kind: "files", sqlite: null },
    { volume: "state", kind: "database", sqlite: "app.sqlite" },
    {
      volume: "queue-data",
      kind: "database",
      sqlite: null,
      capture: "quiesced-files",
    },
  ],
  database: null,
  httpAccess: "controller",
  criterion: null,
  summary: "A web service, an indexer sharing its image, and a queue",
};

it("materializes private values only for execution, escaping them for Compose", () => {
  const executable = JSON.parse(
    executableCompose(native, { API_TOKEN: "p$ss" }),
  );
  expect(executable.services.web.environment).toEqual({
    API_TOKEN: "p$$ss",
    PRICE: "5$$",
  });
  expect(native.resolved.services.web.environment!.API_TOKEN).toBe(
    "${API_TOKEN}",
  );
  expect(() => executableCompose(native, {})).toThrow(
    "API_TOKEN is unavailable",
  );
  // Rollback runs every service from its verified image, never a build.
  const images = { web: "sha256:1", indexer: "sha256:1", queue: "sha256:2" };
  const rollback = JSON.parse(
    executableCompose(native, { API_TOKEN: "x" }, images),
  );
  expect(rollback.services.web.image).toBe("sha256:1");
  expect(rollback.services.web).not.toHaveProperty("build");
  expect(() =>
    executableCompose(native, { API_TOKEN: "x" }, { web: "sha256:1" }),
  ).toThrow("every service");
});

it("serves stack, backup and operation readers from the retained snapshot", () => {
  const record = {
    id: "0a1b2c3d-0000-4000-8000-000000000001",
    status: "live",
    revision: "a".repeat(40),
    plan: null,
    native,
    serviceImages: { web: "sha256:1", indexer: "sha256:1", queue: "sha256:2" },
    events: [],
    createdAt: "2026-09-10T09:00:00Z",
    updatedAt: "2026-09-10T09:00:00Z",
  } as unknown as DeploymentRecord;
  const stack = stackOf(record);
  expect(stack.processes.map((p) => [p.name, p.role, p.port, p.image])).toEqual(
    [
      ["web", "web", 8000, "sha256:1"],
      ["indexer", "service", null, "sha256:1"],
      ["queue", "service", null, "sha256:2"],
    ],
  );
  expect(stack.volumes.find((v) => v.name === "documents")!.mounts).toEqual([
    { service: "web", target: "/documents", readOnly: false, sqlite: null },
    { service: "indexer", target: "/input", readOnly: true, sqlite: null },
  ]);
  expect(stack.databases).toEqual([
    expect.objectContaining({ kind: "sqlite", location: "/state/app.sqlite" }),
  ]);
  const capture = backupCapturePlan(currentFacts(record)!);
  expect(capture.volumes.map((v) => [v.name, v.sqlite])).toEqual([
    ["documents", null],
    ["state", "app.sqlite"],
    ["queue-data", null],
  ]);
  // Clients pause before the broker they write through.
  expect(capture.pauseServices.indexOf("web")).toBeLessThan(
    capture.pauseServices.indexOf("queue"),
  );
  expect(deploymentOperation(record).destinations).toEqual(
    expect.arrayContaining(["processes", "database", "storage", "variables"]),
  );
});
