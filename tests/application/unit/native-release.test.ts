import { expect, it } from "vitest";
import {
  dataRecords,
  executableCompose,
} from "../../../src/server/native-compose";
import { stackOf } from "../../../src/server/application-stack";
import { backupCapturePlan } from "../../../src/server/backup-capture-plan";
import {
  currentFacts,
  managedDatabaseProcedure,
  nativeFacts,
} from "../../../src/server/release-facts";
import { scopeDifferences } from "../../../src/server/release-scope";
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

const procedure = {
  dump: ["sh", "-c", 'mariadb-dump "$MARIADB_DATABASE"'],
  restore: ["sh", "-c", 'mariadb "$MARIADB_DATABASE"'],
  verify: ["sh", "-c", "mariadb -e 'CHECKSUM TABLE pages'"],
};
/** A wiki with its own database owner, as Pi declares it at intake. */
function wiki(
  data: NativeConfiguration["data"] = [
    { volume: "config", kind: "files", sqlite: null },
    {
      volume: "mariadb-data",
      kind: "database",
      sqlite: null,
      capture: "dump",
      owner: "mariadb",
      procedure,
    },
  ],
): NativeConfiguration {
  return {
    ...native,
    resolved: {
      name: project,
      services: {
        wiki: {
          image: `lscr.io/linuxserver/bookstack@sha256:${"a".repeat(64)}`,
          ports: [{ target: 80, published: "80", protocol: "tcp" }],
          volumes: [volume("config", "/config")],
        },
        mariadb: {
          image: `mariadb@sha256:${"b".repeat(64)}`,
          volumes: [volume("mariadb-data", "/var/lib/mysql")],
        },
      },
      volumes: Object.fromEntries(
        ["config", "mariadb-data"].map((name) => [
          name,
          { name: `${project}_${name}` },
        ]),
      ),
    },
    inputs: [],
    data,
    summary: "A wiki and the database it uses",
  };
}

it("a correction that redeclares a volume keeps its owner, capture and procedure; an explicit removal is the owner's decision", () => {
  const first = wiki();
  const baseline = nativeFacts(first);
  // Pi corrects the wiki's command and lists the volumes again, plainly.
  const corrected = dataRecords(
    first.resolved,
    [
      { volume: "config", kind: "files" },
      { volume: "mariadb-data", kind: "database" },
    ],
    baseline,
  );
  expect(corrected.find((r) => r.volume === "mariadb-data")).toEqual({
    volume: "mariadb-data",
    kind: "database",
    sqlite: null,
    capture: "dump",
    owner: "mariadb",
    procedure,
  });
  // A third release inherits from the corrected one: the owner's image is
  // still protected two releases later.
  const second = wiki(corrected);
  const third = nativeFacts(
    wiki(dataRecords(second.resolved, [], nativeFacts(second))),
  );
  const upgraded = nativeFacts(second);
  upgraded.services.find((s) => s.name === "mariadb")!.image =
    `mariadb@sha256:${"c".repeat(64)}`;
  expect(scopeDifferences(third, upgraded).join()).toContain(
    "Service mariadb owns persistent data",
  );
  // Only an explicit null drops a field, and the scope names the owner
  // whose decision that needs.
  const dropped = dataRecords(
    first.resolved,
    [
      {
        volume: "mariadb-data",
        kind: "database",
        owner: null,
        capture: null,
        procedure: null,
      },
    ],
    baseline,
  );
  expect(dropped.find((r) => r.volume === "mariadb-data")).toEqual({
    volume: "mariadb-data",
    kind: "database",
    sqlite: null,
  });
  expect(
    scopeDifferences(baseline, nativeFacts(wiki(dropped))).join(),
  ).toContain("propose it as a state change for mariadb");
  // A procedure without a dump capture is still refused.
  expect(() =>
    dataRecords(
      first.resolved,
      [{ volume: "mariadb-data", kind: "database", capture: null }],
      baseline,
    ),
  ).toThrow("a procedure applies only to capture");
});

