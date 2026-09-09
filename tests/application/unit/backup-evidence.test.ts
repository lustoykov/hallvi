// Reading operator restore proofs back from their receipts. The receipts are
// private artifacts that carry the storage account, the source host key, local
// paths, container digests, canary identity and, on failure, a raw error, so
// these tests hold two lines at once: a proof must never be overstated, and a
// receipt must never put a value of its own on the page.
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { backupEvidenceFor } from "../../../src/server/backup-evidence";
import { BackupEvidencePanel } from "../../../src/components/server-guy/views/backup-evidence";
import {
  backupEvidenceStatus,
  lastVerifiedProof,
  latestProof,
} from "../../../src/components/server-guy/fact-status";
import type { DeploymentRecord } from "../../../src/server/deployment-types";

const APPLICATION = "adb12487-2309-4257-b18d-cc951c190f72";
const DEPLOYMENT = "1cfd2677-1b20-4c51-9018-94f16cbf8b98";
const REVISION = "6fe82505d60eeb581e93d5a30ba9f6188abac66f";
const ARCHIVE_SHA =
  "b062af9b3eabf98189e756c44cb84244746baa48db01b4c7cebf89b9f33bd681";

/** Values a receipt carries that must never reach a page. */
const PRIVATE = {
  account: "a3127a330dd7dec14f1360b84ee2cb2f",
  hostKey:
    "256 SHA256:Q55uAydUS+cq9DNgN50bGZ3A9z8Z51TOlvUJabqo2eE operator@host (ED25519)",
  localPath: "/Users/someone/work/.server-guy/backup-proofs/x",
  container: "3a0c2a20153a1e5bbdc7e891fee3d0c9c1d4c356a0d332ea8bfe7f788e8012b1",
  canaryToken: "SG_BACKUP_PROOF_15c5e5a7",
  rowsDigest:
    "61e9c3fd6f30861e8cc4bdd033727c6f9909b771a82539537d8149b3f337c0ec",
  error: "ssh: connect to host 203.0.113.10 port 22: Connection refused",
  note: "Free text a later run might add.",
};

const deployment: DeploymentRecord = {
  id: DEPLOYMENT,
  applicationId: APPLICATION,
  chatId: "chat-a",
  status: "live",
  repository: "qa/kuma",
  revision: REVISION,
  plan: null,
  offer: null,
  authority: null,
  serverId: 1,
  serverCreateAttempted: true,
  address: "203.0.113.10",
  imageId: null,
  url: "http://203.0.113.10",
  verifiedAt: "2026-09-09T15:00:00.000Z",
  error: null,
  events: [],
  logs: "",
  createdAt: "2026-09-09T14:00:00.000Z",
  updatedAt: "2026-09-09T15:00:00.000Z",
};

/** A whole-stack proof as the real run writes it: epoch seconds and all. */
function stackReceipt(overrides: Record<string, unknown> = {}) {
  return {
    proofId: "79310e32-14d8-416e-ba9b-cd297210877e",
    applicationId: APPLICATION,
    deploymentId: DEPLOYMENT,
    revision: REVISION,
    status: "verified",
    phase: "complete",
    offHostVerified: true,
    scheduleConfigured: false,
    restoreProject: "sg-proof-79310e32",
    localArtifactsRetained: PRIVATE.localPath,
    remoteObjectsRetained: true,
    retentionPolicyConfigured: false,
    containsLiveCredentials: true,
    startedAt: 1788967614.6872342,
    destination: {
      account: PRIVATE.account,
      bucket: "server-guy-backups",
      objectPrefix: `applications/${APPLICATION}/79310e32`,
    },
    sourceHostKey: PRIVATE.hostKey,
    privateBucketCheck: { r2DevEnabled: false, customDomains: 0 },
    sourceCapture: {
      path: "/var/tmp/server-guy-proof-79310e32/stack.tar.gz",
      bytes: 46744,
      sha256: ARCHIVE_SHA,
      pauseSeconds: 4.739277601242065,
    },
    sourceContainers: [PRIVATE.container],
    uploadAttempted: true,
    uploadedAt: 1788967632.497185,
    archiveSha256: ARCHIVE_SHA,
    archiveBytes: 46744,
    sqlite: { "uptime-kuma-data/kuma.db": { tableCount: 29, rowCount: 969 } },
    verifiedFiles: 5,
    sourcePauseSeconds: 4.739277601242065,
    healthyServices: ["app"],
    postBootInspection: "Clean exit; no nonempty WAL sidecar",
    businessTablesVerifiedAfterBoot: ["user", "monitor", "setting"],
    provisioningNote: PRIVATE.note,
    restoreResourcesRemoved: true,
    finishedAt: 1788967644.312487,
    ...overrides,
  };
}

