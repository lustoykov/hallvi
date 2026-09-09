import { describe, expect, it } from "vitest";
import { scheduledProtection } from "../../../src/server/scheduled-backup-facts";
import {
  backupPolicySchema,
  backupSnapshotSchema,
  scheduledRunSchema,
} from "../../../src/server/scheduled-backup-types";
import { protectionStatus } from "../../../src/components/server-guy/fact-status";
import { deploymentLock } from "../../../src/server/deployment-ssh";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const app = "00000000-0000-4000-8000-000000000001";
const deploymentId = "00000000-0000-4000-8000-000000000002";
const id = "00000000-0000-4000-8000-000000000003";
const at = "2026-09-09T16:00:00Z";
const revision = "a".repeat(40);
const deployment = {
  id: deploymentId,
  applicationId: app,
  status: "live",
  revision,
  plan: {
    postgres: { version: "16", variable: "DATABASE_URL", scheme: "postgresql" },
    volumes: [],
    services: [],
    configs: [],
    environment: [],
    command: null,
    port: 8000,
  },
  stack: {},
} as unknown as DeploymentRecord;
const policy = backupPolicySchema.parse({
  version: 1,
  applicationId: app,
  deploymentId,
  revision,
  kind: "postgres",
  provider: "r2",
  bucket: "test-backups",
  region: "auto",
  schedule: "daily",
  timezone: "Europe/Sofia",
  keep: 7,
  configuredAt: at,
});
const run = scheduledRunSchema.parse({
  version: 1,
  id,
  applicationId: app,
  deploymentId,
  revision,
  startedAt: at,
  capturedAt: at,
  finishedAt: at,
  outcome: "succeeded",
  phase: "complete",
  bytes: 4096,
  sha256: "b".repeat(64),
  retention: { deleted: 0, failed: false },
});
const snapshot = backupSnapshotSchema.parse({
  version: 1,
  applicationId: app,
  deploymentId,
  observedAt: at,
  checkedAt: at,
  reachable: true,
  timerActive: true,
  nextAt: null,
  running: false,
  cleanupPending: false,
  runs: [run],
});
const now = Date.parse(at);

