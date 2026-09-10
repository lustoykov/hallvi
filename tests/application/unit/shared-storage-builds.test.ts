import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { queuePlan } from "../../fixtures/queue-worker/plan";
import {
  deploymentPlanSchema,
  type DeploymentRecord,
} from "../../../src/server/deployment-types";
import { composeDefinition } from "../../../src/server/deployment-compose";
import {
  sourceBuilds,
  sharedVolumes,
} from "../../../src/server/deployment-layout";
import {
  releaseBundle,
  releaseCommand,
} from "../../../src/server/release-executor";
import { releaseOf } from "../../../src/server/deployment-release";
import { stackOf } from "../../../src/server/application-stack";
import { backupKind } from "../../../src/server/scheduled-backup-install";
function plan() {
  const p = queuePlan();
  p.dependencies = [];
  p.inputBindings = [];
  p.missingInputs = [];
  const service = {
    name: "api",
    role: "service" as const,
    command: null,
    environment: [],
    configs: [],
    volumes: [],
    port: null,
    healthPath: null,
    checks: [],
  };
  p.services = [
    {
      ...service,
      build: { context: "backend", dockerfile: "backend/Dockerfile" },
    },
    {
      ...service,
      name: "worker",
      imageFrom: "api",
      command: ["python", "worker.py"],
    },
  ];
  p.volumes = [
    { name: "documents", target: "/documents", kind: "files", sqlite: null },
  ];
  p.services[1].volumes = [
    {
      name: "documents",
      target: "/input",
      kind: "files",
      sqlite: null,
      readOnly: true,
    },
  ];
  return p;
}
it("builds each source image independently and shares a selected image and volume", () => {
  const p = deploymentPlanSchema.parse(plan());
  const compose = composeDefinition(p, "revision", "id", "unused", {});
  expect(compose.services.api).toMatchObject({
    image: "server-guy-id-api:revision",
    build: { context: "./source/backend", dockerfile: "../backend/Dockerfile" },
  });
  expect(compose.services.worker).toMatchObject({
    image: "server-guy-id-api:revision",
    volumes: ["documents:/input:ro"],
  });
  expect(sharedVolumes(p)[0].mounts).toEqual([
    { service: "app", target: "/documents", readOnly: false, sqlite: null },
    { service: "worker", target: "/input", readOnly: true, sqlite: null },
  ]);
  const stack = stackOf({
    id: "id",
    status: "planning",
    revision: "revision",
    plan: p,
  } as DeploymentRecord);
  expect(stack.volumes).toHaveLength(1);
  expect(stack.volumes[0].mount).toContain("read-only");
  expect(stack.volumes[0].usedBy).toBe("app, worker");
});
it("includes companion source even when the primary service uses a published image", () => {
  const p = plan();
  p.image = "example/web:1";
  expect(sourceBuilds(p).map((b) => b.name)).toEqual(["api"]);
  expect(
    releaseBundle(
      p,
      "revision",
      "id",
      [
        {
          path: "backend/Dockerfile",
          mode: 0o644,
          content: Buffer.from("FROM scratch"),
        },
      ],
      "unused",
      {},
    ).map((f) => f.path),
  ).toContain("source/backend/Dockerfile");
});
it("a rollback runs only the recorded local images: no source, build, pull or volume removal", () => {
  const p = deploymentPlanSchema.parse(plan());
  p.image = `example/web@sha256:${"a".repeat(64)}`;
  const release = releaseOf({
    repository: "qa/example",
    revision: "b".repeat(40),
    plan: p,
  })!;
  const id = randomUUID(),
    attempt = randomUUID();
  const images: Record<string, string> = {
    app: `sha256:${"1".repeat(64)}`,
    api: `sha256:${"2".repeat(64)}`,
    worker: `sha256:${"2".repeat(64)}`,
  };
  const files = [
    {
      path: "backend/Dockerfile",
      mode: 0o644,
      content: Buffer.from("FROM scratch"),
    },
  ];
  const bundle = releaseBundle(
    p,
    release.revision,
    id,
    files,
    "unused",
    {},
    images,
  );
  expect(bundle.some((f) => f.path.startsWith("source/"))).toBe(false);
  const compose = JSON.parse(
    bundle.find((f) => f.path === "compose.json")!.content.toString(),
  );
  expect(Object.keys(compose.services).sort()).toEqual(
    Object.keys(images).sort(),
  );
  for (const [name, service] of Object.entries(compose.services)) {
    expect(service).toMatchObject({ image: images[name] });
    expect(service).not.toHaveProperty("build");
  }
  const incomplete = { ...images };
  delete incomplete.worker;
  expect(() =>
    releaseBundle(p, release.revision, id, files, "unused", {}, incomplete),
  ).toThrow();
  const update = releaseCommand(release, id, attempt, ["documents"]);
  const rollback = releaseCommand(
    release,
    id,
    attempt,
    ["documents"],
    false,
    images,
  );
  expect(update).toContain("compose.json build");
  expect(update).toContain("compose.json pull");
  expect(rollback).not.toContain("compose.json build");
  expect(rollback).not.toContain("compose.json pull");
  // A missing local image stops the host command before activation.
  const checked = rollback.slice(
    rollback.indexOf("phase=build"),
    rollback.indexOf("phase=activate"),
  );
  expect(checked).toContain("docker image inspect");
  for (const image of Object.values(images)) expect(checked).toContain(image);
  expect(rollback).toContain(`sg-${id.slice(0, 8)}_documents`);
  expect(rollback).toContain("--pull never");
  expect(rollback).not.toMatch(/\bdown\b|volume rm|prune/);
});
it("rejects missing/cyclic image references and inconsistent shared-state declarations", () => {
  const p = plan();
  p.services![1].imageFrom = "missing";
  expect(() => deploymentPlanSchema.parse(p)).toThrow("unknown service");
  p.services![1].imageFrom = "worker";
  expect(() => deploymentPlanSchema.parse(p)).toThrow("cycle");
  p.services![1].imageFrom = "api";
  p.services![1].volumes[0].kind = "database";
  expect(() => deploymentPlanSchema.parse(p)).toThrow("same data kind");
});
it("does not claim legacy backup coverage for a new shared-storage arrangement", () => {
  const p = plan();
  p.image = `grafana/grafana@sha256:${"a".repeat(64)}`;
  expect(() =>
    backupKind({
      status: "live",
      revision: "revision",
      plan: p,
    } as DeploymentRecord),
  ).toThrow("all writers");
});