/** A single-database proof: ISO timestamps and a different set of checks. */
function databaseReceipt(overrides: Record<string, unknown> = {}) {
  return {
    proofId: "15c5e5a7-4c24-41fd-94e9-949fde4f9305",
    applicationId: APPLICATION,
    deploymentId: DEPLOYMENT,
    revision: REVISION,
    startedAt: "2026-09-09T15:14:54.784Z",
    status: "verified",
    phase: "complete",
    offHostVerified: true,
    scheduleConfigured: false,
    retentionPolicyConfigured: false,
    coverage: "Todo PostgreSQL database only",
    restoreContainer: "sg-restore-proof-15c5e5a7",
    localArtifactsRetained: [PRIVATE.localPath],
    sourceHostKey: PRIVATE.hostKey,
    sourceContainer: {
      id: PRIVATE.container,
      image: `sha256:${"f".repeat(64)}`,
    },
    canary: { token: PRIVATE.canaryToken, id: "95479610", status: "cleanup" },
    recoveryPointStartedAt: "2026-09-09T15:15:04.690Z",
    destination: {
      provider: "cloudflare-r2",
      account: PRIVATE.account,
      bucket: "server-guy-backups",
      objectKey: `applications/${APPLICATION}/15c5e5a7/postgres.dump`,
    },
    archive: {
      createdAt: "2026-09-09T15:15:06.213Z",
      bytes: 2340,
      sha256: `40807d7c${"0".repeat(56)}`,
    },
    uploadedAt: "2026-09-09T15:15:08.336Z",
    downloadVerifiedAt: "2026-09-09T15:15:10.413Z",
    rowVerification: { rowCount: 1, rowsSha256: PRIVATE.rowsDigest },
    schemaVerified: true,
    isolatedWriteVerified: true,
    finishedAt: "2026-09-09T15:15:13.162Z",
    ...overrides,
  };
}

let directory: string;

function write(name: string, receipt: unknown) {
  const folder = join(directory, "backup-proofs", name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, "receipt.json"),
    typeof receipt === "string" ? receipt : JSON.stringify(receipt),
  );
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "server-guy-proofs-"));
  process.env.SERVER_GUY_CONFIG_DIR = directory;
});

afterEach(() => {
  delete process.env.SERVER_GUY_CONFIG_DIR;
  rmSync(directory, { recursive: true, force: true });
});

describe("reading a proof receipt", () => {
  it("restates a whole-stack proof as counted checks and normalized times", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", stackReceipt());
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs).toHaveLength(1);
    const proof = facts.proofs[0];
    expect(proof.outcome).toBe("verified");
    expect(proof.revisionCurrent).toBe(true);
    expect(proof.downloadedCopyVerified).toBe(true);
    expect(proof.archive).toEqual({ bytes: 46744, sha256: ARCHIVE_SHA });
    expect(proof.destination).toEqual({
      provider: "r2",
      bucket: "server-guy-backups",
    });
    // Epoch seconds become an instant the interface can render.
    expect(proof.startedAt).toBe("2026-09-09T15:26:54.687Z");
    expect(proof.finishedAt).toBe("2026-09-09T15:27:24.312Z");
    expect(proof.sourcePauseSeconds).toBeCloseTo(4.74, 2);
    expect(proof.grafana).toBeNull();
    const checks = Object.fromEntries(
      proof.checks.map((check) => [check.key, check.detail]),
    );
    expect(checks.sqlite).toContain("29 tables");
    expect(checks.sqlite).toContain("969 rows");
    expect(checks.files).toContain("5 files");
    expect(checks.records).toContain("3 groups");
    expect(checks).toHaveProperty("downloaded-copy");
    expect(checks).toHaveProperty("post-boot");
    // Nothing the receipt did not record is claimed.
    expect(checks).not.toHaveProperty("rows");
    expect(checks).not.toHaveProperty("schema");
    expect(checks).not.toHaveProperty("metrics");
  });

  it("reads a single-database proof and its recovery point", () => {
    write("15c5e5a7-4c24-41fd-94e9-949fde4f9305", databaseReceipt());
    const proof = backupEvidenceFor(deployment)!.proofs[0];
    expect(proof.outcome).toBe("verified");
    expect(proof.capturedAt).toBe("2026-09-09T15:15:04.690Z");
    expect(proof.archive?.bytes).toBe(2340);
    const keys = proof.checks.map((check) => check.key);
    expect(keys).toContain("rows");
    expect(keys).toContain("schema");
    expect(keys).toContain("write");
    expect(keys).not.toContain("sqlite");
  });

  it("never states a schedule or a retention policy a receipt denies", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", stackReceipt());
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.scheduleConfigured).toBe(false);
    expect(facts.retentionConfigured).toBe(false);
    const gaps = facts.proofs[0].gaps.map((gap) => gap.key);
    expect(gaps).toContain("schedule");
    expect(gaps).toContain("cutover");
    expect(gaps).toContain("coverage");
    expect(gaps).toContain("retention");
    expect(gaps).toContain("credentials");
  });
});

