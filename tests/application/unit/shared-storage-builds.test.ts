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
import { releaseBundle } from "../../../src/server/release-executor";
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