it("declared writers pause for a dump; without a declaration the dump is online unless nothing else runs", () => {
  const stack = (
    data: NativeConfiguration["data"],
    extra: Record<string, unknown> = {},
  ): NativeConfiguration => ({
    ...native,
    resolved: {
      name: project,
      services: {
        web: {
          image: `ghcr.io/qa/notes@sha256:${"a".repeat(64)}`,
          ports: [{ target: 8000, published: "80", protocol: "tcp" }],
          depends_on: { postgres: { condition: "service_started" } },
        },
        worker: {
          image: `ghcr.io/qa/notes@sha256:${"a".repeat(64)}`,
          depends_on: { web: { condition: "service_started" } },
        },
        ...extra,
        postgres: {
          image: "postgres:17",
          environment: { POSTGRES_USER: "serverguy", POSTGRES_DB: "app" },
          volumes: [volume("database", "/var/lib/postgresql/data")],
        },
      },
      volumes: { database: { name: `${project}_database` } },
    },
    inputs: [],
    data,
    database: { service: "postgres", version: "17" },
    summary: "Notes whose web and worker write PostgreSQL over the network",
  });
  const record = (writers?: string[]) => [
    {
      volume: "database",
      kind: "database" as const,
      sqlite: null,
      capture: "dump" as const,
      owner: "postgres",
      procedure: managedDatabaseProcedure,
      ...(writers ? { writers } : {}),
    },
  ];
  // Network writers mount nothing, yet they pause, dependents first, and the
  // dump is quiescent: its live fingerprint describes the same moment.
  const declared = backupCapturePlan(
    nativeFacts(stack(record(["web", "worker"]))),
  );
  expect(declared.pauseServices).toEqual(["worker", "web"]);
  expect(declared.dumps![0]).toMatchObject({
    service: "postgres",
    quiescent: true,
  });
  // Pi asserts that nothing but the owner writes it: nothing pauses, and the
  // fingerprint still counts.
  const none = backupCapturePlan(nativeFacts(stack(record([]))));
  expect(none.pauseServices).toEqual([]);
  expect(none.dumps![0].quiescent).toBe(true);
  // No declaration while clients keep running: the dump is taken online and
  // the plan says so, instead of comparing a live fingerprint to it.
  const online = backupCapturePlan(nativeFacts(stack(record())));
  expect(online.pauseServices).toEqual([]);
  expect(online.dumps![0].quiescent).toBe(false);
  // The owner cannot be its own writer: it keeps running to dump.
  expect(() =>
    backupCapturePlan(nativeFacts(stack(record(["postgres"])))),
  ).toThrow("cannot both pause and dump");
  // When every other running service already pauses for captured files,
  // nothing that could write the database keeps running: quiescent without
  // a declaration.
  const paused = stack(
    [
      ...record(),
      {
        volume: "uploads",
        kind: "files",
        sqlite: null,
        capture: "quiesced-files",
      },
    ],
    {},
  );
  paused.resolved.services.web.volumes = [volume("uploads", "/uploads")];
  paused.resolved.services.worker.volumes = [volume("uploads", "/work")];
  paused.resolved.volumes!.uploads = { name: `${project}_uploads` };
  const quiet = backupCapturePlan(nativeFacts(paused));
  expect(quiet.pauseServices).toEqual(["worker", "web"]);
  expect(quiet.dumps![0].quiescent).toBe(true);
});
it("declared writers survive preparation and corrections, and enter the pause set as declared", () => {
  // A worker that mounts nothing writes the database over the network.
  const withWorker = (config: NativeConfiguration): NativeConfiguration => ({
    ...config,
    resolved: {
      ...config.resolved,
      services: {
        ...config.resolved.services,
        worker: { image: `ghcr.io/qa/worker@sha256:${"d".repeat(64)}` },
      },
    },
  });
  const first = withWorker(wiki());
  const baseline = nativeFacts(first);
  const plan = (data: NativeConfiguration["data"]) =>
    backupCapturePlan(nativeFacts(withWorker(wiki(data))));
  // Without the declaration the worker keeps running: the dump is online.
  expect(plan(baseline.volumes.length ? first.data : [])).toMatchObject({
    pauseServices: ["wiki"],
    dumps: [{ service: "mariadb", quiescent: false }],
  });
  // Pi declares the worker a writer through preparation: the record keeps
  // it, and the plan pauses the worker although it mounts nothing.
  const declared = dataRecords(
    first.resolved,
    [{ volume: "mariadb-data", kind: "database", writers: ["worker"] }],
    baseline,
  );
  expect(declared.find((r) => r.volume === "mariadb-data")).toMatchObject({
    owner: "mariadb",
    capture: "dump",
    writers: ["worker"],
  });
  const paused = plan(declared);
  expect([...paused.pauseServices].sort()).toEqual(["wiki", "worker"]);
  expect(paused.dumps).toMatchObject([{ service: "mariadb", quiescent: true }]);
  // A correction that lists the volume plainly inherits the writers.
  const second = withWorker(wiki(declared));
  const corrected = dataRecords(
    second.resolved,
    [{ volume: "mariadb-data", kind: "database" }],
    nativeFacts(second),
  );
  expect(corrected.find((r) => r.volume === "mariadb-data")!.writers).toEqual([
    "worker",
  ]);
  expect([...plan(corrected).pauseServices].sort()).toEqual(["wiki", "worker"]);
  // An empty list is a declaration of its own: nothing else writes it, so
  // the worker keeps running and the dump is still quiescent.
  const none = dataRecords(
    second.resolved,
    [{ volume: "mariadb-data", kind: "database", writers: [] }],
    nativeFacts(second),
  );
  expect(none.find((r) => r.volume === "mariadb-data")!.writers).toEqual([]);
  expect(plan(none)).toMatchObject({
    pauseServices: ["wiki"],
    dumps: [{ quiescent: true }],
  });
  // Only an explicit null removes the declaration: the boundary is unknown
  // again and the dump goes online.
  const removed = dataRecords(
    second.resolved,
    [{ volume: "mariadb-data", kind: "database", writers: null }],
    nativeFacts(second),
  );
  expect(
    removed.find((r) => r.volume === "mariadb-data")!.writers,
  ).toBeUndefined();
  expect(plan(removed).dumps![0].quiescent).toBe(false);
  // A writer must be a service, and the owner is not one of its writers.
  expect(() =>
    dataRecords(
      first.resolved,
      [{ volume: "mariadb-data", kind: "database", writers: ["cron"] }],
      baseline,
    ),
  ).toThrow("writer cron is not a service");
  expect(() =>
    dataRecords(
      first.resolved,
      [{ volume: "mariadb-data", kind: "database", writers: ["mariadb"] }],
      baseline,
    ),
  ).toThrow("not one of its writers");
});
it("the managed PostgreSQL is a database owner with a default procedure, on new and older records alike", () => {
  const managed = (data: NativeConfiguration["data"]): NativeConfiguration => ({
    ...native,
    resolved: {
      name: project,
      services: {
        app: {
          image: `ghcr.io/qa/notes@sha256:${"a".repeat(64)}`,
          ports: [{ target: 8000, published: "80", protocol: "tcp" }],
        },
        postgres: {
          image: "postgres:17",
          environment: { POSTGRES_USER: "serverguy", POSTGRES_DB: "app" },
          volumes: [volume("database", "/var/lib/postgresql/data")],
        },
      },
      volumes: { database: { name: `${project}_database` } },
    },
    inputs: [],
    data,
    database: { service: "postgres", version: "17" },
    summary: "Notes on the managed PostgreSQL",
  });
  // An older release recorded the volume without a capture: its facts carry
  // the default, so the capture plan dumps it through its owner like any
  // other database, and nothing pauses when no service writes files.
  const legacy = nativeFacts(
    managed([{ volume: "database", kind: "database", sqlite: null }]),
  );
  expect(legacy.volumes[0]).toMatchObject({
    owner: "postgres",
    capture: "dump",
    procedure: managedDatabaseProcedure,
  });
  // No writers are declared and the app keeps running, so the dump is
  // taken online: nothing pauses, and no live fingerprint is compared.
  expect(backupCapturePlan(legacy)).toEqual({
    version: 2,
    pauseServices: [],
    volumes: [],
    dumps: [
      {
        volume: "database",
        service: "postgres",
        target: "/var/lib/postgresql/data",
        ...managedDatabaseProcedure,
        quiescent: false,
      },
    ],
  });
  // A new declaration naming the owner gets the same default recorded, and
  // Pi's own procedure replaces it.
  const resolved = managed([]).resolved;
  expect(
    dataRecords(
      resolved,
      [{ volume: "database", kind: "database", owner: "postgres" }],
      legacy,
    )[0],
  ).toEqual({
    volume: "database",
    kind: "database",
    sqlite: null,
    capture: "dump",
    owner: "postgres",
    procedure: managedDatabaseProcedure,
  });
  expect(
    dataRecords(
      resolved,
      [
        {
          volume: "database",
          kind: "database",
          owner: "postgres",
          capture: "dump",
          procedure,
        },
      ],
      legacy,
    )[0].procedure,
  ).toEqual(procedure);
});