describe("association with the application and its revision", () => {
  it("ignores a proof recorded for a different application", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ applicationId: "e16000ed-2ee1-4d50-8825-19fdd24393f2" }),
    );
    expect(backupEvidenceFor(deployment)).toBeNull();
  });

  it("excludes and counts a proof from an earlier deployment", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ deploymentId: "31760557-088f-48bb-a01b-db1adf2c624a" }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs).toEqual([]);
    expect(facts.mismatched).toBe(1);
    expect(lastVerifiedProof(facts)).toBeNull();
    expect(backupEvidenceStatus(facts).tone).not.toBe("ok");
  });

  it("keeps an older revision's proof but marks it as not the current one", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ revision: "a".repeat(40) }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs[0].revisionCurrent).toBe(false);
    expect(facts.proofs[0].outcome).toBe("verified");
    expect(backupEvidenceStatus(facts).title).toBe(
      "Restore proved for an earlier revision",
    );
  });

  it("rejects a receipt whose own identity is not the folder holding it", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ proofId: "x" }),
    );
    const facts = backupEvidenceFor(deployment);
    expect(facts).toBeNull();
  });
});

describe("what counts as a verified restore", () => {
  it("keeps verified recovery when cleanup fails and exposes the outstanding work", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        sourceFixturesRemoved: false,
        restoreResourcesRemoved: false,
        sourceStagingRemoved: false,
      }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(lastVerifiedProof(facts)!.outcome).toBe("verified");
    expect(facts.proofs[0].cleanupNotes).toHaveLength(3);
    expect(backupEvidenceStatus(facts)).toEqual({
      tone: "bad",
      title: "Temporary restore resources need cleanup",
    });
    const markup = renderToStaticMarkup(
      createElement(BackupEvidencePanel, { facts, now: Date.now() }),
    );
    expect(markup).toContain("Verified restore");
    expect(markup).toContain("Cleanup needs attention");
    expect(markup).toContain("Test data may remain on the live application");
    expect(markup).not.toContain("No proof has restored");
  });

  it("does not render invalid SQLite counters as checked data", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        sqlite: { database: { tableCount: -2, rowCount: 0.5 } },
      }),
    );
    expect(
      backupEvidenceFor(deployment)!.proofs[0].checks.some(
        (check) => check.key === "sqlite",
      ),
    ).toBe(false);
  });

  it("is not verified when the restore never read the off-host copy", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ offHostVerified: false }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs[0].outcome).toBe("incomplete");
    expect(lastVerifiedProof(facts)).toBeNull();
    expect(backupEvidenceStatus(facts)).toEqual({
      tone: "muted",
      title: "The last restore proof did not finish",
    });
  });

  it("is not verified while a run is still recorded as running", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        status: "running",
        phase: "restore",
        finishedAt: undefined,
      }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs[0].outcome).toBe("incomplete");
    expect(lastVerifiedProof(facts)).toBeNull();
  });

  it("is not verified when a run claimed success before completing", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ phase: "restore" }),
    );
    expect(backupEvidenceFor(deployment)!.proofs[0].outcome).toBe("incomplete");
  });

  it("leads with a newer failure without erasing an older success", () => {
    write(
      "15c5e5a7-4c24-41fd-94e9-949fde4f9305",
      databaseReceipt({ startedAt: "2026-09-09T10:00:00.000Z" }),
    );
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        status: "failed",
        phase: "restore",
        error: PRIVATE.error,
        startedAt: 1788967614.6872342,
      }),
    );
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs.map((proof) => proof.outcome)).toEqual([
      "failed",
      "verified",
    ]);
    expect(latestProof(facts)!.outcome).toBe("failed");
    expect(lastVerifiedProof(facts)!.id).toBe(
      "15c5e5a7-4c24-41fd-94e9-949fde4f9305",
    );
    expect(backupEvidenceStatus(facts)).toEqual({
      tone: "bad",
      title: "The last restore proof failed",
    });
  });
});

