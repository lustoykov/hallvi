import { expect, it } from "vitest";
import {
  assertReleaseScope,
  type ReleaseScope,
} from "../../../src/server/release-scope";
import { ensureDeploymentLifecycle } from "../../../src/server/deployment-lifecycle";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { queuePlan } from "../../fixtures/queue-worker/plan";
function fixture() {
  const r = {
    id: "deployment",
    status: "live",
    repository: "qa/example",
    repositoryId: 10,
    revision: "a".repeat(40),
    plan: queuePlan(),
    serverId: 7,
    address: "203.0.113.7",
    verifiedAt: "2026-09-10T10:00:00Z",
    createdAt: "2026-09-10T09:00:00Z",
  } as DeploymentRecord;
  const life = ensureDeploymentLifecycle(r);
  const scope: ReleaseScope = {
    id: "scope",
    deploymentId: r.id,
    hostId: life.host.id,
    serverId: 7,
    address: r.address!,
    repository: r.repository,
    repositoryId: 10,
    revision: "b".repeat(40),
    baselineReleaseId: life.releases[0].id,
    maxAttempts: 3,
  };
  return { r, scope };
}
it("permits command, environment and dependency corrections within the same authorization", () => {
  const { r, scope } = fixture();
  const next = structuredClone(r.plan!);
  next.command = ["python", "correct_entrypoint.py"];
  next.environment.push({ name: "MODE", value: "production" });
  next.dependencies = [
    { service: "worker", needs: "queue", condition: "started" },
  ];
  expect(() => assertReleaseScope(r, scope, next)).not.toThrow();
});
it("blocks changing the host, removing data or changing exposure", () => {
  const { r, scope } = fixture();
  expect(() =>
    assertReleaseScope({ ...r, serverId: 8 }, scope, r.plan!),
  ).toThrow("host changed");
  const next = structuredClone(r.plan!);
  next.services![1].volumes = [];
  expect(() => assertReleaseScope(r, scope, next)).toThrow("Preserve volume");
  expect(() =>
    assertReleaseScope(r, scope, { ...r.plan!, httpAccess: "controller" }),
  ).toThrow("network exposure");
});

it("does not reuse an old scope after a different release was verified", () => {
  const { r, scope } = fixture();
  r.lifecycle!.runtime.lastVerified!.releaseId = "another-release";
  expect(() => assertReleaseScope(r, scope, r.plan!)).toThrow(
    "different release",
  );
});