describe("scheduled backup evidence", () => {
  it("does not call a schedule protected before a verified copy exists", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [] },
      now,
    );
    expect(facts.coverage[0].state).toBe("unprotected");
    expect(protectionStatus(facts).tone).not.toBe("ok");
  });
  it("separates verified transfer from a restore test", () => {
    const facts = scheduledProtection(deployment, policy, snapshot, now);
    expect(facts.coverage[0].lastSuccessfulAt).toBe(at);
    expect(facts.restoreTest).toBeNull();
    expect(protectionStatus(facts).title).toBe(
      "Backed up · restore not tested",
    );
  });
  it("preserves the last successful recovery point after a failed upload", () => {
    const failed = {
      ...run,
      id: "00000000-0000-4000-8000-000000000004",
      startedAt: "2026-09-09T16:01:00Z",
      outcome: "failed" as const,
      phase: "upload",
      errorCode: "secret-password-do-not-display",
      bytes: null,
      sha256: null,
    };
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [failed, run] },
      now,
    );
    expect(facts.coverage[0].lastSuccessfulAt).toBe(at);
    expect(protectionStatus(facts).tone).toBe("bad");
    expect(JSON.stringify(facts)).not.toContain("secret-password");
    expect(facts.lastAttempt?.reason).toContain("off-host upload failed");
  });
  it("does not turn a stale observation into current host health", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      snapshot,
      now + 121000,
    );
    expect(facts.observation?.reachable).toBe(false);
    expect(facts.coverage[0].state).toBe("unknown");
    expect(facts.coverage[0].lastSuccessfulAt).toBe(at);
    expect(protectionStatus(facts).title).toBe(
      "Current backup status is unavailable",
    );
  });
  it.each([
    [null, now],
    [{ ...snapshot, reachable: false }, now],
    [snapshot, now + 121000],
  ])(
    "keeps absent, unreachable or stale observations unknown",
    (observation, checkedAt) => {
      const facts = scheduledProtection(
        deployment,
        policy,
        observation,
        checkedAt,
      );
      expect(facts.coverage.every((item) => item.state === "unknown")).toBe(
        true,
      );
      expect(protectionStatus(facts).title).toBe(
        "Current backup status is unavailable",
      );
      if (!observation)
        expect(facts.coverage[0].note).toContain(
          "No verified off-host copy is recorded",
        );
    },
  );
  it("flags an old recorded copy without inferring whether newer host copies exist", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      snapshot,
      now + 5 * 24 * 3600000,
    );
    expect(facts.coverage[0].state).toBe("unknown");
    expect(facts.coverage[0].lastSuccessfulAt).toBe(at);
    expect(facts.coverage[0].note).toContain(
      "last recorded copy is older than the agreed policy",
    );
    expect(protectionStatus(facts).tone).toBe("warn");
  });
  it("retains a failed attempt as history while current coverage is unknown", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      {
        ...snapshot,
        reachable: false,
        runs: [{ ...run, outcome: "failed", phase: "upload" }],
      },
      now,
    );
    expect(facts.coverage[0].state).toBe("unknown");
    expect(facts.lastAttempt?.outcome).toBe("failed");
    expect(facts.history[0].outcome).toBe("failed");
  });
  it("keeps a freshly observed stopped schedule behind policy", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, timerActive: false },
      now,
    );
    expect(facts.coverage[0].state).toBe("behind");
  });
  it("marks a recovery point overdue even after a fresh host observation", () => {
    const late = now + 27 * 3600000;
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, observedAt: new Date(late).toISOString() },
      late,
    );
    expect(facts.coverage[0].state).toBe("behind");
    expect(protectionStatus(facts).tone).toBe("warn");
  });
  it("rejects another application's evidence and cannot cover a changed revision", () => {
    expect(
      scheduledProtection(
        deployment,
        policy,
        { ...snapshot, runs: [{ ...run, applicationId: deploymentId }] },
        now,
      ).coverage[0].lastSuccessfulAt,
    ).toBeNull();
    expect(
      scheduledProtection(
        { ...deployment, revision: "c".repeat(40) },
        policy,
        snapshot,
        now,
      ).coverage[0].lastSuccessfulAt,
    ).toBeNull();
  });
  it("keeps retention and restore cleanup failures distinct from transfer success", () => {
    const retention = scheduledProtection(
      deployment,
      policy,
      {
        ...snapshot,
        runs: [{ ...run, retention: { deleted: 0, failed: true } }],
      },
      now,
    );
    expect(retention.lastAttempt?.outcome).toBe("succeeded");
    expect(protectionStatus(retention).title).toContain("retention");
    const restored = {
      ...run,
      restore: {
        at,
        recoveryPointAt: at,
        outcome: "verified" as const,
        scope: "offline-database" as const,
        checks: [
          "archive-hash" as const,
          "backup-identity" as const,
          "database-restored" as const,
        ],
        measurements: { tables: 1, rows: 2 },
        cleanupComplete: false,
        errorCode: null,
      },
    };
    const cleanup = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [restored] },
      now,
    );
    expect(cleanup.restoreTest).not.toBeNull();
    expect(protectionStatus(cleanup).title).toContain("cleanup");
  });
  it("retains no unrecognized raw receipt content in the projection", () => {
    const parsed = scheduledRunSchema.parse({
      ...run,
      password: "private",
      objectKey: "private-path",
      error: "raw error with secrets",
    });
    expect(JSON.stringify(parsed)).not.toMatch(/private|raw error/);
    expect(scheduledRunSchema.safeParse({ ...run, bytes: -1 }).success).toBe(
      false,
    );
    expect(
      scheduledRunSchema.safeParse({ ...run, sha256: "unverified" }).success,
    ).toBe(false);
  });
  it("does not treat in-progress staging as a cleanup failure", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, running: true, cleanupPending: true },
      now,
    );
    expect(protectionStatus(facts).tone).toBe("working");
  });
  it("keeps expired receipts as history without offering them as recovery points", () => {
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [{ ...run, expiredAt: at }] },
      now,
    );
    expect(facts.coverage[0].lastSuccessfulAt).toBeNull();
    expect(facts.history[0].detail).toContain("removed");
    expect(protectionStatus(facts).tone).not.toBe("ok");
  });
  it("accepts an interrupted restore without inventing a recovery point", () => {
    const interrupted = scheduledRunSchema.parse({
      ...run,
      restore: {
        at,
        recoveryPointAt: null,
        outcome: "failed",
        scope: "offline-database",
        checks: [],
        measurements: {},
        cleanupComplete: true,
      },
    });
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [interrupted] },
      now,
    );
    expect(facts.restoreTest).toBeNull();
    expect(
      facts.history.find((item) => item.kind === "restore-test")?.outcome,
    ).toBe("failed");
  });
  it("shows bounded restore failure reasons without exposing raw details", () => {
    const failed = scheduledRunSchema.parse({
      ...run,
      restore: {
        at,
        recoveryPointAt: null,
        outcome: "failed",
        scope: "offline-database",
        checks: [],
        measurements: {},
        cleanupComplete: true,
        errorCode: "restore-image-unavailable",
      },
    });
    const facts = scheduledProtection(
      deployment,
      policy,
      { ...snapshot, runs: [failed] },
      now,
    );
    expect(
      facts.history.find((item) => item.kind === "restore-test")?.detail,
    ).toContain("database image is unavailable");
    failed.restore!.errorCode = "private-host-password";
    expect(
      JSON.stringify(
        scheduledProtection(
          deployment,
          policy,
          { ...snapshot, runs: [failed] },
          now,
        ),
      ),
    ).not.toContain("private-host-password");
  });
  it("uses the same validated host lock for backup and deployment mutations", () => {
    expect(deploymentLock(deploymentId, "docker compose up")).toContain(
      `/run/lock/server-guy-${deploymentId}.lock`,
    );
    expect(() => deploymentLock("bad; command", "docker compose up")).toThrow();
  });
});