describe("missing and unusable evidence", () => {
  it("records nothing when no proof directory exists", () => {
    expect(backupEvidenceFor(deployment)).toBeNull();
    expect(backupEvidenceFor(null)).toBeNull();
  });

  it("does not invent a proof from a receipt that cannot be parsed", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", "{ not json");
    expect(backupEvidenceFor(deployment)).toBeNull();
  });

  it("does not invent a proof from a receipt missing its identity", () => {
    const receipt = stackReceipt();
    delete (receipt as Record<string, unknown>).deploymentId;
    write("79310e32-14d8-416e-ba9b-cd297210877e", receipt);
    expect(backupEvidenceFor(deployment)).toBeNull();
  });

  it("counts an unusable receipt beside real evidence without crediting it", () => {
    write("15c5e5a7-4c24-41fd-94e9-949fde4f9305", databaseReceipt());
    write("79310e32-14d8-416e-ba9b-cd297210877e", "{ not json");
    const facts = backupEvidenceFor(deployment)!;
    expect(facts.proofs).toHaveLength(1);
    expect(facts.unreadable).toBe(1);
    expect(lastVerifiedProof(facts)!.outcome).toBe("verified");
  });

  it("drops a checksum that is not a checksum rather than showing it", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ archiveSha256: "not-a-digest" }),
    );
    expect(backupEvidenceFor(deployment)!.proofs[0].archive).toBeNull();
    expect(backupEvidenceFor(deployment)!.proofs[0].outcome).toBe("incomplete");
  });

  it("never claims bucket privacy without the recorded check", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ privateBucketCheck: undefined }),
    );
    expect(
      backupEvidenceFor(deployment)!.proofs[0].privateBucketCheckedAt,
    ).toBeNull();
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        privateBucketCheck: {
          r2DevEnabled: true,
          customDomains: 0,
          checkedAt: "2026-09-09T15:00:00Z",
        },
      }),
    );
    expect(
      backupEvidenceFor(deployment)!.proofs[0].privateBucketCheckedAt,
    ).toBeNull();
  });

  it("rejects oversized and linked receipts before parsing", () => {
    const id = "79310e32-14d8-416e-ba9b-cd297210877e";
    write(id, " ".repeat(256 * 1024 + 1));
    expect(backupEvidenceFor(deployment)).toBeNull();
    const receipt = join(directory, "backup-proofs", id, "receipt.json");
    rmSync(receipt);
    const target = join(directory, "private.json");
    writeFileSync(target, JSON.stringify(stackReceipt()));
    symlinkSync(target, receipt);
    expect(backupEvidenceFor(deployment)).toBeNull();
  });

  it("ignores folders that are not proof folders", () => {
    write("notes", stackReceipt());
    expect(backupEvidenceFor(deployment)).toBeNull();
  });
});

describe("Grafana functional checks", () => {
  const checks = {
    dashboard: { uid: "sg-fixture-1", panels: 3, queriesVerified: 3 },
    credential: {
      authenticatedQuery: true,
      unauthenticatedRejected: true,
      wrongPasswordRejected: false,
    },
    plugins: [
      {
        id: "grafana-clock-panel",
        name: "Clock",
        version: "2.1.3",
        registered: true,
        moduleServed: true,
        behavior: "rendered the current time",
      },
      {
        id: "grafana-piechart-panel",
        name: "Pie chart",
        version: "1.6.4",
        registered: true,
        moduleServed: false,
        behavior: null,
      },
    ],
    checkedAt: 1788967640,
  };

  it("counts what was checked and keeps a failed check as failed", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ grafanaFunctionalChecks: checks }),
    );
    const grafana = backupEvidenceFor(deployment)!.proofs[0].grafana!;
    expect(grafana.dashboard).toEqual({ panels: 3, queriesVerified: 3 });
    expect(grafana.credential).toEqual({
      authenticatedQuery: true,
      unauthenticatedRejected: true,
      wrongPasswordRejected: false,
    });
    expect(grafana.plugins).toMatchObject({
      total: 2,
      registered: 2,
      moduleServed: 1,
      behaviourChecked: 0,
    });
    expect(grafana.checkedAt).toBe("2026-09-09T15:27:20.000Z");
  });

  it("treats absent checks as untested rather than as passing", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", stackReceipt());
    expect(backupEvidenceFor(deployment)!.proofs[0].grafana).toBeNull();
  });

  it("treats a partial block as untested for the parts it omits", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ grafanaFunctionalChecks: { checkedAt: 1788967640 } }),
    );
    const grafana = backupEvidenceFor(deployment)!.proofs[0].grafana!;
    expect(grafana.dashboard).toBeNull();
    expect(grafana.credential).toBeNull();
    expect(grafana.plugins).toBeNull();
  });
});

