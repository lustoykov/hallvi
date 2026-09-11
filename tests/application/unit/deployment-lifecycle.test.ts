import { expect, it } from "vitest";
import {
  beginDeploymentAttempt,
  ensureDeploymentLifecycle,
  finishDeploymentAttempt,
  invalidateDeploymentRuntime,
  syncDeploymentHost,
} from "../../../src/server/deployment-lifecycle";
import { deploymentRuntime } from "../../../src/server/deployment-runtime";
import { releaseOf } from "../../../src/server/deployment-release";
import type { DeploymentRecord } from "../../../src/server/deployment-types";
import { queueNative } from "../../fixtures/queue-worker/native";

/** A verified first deployment, with the lifecycle its execution recorded. */
export function fixture(): DeploymentRecord {
  const r: DeploymentRecord = {
    id: "deployment-1",
    applicationId: "app-1",
    chatId: "chat-1",
    repository: "qa/queue",
    revision: "a".repeat(40),
    native: queueNative("deployment-1", "a".repeat(40)),
    status: "live",
    serverId: 10,
    serverCreateAttempted: true,
    address: "203.0.113.10",
    imageId: "sha256:one",
    serviceImages: { app: "sha256:one" },
    verifiedAt: "2026-09-10T08:00:00Z",
    createdAt: "2026-09-10T07:00:00Z",
    updatedAt: "2026-09-10T08:00:00Z",
    authority: {
      connectionId: "project-a",
      acceptedAt: "2026-09-10T07:00:00Z",
      maxMonthly: 10,
    },
    offer: null,
    url: "http://203.0.113.10",
    error: null,
    events: [],
    logs: "",
  };
  const release = releaseOf(r)!;
  const hostId = "host:deployment-1";
  r.lifecycle = {
    host: {
      id: hostId,
      provider: "hetzner",
      connectionId: "project-a",
      serverId: 10,
      address: "203.0.113.10",
    },
    releases: [release],
    attempts: [
      {
        id: "attempt-1",
        operationId: "deployment:deployment-1",
        releaseId: release.id,
        hostId,
        kind: "deploy",
        startedAt: "2026-09-10T07:00:00Z",
        finishedAt: "2026-09-10T08:00:00Z",
        outcome: "verified",
        remoteStartedAt: "2026-09-10T07:30:00Z",
        error: null,
        eventOffset: 0,
      },
    ],
    runtime: {
      state: "verified",
      lastVerified: {
        attemptId: "attempt-1",
        releaseId: release.id,
        hostId,
        revision: r.revision!,
        checkedAt: "2026-09-10T08:00:00Z",
        images: { app: "sha256:one" },
      },
    },
  };
  return r;
}
it("recreation makes a distinct attempt at the same release on the same host", () => {
  const r = fixture();
  const original = structuredClone(ensureDeploymentLifecycle(r));
  const a = beginDeploymentAttempt(r, "recreate", "recreate-1");
  invalidateDeploymentRuntime(r);
  expect(r.lifecycle!.runtime.state).toBe("unknown");
  r.verifiedAt = "2026-09-10T09:00:00Z";
  finishDeploymentAttempt(r, a.id, "verified");
  expect(r.lifecycle!.releases).toEqual(original.releases);
  expect(r.lifecycle!.host).toEqual(original.host);
  expect(r.lifecycle!.attempts[0]).toEqual(original.attempts[0]);
  expect(r.lifecycle!.attempts).toHaveLength(2);
  expect(a.id).not.toBe(original.attempts[0].id);
  expect(a.releaseId).toBe(original.attempts[0].releaseId);
  expect(r.lifecycle!.runtime.lastVerified!.attemptId).toBe(a.id);
});
it("keeps old verification historical after a different release fails remotely", () => {
  const r = fixture();
  const old = structuredClone(ensureDeploymentLifecycle(r));
  r.revision = "b".repeat(40);
  const a = beginDeploymentAttempt(r, "deploy", "deploy-2");
  invalidateDeploymentRuntime(r);
  r.imageId = "sha256:new-unverified-image";
  finishDeploymentAttempt(r, a.id, "failed", "Result check failed");
  expect(r.lifecycle!.releases).toHaveLength(2);
  expect(r.lifecycle!.releases[0]).toEqual(old.releases[0]);
  expect(r.lifecycle!.runtime).toEqual({
    state: "unknown",
    lastVerified: old.runtime.lastVerified,
  });
  expect(r.lifecycle!.runtime.lastVerified!.images.app).toBe("sha256:one");
});
it("records an observed runtime without promoting verification", () => {
  const r = fixture();
  const old = structuredClone(ensureDeploymentLifecycle(r).runtime);
  r.revision = "b".repeat(40);
  const unverified = beginDeploymentAttempt(r, "release", "release-1");
  invalidateDeploymentRuntime(r);
  r.serviceImages = { app: "sha256:observed" };
  finishDeploymentAttempt(r, unverified.id, "observed");
  expect(r.lifecycle!.runtime).toMatchObject({
    state: "observed",
    lastVerified: old.lastVerified,
    observed: {
      attemptId: unverified.id,
      behavior: "unverified",
      images: { app: "sha256:observed" },
    },
  });
  // A behavior failure after identity was established keeps that runtime.
  const failed = beginDeploymentAttempt(r, "release", "release-2");
  invalidateDeploymentRuntime(r);
  finishDeploymentAttempt(r, failed.id, "failed", "Behavior failed", true);
  expect(r.lifecycle!.runtime).toMatchObject({
    state: "observed",
    lastVerified: old.lastVerified,
    observed: { attemptId: failed.id, behavior: "failed" },
  });
  // A lost reply establishes nothing.
  const lost = beginDeploymentAttempt(r, "release", "release-3");
  invalidateDeploymentRuntime(r);
  finishDeploymentAttempt(r, lost.id, "failed", "Lost reply");
  expect(r.lifecycle!.runtime.state).toBe("unknown");
});
it("preflight failure keeps prior verification, while interrupted remote work does not", () => {
  const r = fixture();
  const old = structuredClone(ensureDeploymentLifecycle(r).runtime);
  const blocked = beginDeploymentAttempt(r, "recreate", "recreate-1");
  finishDeploymentAttempt(r, blocked.id, "failed", "Missing volume");
  expect(r.lifecycle!.runtime).toEqual(old);
  const retry = beginDeploymentAttempt(r, "recreate", "recreate-2");
  expect(retry.releaseId).toBe(blocked.releaseId);
  invalidateDeploymentRuntime(r);
  finishDeploymentAttempt(r, retry.id, "interrupted", "Worker stopped");
  expect(r.lifecycle!.runtime).toEqual({ ...old, state: "unknown" });
  expect(blocked.error).toBe("Missing volume");
});
it("does not invent serving identity or attempt history for a record that never executed", () => {
  const r = fixture();
  r.status = "failed";
  delete r.lifecycle;
  const untouched = structuredClone(r);
  expect(deploymentRuntime(r).state).toBe("unknown");
  expect(r).toEqual(untouched);
  const life = ensureDeploymentLifecycle(r);
  expect(life.attempts).toEqual([]);
  expect(life.releases).toEqual([]);
  expect(life.runtime).toEqual({ state: "unknown", lastVerified: null });
  expect(r.verifiedAt).toBe(untouched.verifiedAt);
});
it("rejects another host, a changed approved release, and overlapping attempts", () => {
  const r = fixture();
  r.serverId = 20;
  expect(() => syncDeploymentHost(r)).toThrow("host changed");
  r.serverId = 10;
  r.releaseId = releaseOf(r)!.id;
  const summary = r.native!.summary;
  r.native!.summary = `${summary} Changed after approval.`;
  expect(() => beginDeploymentAttempt(r, "deploy", "deploy-2")).toThrow(
    "release changed",
  );
  r.native!.summary = summary;
  beginDeploymentAttempt(r, "recreate", "recreate-1");
  expect(() => beginDeploymentAttempt(r, "recreate", "recreate-2")).toThrow(
    "unfinished",
  );
});
