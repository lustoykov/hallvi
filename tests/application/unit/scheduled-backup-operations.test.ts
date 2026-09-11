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
vi.mock("../../../src/server/release-executor", () => ({
  releaseSecrets: () => ({
    values: { ADMIN_PASSWORD: "synthetic" },
    redact: (text: string) => text,
  }),
}));
vi.mock(import("../../../src/server/release-facts"), async (original) => ({
  ...(await original()),
  currentFacts: mocks.facts,
}));
import { performBackupAction } from "../../../src/server/scheduled-backup-actions";
const DEPLOYMENT = "0a1b2c3d-0000-4000-8000-00000000000d";
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
    id: DEPLOYMENT,
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
      id: DEPLOYMENT,
    });
    expect(propose("test-restore", legacy).source).toEqual({
      type: "restore",
      id: DEPLOYMENT,
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
  const copy = { id: "11111111-1111-4111-8111-111111111111", outcome: "succeeded" };
  // A legacy archive restored offline: nothing to boot, nothing to check.
  const restore = {
    at: "now",
    outcome: "verified",
    cleanupComplete: true,
    checks: ["archive-hash", "file-inventory", "database-restored"],
    measurements: { files: 3 },
    recoveryPointAt: "2026-09-11T03:00:00Z",
  };
  mocks.refresh
    .mockResolvedValueOnce({ ...host, runs: [copy] })
    .mockResolvedValueOnce({ ...host, runs: [{ ...copy, restore }] });
  await expect(performBackupAction("app", "test-restore")).resolves.toEqual({
    evidence: expect.stringContaining(
      "predates application boot in restore tests",
    ),
    runId: copy.id,
  });
  // The runner keeps the restored copy up for checks; recovery removes it.
  expect(mocks.ssh.mock.calls.map((call) => call[1])).toEqual([
    expect.stringMatching(
      /^systemd-run --unit=server-guy-restore-0a1b2c3d-0000-4000-8000-00000000000d .* --test-restore 11111111-1111-4111-8111-111111111111 --keep$/,
    ),
    "py run cfg --recover",
  ]);
  expect(mocks.delay).toHaveBeenCalledWith(2000);
});

it("runs the recorded and chosen checks inside the restored copy, never in the application's project, and removes the copy", async () => {
  mocks.facts.mockReturnValue({
    database: null,
    services: [{ name: "wiki", dependsOn: [] }],
    volumes: [],
    inputs: ["ADMIN_PASSWORD"],
    criterion: {
      commands: [
        {
          name: "Owner signs in",
          service: "wiki",
          run: ["php", "check-login.php"],
          inputs: ["ADMIN_PASSWORD"],
          contains: "LOGIN_OK",
        },
      ],
    },
  });
  const proposed = propose("test-restore", { kind: "stack" });
  expect(proposed.summary).toContain(
    "the recorded command checks (Owner signs in)",
  );
  // Pi's own checks name recorded services and inputs only.
  expect(() =>
    proposeBackupOperation("app", "test-restore", {
      checks: [{ name: "Page", service: "db", run: ["true"] }],
    }),
  ).toThrow("db is not a recorded service");
  expect(() =>
    proposeBackupOperation("app", "test-restore", {
      checks: [
        { name: "Page", service: "wiki", run: ["true"], inputs: ["OTHER"] },
      ],
    }),
  ).toThrow("OTHER is not a recorded private input");
  const chosen = proposeBackupOperation("app", "test-restore", {
    checks: [
      {
        name: "Marker page survived",
        service: "wiki",
        run: ["php", "find-page.php", "SG-MARKER"],
        contains: "found",
      },
    ],
  }) as unknown as { summary: string; command: { checks: unknown[] } };
  expect(chosen.summary).toContain(
    "checks chosen for this restore (Marker page survived)",
  );
  expect(chosen.command.checks).toHaveLength(1);
  const host = { reachable: true, cleanupPending: false, running: false };
  const runId = "22222222-2222-4222-8222-222222222222";
  const copy = { id: runId, outcome: "succeeded" };
  const restore = {
    at: "now",
    outcome: "verified",
    cleanupComplete: false,
    checks: ["archive-hash", "file-inventory", "database-content", "application-boot"],
    measurements: { files: 153 },
    recoveryPointAt: "2026-09-11T03:00:00Z",
    boot: {
      project: "sg-restore-22222222",
      seconds: 12.5,
      services: { wiki: { state: "running", exitCode: 0 } },
    },
  };
  mocks.refresh
    .mockResolvedValueOnce({ ...host, runs: [copy] })
    .mockResolvedValueOnce({ ...host, runs: [{ ...copy, restore }] })
    .mockResolvedValueOnce({ ...host, runs: [{ ...copy, restore }] });
  // The host answers each check with its record: output, then the marker.
  mocks.ssh.mockImplementation(async (_record, script: string) => {
    const marker = /printf '\\n(SG_CHECK_EXIT_[0-9a-f]+)%s/.exec(script)?.[1];
    if (!marker) return "";
    return `${script.includes("find-page.php") ? "found 1 page" : "LOGIN_OK"}\n${marker}{"exitCode":0,"bounded":1}\n`;
  });
  const result = (await performBackupAction("app", "test-restore", {
    schedule: "daily",
    keep: 7,
    checks: chosen.command.checks as never,
  })) as { evidence: string; checks: { name: string; passed: boolean }[] };
  expect(result.checks.map((c) => [c.name, c.passed])).toEqual([
    ["Owner signs in", true],
    ["Marker page survived", true],
  ]);
  expect(result.evidence).toContain("booted in isolation in 12.5 s");
  expect(result.evidence).toContain(
    "2 command checks passed (Owner signs in, Marker page survived)",
  );
  expect(result.evidence).toContain("matched the source's content fingerprint");
  const scripts = mocks.ssh.mock.calls.map((call) => String(call[1]));
  const checks = scripts.filter((s) => s.includes("SG_CHECK_EXIT_"));
  expect(checks).toHaveLength(2);
  for (const script of checks) {
    expect(script).toContain(
      "cd /var/lib/server-guy/backups/0a1b2c3d-0000-4000-8000-00000000000d/staging/restore-22222222-2222-4222-8222-222222222222",
    );
    expect(script).toContain("-p sg-restore-22222222 ");
    expect(script).not.toContain("sg-0a1b2c3d");
  }
  expect(scripts.at(-1)).toBe("py run cfg --recover");
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
it("records why a backup failed, so Pi can read it before advising a retry", async () => {
  propose("run-backup", { kind: "stack" });
  const host = { reachable: true, cleanupPending: false, running: false };
  const stuck = {
    id: "stuck",
    outcome: "failed",
    phase: "capture",
    errorCode: "source-stop-failed",
  };
  mocks.refresh
    .mockResolvedValueOnce({ ...host, runs: [] })
    .mockResolvedValueOnce({ ...host, runs: [stuck] });
  await expect(performBackupAction("app", "run-backup")).rejects.toThrow(
    "failed to stop cleanly",
  );
});
