import { expect, it, vi } from "vitest";
import type { DeploymentStatus } from "../../../src/server/deployment-types";
import type { BackupPolicy } from "../../../src/server/scheduled-backup-types";
const mocks = vi.hoisted(() => ({
  deployment: vi.fn(),
  policy: vi.fn(),
  backupKind: vi.fn(),
  refresh: vi.fn(),
  ssh: vi.fn(),
  delay: vi.fn(),
  facts: vi.fn(),
}));
vi.mock("../../../src/server/deployment-store", () => ({
  applicationDeployment: mocks.deployment,
}));
vi.mock("../../../src/server/scheduled-backup-store", () => ({
  readBackupPolicy: mocks.policy,
}));
vi.mock("../../../src/server/scheduled-backup-install", () => ({
  backupKind: mocks.backupKind,
}));
vi.mock("../../../src/server/operation-store", () => ({
  proposeOperation: (input: object) => input,
  publicOperation: (operation: object) => operation,
}));
// Synthetic host, operation and polling delay for performBackupAction.
vi.mock("../../../src/server/scheduled-backup-host", () => ({
  backupHostPaths: () => ({ python: "py", runner: "run", config: "cfg" }),
  refreshScheduledBackups: mocks.refresh,
}));
vi.mock("../../../src/server/deployment-ssh", () => ({
  deploymentSsh: mocks.ssh,
  shellQuote: (value: string) => value,
}));
vi.mock("../../../src/server/application-operations", () => ({
  duringApplicationOperation: (_: string, work: () => unknown) => work(),
}));
vi.mock("node:timers/promises", () => ({ setTimeout: mocks.delay }));
vi.mock(import("../../../src/server/release-facts"), async (original) => ({
  ...(await original()),
  currentFacts: mocks.facts,
}));
import { performBackupAction } from "../../../src/server/scheduled-backup-actions";
import { proposeBackupOperation } from "../../../src/server/scheduled-backup-operations";

/** `admitted: false` means generic capture rejects today's plan. */
function propose(
  action: Parameters<typeof proposeBackupOperation>[1],
  {
    status = "live",
    kind,
    admitted = true,
  }: {
    status?: DeploymentStatus;
    kind?: BackupPolicy["kind"];
    admitted?: boolean;
  } = {},
) {
  mocks.deployment.mockReturnValue({
    id: "deployment",
    applicationId: "app",
    status,
  });
  mocks.policy.mockReturnValue(kind ? { kind } : null);
  mocks.backupKind.mockImplementation(() => {
    if (!admitted) throw new Error("Generic capture does not admit this plan.");
    return "stack";
  });
  return proposeBackupOperation("app", action);
}

it("gates configuration on generic capture without blocking installed legacy runs or restore tests", () => {
  for (const kind of ["sqlite-stack", "postgres"] as const) {
    const legacy = { kind, admitted: false };
    expect(() => propose("configure-backups", legacy)).toThrow(
      "Generic capture does not admit this plan.",
    );
    expect(propose("run-backup", legacy).source).toEqual({
      type: "backup",
      id: "deployment",
    });
    expect(propose("test-restore", legacy).source).toEqual({
      type: "restore",
      id: "deployment",
    });
  }
});
it("refuses runs and restore tests without a recognised installed policy", () => {
  for (const action of ["run-backup", "test-restore"] as const)
    expect(() => propose(action)).toThrow(
      "Configure a backup schedule and storage access first.",
    );
});
it("refuses a new capture from a deployment that is not live but still proposes and runs a restore test", async () => {
  const stopped = {
    status: "failed",
    kind: "postgres",
    admitted: false,
  } as const;
  expect(() => propose("run-backup", stopped)).toThrow(
    "A live deployment is required to capture a new backup.",
  );
  expect(propose("test-restore", stopped).source.type).toBe("restore");
  // The executor reads the same stopped deployment and installed policy.
  await expect(performBackupAction("app", "run-backup")).rejects.toThrow(
    "Deploy and verify this application first.",
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.ssh).not.toHaveBeenCalled();
  const host = { reachable: true, cleanupPending: false, running: false };
  const copy = { id: "copy", outcome: "succeeded" };
  const restore = { at: "now", outcome: "verified", cleanupComplete: true };
  mocks.refresh
    .mockResolvedValueOnce({ ...host, runs: [copy] })
    .mockResolvedValueOnce({ ...host, runs: [{ ...copy, restore }] });
  await expect(performBackupAction("app", "test-restore")).resolves.toEqual({
    evidence: expect.stringContaining(
      "passed its recorded database/file checks",
    ),
    runId: "copy",
  });
  expect(mocks.ssh).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.stringMatching(
      /^systemd-run --unit=server-guy-restore-deployment .* --test-restore copy$/,
    ),
  );
  expect(mocks.delay).toHaveBeenCalledWith(2000);
});
it("says what capture stops and keeps running from the recorded plan while legacy PostgreSQL dumps stay online", () => {
  mocks.facts.mockReturnValue(null);
  // Reconfiguring replaces a legacy policy with a generic one.
  expect(propose("configure-backups", { kind: "postgres" }).summary).toContain(
    "Capture pauses the application's services.",
  );
  // A web service with a finished initializer and a database owner that dumps.
  mocks.facts.mockReturnValue({
    database: null,
    services: [
      { name: "web", dependsOn: ["db", "init"] },
      { name: "init", dependsOn: ["db"], completes: true },
      { name: "db", dependsOn: [] },
    ],
    volumes: [
      {
        name: "config",
        kind: "files",
        capture: "quiesced-files",
        owner: "web",
        sqlite: null,
        mounts: [{ service: "web", target: "/config", readOnly: false }],
      },
      {
        name: "data",
        kind: "database",
        capture: "dump",
        owner: "db",
        sqlite: null,
        mounts: [{ service: "db", target: "/var/lib/mysql", readOnly: false }],
        procedure: { dump: ["dump"], restore: ["restore"], verify: ["verify"] },
      },
    ],
  });
  expect(propose("run-backup", { kind: "stack" }).summary).toContain(
    "Capture stops web. db keeps running to dump its data.",
  );
  const legacy = propose("run-backup", { kind: "postgres" }).summary;
  expect(legacy).toContain("The PostgreSQL dump runs online.");
  expect(legacy).not.toContain("pause");
});