describe("what leaves this module", () => {
  it("carries no account, host key, path, digest, resource name or error", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", stackReceipt());
    write("15c5e5a7-4c24-41fd-94e9-949fde4f9305", databaseReceipt());
    write(
      "c5e9741a-7b2f-4253-996b-18f4906ca006",
      stackReceipt({
        proofId: "c5e9741a-7b2f-4253-996b-18f4906ca006",
        status: "failed",
        error: PRIVATE.error,
        grafanaFunctionalChecks: {
          dashboard: { uid: "sg-fixture-1", panels: 1, queriesVerified: 1 },
          plugins: [
            {
              id: "grafana-clock-panel",
              name: "Clock",
              version: "2.1.3",
              registered: true,
              moduleServed: true,
              behavior: "rendered the current time",
            },
          ],
          checkedAt: 1788967640,
        },
      }),
    );
    const serialized = JSON.stringify(backupEvidenceFor(deployment));
    for (const secret of Object.values(PRIVATE))
      expect(serialized).not.toContain(secret);
    for (const fragment of [
      "sg-proof-",
      "sg-restore-proof-",
      "/var/tmp",
      "objectPrefix",
      "objectKey",
      "uptime-kuma-data",
      "kuma.db",
      "grafana-clock-panel",
      "sg-fixture-1",
      "Connection refused",
      "monitor",
    ])
      expect(serialized).not.toContain(fragment);
  });

  it("passes the archive checksum through, because that is the evidence", () => {
    write("79310e32-14d8-416e-ba9b-cd297210877e", stackReceipt());
    expect(JSON.stringify(backupEvidenceFor(deployment))).toContain(
      ARCHIVE_SHA,
    );
  });
});

describe("what the page says", () => {
  const render = () =>
    renderToStaticMarkup(
      createElement(BackupEvidencePanel, {
        facts: backupEvidenceFor(deployment)!,
        now: Date.parse("2026-09-10T09:00:00.000Z"),
      }),
    );

  it("states the proof and its limits, and never a schedule", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({
        grafanaFunctionalChecks: {
          dashboard: { uid: "sg-fixture-1", panels: 2, queriesVerified: 2 },
          credential: {
            authenticatedQuery: true,
            unauthenticatedRejected: true,
            wrongPasswordRejected: true,
          },
          plugins: [
            {
              id: "grafana-clock-panel",
              name: "Clock",
              version: "2.1.3",
              registered: true,
              moduleServed: true,
              behavior: null,
            },
          ],
          checkedAt: 1788967640,
        },
      }),
    );
    const markup = render();
    expect(markup).toContain("Verified restore");
    expect(markup).toContain("Nothing is scheduled");
    expect(markup).toContain("No retention policy");
    expect(markup).toContain("Nothing runs on its own");
    expect(markup).toContain("29 tables");
    expect(markup).toContain(ARCHIVE_SHA);
    // A plugin that only served its module is grouped as checked, never as
    // function tested, and keeps the sentence saying so.
    expect(markup).toContain("1 of 1 matched their archived module hash");
    expect(markup).toContain("Module checked");
    expect(markup).toContain("No functional query was tested");
    expect(markup).not.toContain("Function tested");
    // A proof is never dressed as protection or as a running schedule.
    for (const claim of [
      "Protected",
      "Nightly",
      "Behind policy",
      "Back up now",
      "No copy exists",
    ])
      expect(markup).not.toContain(claim);
    for (const secret of Object.values(PRIVATE))
      expect(markup).not.toContain(secret);
    for (const fragment of ["sg-fixture-1", "grafana-clock-panel", "kuma.db"])
      expect(markup).not.toContain(fragment);
  });

  it("says plainly that nothing restored when no attempt succeeded", () => {
    write(
      "79310e32-14d8-416e-ba9b-cd297210877e",
      stackReceipt({ status: "failed", error: PRIVATE.error }),
    );
    const markup = render();
    expect(markup).toContain("No proof has restored this deployment");
    expect(markup).toContain("Failed");
    expect(markup).not.toContain("Verified<");
    expect(markup).not.toContain(PRIVATE.error);
    expect(markup).not.toContain("Connection refused");
  });
});
