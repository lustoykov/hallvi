// Manual restore proofs, read back from the receipts a proof run writes into
// the configured runtime directory. A receipt is a private artifact: it names
// the storage account, the source host key, local paths, container and image
// digests, canary identity and, on failure, a raw error. None of that may
// reach a page, so the schema below is an allowlist rather than a description:
// fields it does not declare are dropped before anything is read, and the
// values it does declare are re-checked against their expected shape and
// re-stated in this module's own words. A receipt can therefore never put a
// string of its own on the screen.
//
// Nothing here claims protection. A proof is a dated test an operator started
// by hand; a missing, corrupt or mismatched receipt contributes nothing, and a
// success recorded against an earlier deployment is excluded outright.
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import type {
  BackupEvidenceFacts,
  BackupNote,
  BackupProof,
  GrafanaFunctionalChecks,
} from "./application-facts";
import type { DeploymentRecord } from "./deployment-types";
import { pluginEvidence } from "./backup-plugin-evidence";

/** The same runtime-owned directory the proof runs write into. */
function proofsDirectory() {
  return join(
    resolve(
      /* turbopackIgnore: true */ process.env.SERVER_GUY_CONFIG_DIR ??
        join(process.cwd(), ".server-guy"),
    ),
    "backup-proofs",
  );
}

/** Far beyond the number of proofs an operator runs; a bound, not a policy. */
const MAX_RECEIPTS = 200;
/** A receipt is a few kilobytes of counters. Anything larger is not one. */
const MAX_RECEIPT_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const REVISION = /^[0-9a-f]{7,40}$/i;

const instant = z.union([z.string(), z.number()]);
const quantity = z.number();

/**
 * The receipt fields this product reads. Written against the receipts the
 * proof runs produce today, and tolerant of the fields a later run adds:
 * unknown keys are stripped, and every optional field simply goes untested
 * when it is absent.
 */
const receiptSchema = z.object({
  proofId: z.string(),
  applicationId: z.string(),
  deploymentId: z.string(),
  revision: z.string().nullish(),
  status: z.string(),
  phase: z.string().optional(),
  offHostVerified: z.boolean().optional(),
  privateBucketCheck: z
    .object({
      r2DevEnabled: z.boolean(),
      customDomains: z.number(),
      checkedAt: instant.optional(),
    })
    .optional(),
  scheduleConfigured: z.boolean().optional(),
  retentionPolicyConfigured: z.boolean().optional(),
  containsLiveCredentials: z.boolean().optional(),
  startedAt: instant.optional(),
  uploadedAt: instant.optional(),
  finishedAt: instant.optional(),
  downloadVerifiedAt: instant.optional(),
  recoveryPointStartedAt: instant.optional(),
  // The account and object key in the same block are deliberately not read.
  destination: z.object({ bucket: z.string().optional() }).optional(),
  // A whole-stack proof.
  sourceCapture: z
    .object({ bytes: quantity.optional(), pauseSeconds: quantity.optional() })
    .optional(),
  sourcePauseSeconds: quantity.optional(),
  archiveSha256: z.string().optional(),
  archiveBytes: quantity.optional(),
  sqlite: z
    .record(z.string(), z.object({ tableCount: quantity, rowCount: quantity }))
    .optional(),
  verifiedFiles: quantity.optional(),
  healthyServices: z.array(z.string()).optional(),
  businessTablesVerifiedAfterBoot: z.array(z.string()).optional(),
  // Recorded only after the check passes; read as a flag, never as text.
  postBootInspection: z.string().optional(),
  prometheusSamplesVerified: quantity.optional(),
  grafanaDatasourceHealthVerified: quantity.optional(),
  // Checked separately below: these checks are still being designed, and a
  // shape this product has not seen must cost the proof its dashboard checks,
  // never the proof itself.
  grafanaFunctionalChecks: z.unknown().optional(),
  // A single-database proof.
  archive: z
    .object({
      createdAt: instant.optional(),
      bytes: quantity.optional(),
      sha256: z.string().optional(),
    })
    .optional(),
  // The row digest in the same block is deliberately not read.
  rowVerification: z.object({ rowCount: quantity }).optional(),
  schemaVerified: z.boolean().optional(),
  isolatedWriteVerified: z.boolean().optional(),
  sourceFixturesRemoved: z.boolean().optional(),
  sourceStagingRemoved: z.boolean().optional(),
  restoreResourcesRemoved: z.boolean().optional(),
  restoreTargetRemoved: z.boolean().optional(),
  canaryRemoved: z.boolean().optional(),
});

type Receipt = z.infer<typeof receiptSchema>;

/** Receipts record epoch seconds or an ISO string; both become one form. */
function isoTime(value: string | number | null | undefined): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Tolerate a later writer that records milliseconds.
    const time = new Date(value > 1e11 ? value : value * 1000);
    return Number.isNaN(time.getTime()) ? null : time.toISOString();
  }
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/** A count is a count only when it is a whole, non-negative number. */
function whole(value: number | undefined): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

function seconds(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

const plural = (count: number, word: string) =>
  `${count.toLocaleString("en-US")} ${word}${count === 1 ? "" : "s"}`;

/** Every check this receipt actually recorded, described by this module. */
function checksIn(receipt: Receipt): BackupNote[] {
  const checks: BackupNote[] = [];
  if (receipt.offHostVerified === true)
    checks.push({
      key: "downloaded-copy",
      label: "Downloaded copy",
      detail:
        "The restore read the copy downloaded back from the destination, not the local one.",
    });
  const databases = Object.values(receipt.sqlite ?? {});
  if (
    databases.length &&
    databases.every(
      (item) =>
        whole(item.tableCount) !== null && whole(item.rowCount) !== null,
    )
  ) {
    const tables = databases.reduce((sum, item) => sum + item.tableCount, 0);
    const rows = databases.reduce((sum, item) => sum + item.rowCount, 0);
    checks.push({
      key: "sqlite",
      label: `SQLite ${databases.length === 1 ? "database" : "databases"}`,
      detail: `${plural(tables, "table")} and ${plural(rows, "row")} in ${plural(databases.length, "database")} matched the captured source before the restored application started.`,
    });
  }
  const rows = whole(receipt.rowVerification?.rowCount);
  if (rows !== null)
    checks.push({
      key: "rows",
      label: "Database rows",
      detail: `${plural(rows, "row")} matched the captured source exactly.`,
    });
  if (receipt.schemaVerified === true)
    checks.push({
      key: "schema",
      label: "Schema, indexes and constraints",
      detail: "The restored database matched the captured source.",
    });
  const files = whole(receipt.verifiedFiles);
  if (files !== null && files > 0)
    checks.push({
      key: "files",
      label: "Archived files",
      detail: `${plural(files, "file")} matched the hashes recorded when they were copied.`,
    });
  const services = receipt.healthyServices?.length ?? 0;
  if (services)
    checks.push({
      key: "boot",
      label: "Application boot",
      detail: `${plural(services, "service")} started and answered on an isolated internal network.`,
    });
  if (receipt.postBootInspection === "Clean exit; no nonempty WAL sidecar")
    checks.push({
      key: "post-boot",
      label: "Clean shutdown before inspection",
      detail:
        "The restored application exited cleanly and left no unmerged write-ahead log, so the database read after boot was the real one.",
    });
  const records = receipt.businessTablesVerifiedAfterBoot?.length ?? 0;
  if (records)
    checks.push({
      key: "records",
      label: "Application records after boot",
      detail: `${plural(records, "group")} of the application's own records were re-checked after the restored application booted.`,
    });
  const samples = whole(receipt.prometheusSamplesVerified);
  if (samples !== null && samples > 0)
    checks.push({
      key: "metrics",
      label: "Historical metrics",
      detail: `${plural(samples, "stored sample")} matched a fixed query after the restore.`,
    });
  const sources = whole(receipt.grafanaDatasourceHealthVerified);
  if (sources !== null && sources > 0)
    checks.push({
      key: "datasource",
      label: "Dashboard data source",
      detail: `${plural(sources, "data source")} answered a health check through the restored application's authenticated API.`,
    });
  if (receipt.isolatedWriteVerified === true)
    checks.push({
      key: "write",
      label: "Write into the restored copy",
      detail:
        "A write succeeded and was rolled back. The running data was never touched.",
    });
  return checks;
}

/** What this proof does not show, in this view's words, not the run's. */
function gapsIn(receipt: Receipt): BackupNote[] {
  const gaps: BackupNote[] = [
    {
      key: "schedule",
      label: "Nothing is scheduled",
      detail:
        "Each proof is started by hand. No copy is taken between proofs, so this shows a restore worked on its date and nothing about today.",
    },
    {
      key: "cutover",
      label: "Not a host replacement",
      detail:
        "The restore ran into a disposable, isolated copy. Moving this application onto a replacement host was not tested.",
    },
    {
      key: "coverage",
      label: "Only the listed checks",
      detail:
        "Anything not listed above was not tested. An untested part of the application is not evidence either way.",
    },
  ];
  if (receipt.retentionPolicyConfigured !== true)
    gaps.push({
      key: "retention",
      label: "No retention policy",
      detail:
        "Nothing removes or ages the stored copy. It stays until someone removes it by hand.",
    });
  if (receipt.containsLiveCredentials === true)
    gaps.push({
      key: "credentials",
      label: "The copy holds live credentials",
      detail:
        "The archived configuration includes working credentials, so the stored copy has to stay private.",
    });
  return gaps;
}

/**
 * The Grafana checks a later proof records: a dashboard created against the
 * live source, a private authenticated fixture, and the plugins that fixture
 * installs. Counts only, and each part is independent, so a block that omits
 * one part leaves that part untested rather than passed.
 */
const grafanaChecksSchema = z.object({
  checkedAt: instant.optional(),
  dashboard: z
    .object({
      panels: quantity,
      queriesVerified: quantity,
      browserRendered: z.boolean().optional(),
      renderedCharts: quantity.optional(),
    })
    .optional(),
  credential: z
    .object({
      authenticatedQuery: z.boolean(),
      unauthenticatedRejected: z.boolean(),
      wrongPasswordRejected: z.boolean(),
    })
    .optional(),
  plugins: z
    .array(
      z.object({
        id: z.string().optional(),
        version: z.string().optional(),
        registered: z.boolean(),
        moduleServed: z.boolean(),
        behavior: z.string().nullish(),
        uiState: z.string().optional(),
        browserErrors: quantity.optional(),
      }),
    )
    .optional(),
  postgresPlugin: z
    .object({ healthVerified: z.boolean(), rowsVerified: quantity })
    .optional(),
});

function grafanaIn(receipt: Receipt): GrafanaFunctionalChecks | null {
  if (receipt.grafanaFunctionalChecks === undefined) return null;
  const parsed = grafanaChecksSchema.safeParse(receipt.grafanaFunctionalChecks);
  if (!parsed.success) return null;
  const checks = parsed.data;
  const panels = whole(checks.dashboard?.panels);
  const queries = whole(checks.dashboard?.queriesVerified);
  const plugins = checks.plugins;
  const items = pluginEvidence(plugins ?? [], checks.postgresPlugin);
  return {
    checkedAt: isoTime(checks.checkedAt),
    dashboard:
      panels !== null && queries !== null
        ? {
            panels,
            queriesVerified: queries,
            ...(checks.dashboard?.browserRendered !== undefined
              ? { browserRendered: checks.dashboard.browserRendered }
              : {}),
            ...(whole(checks.dashboard?.renderedCharts) !== null
              ? { renderedCharts: whole(checks.dashboard?.renderedCharts)! }
              : {}),
          }
        : null,
    credential: checks.credential ?? null,
    plugins: plugins
      ? {
          total: plugins.length,
          registered: plugins.filter((item) => item.registered).length,
          moduleServed: plugins.filter((item) => item.moduleServed).length,
          behaviourChecked: items.filter((item) => item.state === "verified")
            .length,
          items,
        }
      : null,
  };
}

function proofOf(receipt: Receipt, deployment: DeploymentRecord): BackupProof {
  const finishedAt = isoTime(receipt.finishedAt);
  const revision =
    typeof receipt.revision === "string" && REVISION.test(receipt.revision)
      ? receipt.revision.toLowerCase()
      : null;
  const recorded = receipt.archiveSha256 ?? receipt.archive?.sha256;
  const sha256 = recorded && SHA256.test(recorded) ? recorded : null;
  const bytes = whole(
    receipt.archiveBytes ??
      receipt.archive?.bytes ??
      receipt.sourceCapture?.bytes,
  );
  const candidateBucket = receipt.destination?.bucket;
  const bucket =
    candidateBucket && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(candidateBucket)
      ? candidateBucket
      : null;
  return {
    id: receipt.proofId,
    // A run that claimed success without the off-host round trip, or without
    // finishing, is not a proof. It is stated as incomplete, never as failed.
    outcome:
      receipt.status === "failed"
        ? "failed"
        : receipt.status === "verified" &&
            receipt.phase === "complete" &&
            receipt.offHostVerified === true &&
            sha256 !== null &&
            bytes !== null &&
            bytes > 0 &&
            bucket !== null &&
            finishedAt !== null
          ? "verified"
          : "incomplete",
    revision,
    revisionCurrent:
      revision !== null && revision === deployment.revision?.toLowerCase(),
    startedAt: isoTime(receipt.startedAt),
    capturedAt: isoTime(
      receipt.recoveryPointStartedAt ?? receipt.archive?.createdAt,
    ),
    uploadedAt: isoTime(receipt.uploadedAt),
    finishedAt,
    destination: bucket ? { provider: "r2", bucket } : null,
    archive: sha256 ? { bytes, sha256: sha256.toLowerCase() } : null,
    downloadedCopyVerified: receipt.offHostVerified === true,
    privateBucketCheckedAt:
      receipt.privateBucketCheck?.r2DevEnabled === false &&
      receipt.privateBucketCheck.customDomains === 0
        ? isoTime(receipt.privateBucketCheck.checkedAt)
        : null,
    cleanupNotes: cleanupNotes(receipt),
    sourcePauseSeconds: seconds(
      receipt.sourcePauseSeconds ?? receipt.sourceCapture?.pauseSeconds,
    ),
    checks: checksIn(receipt),
    gaps: gapsIn(receipt),
    grafana: grafanaIn(receipt),
  };
}

function cleanupNotes(receipt: Receipt): BackupNote[] {
  const notes: BackupNote[] = [];
  if (
    receipt.sourceFixturesRemoved === false ||
    receipt.canaryRemoved === false
  )
    notes.push({
      key: "source-fixtures",
      label: "Test data may remain on the live application",
      detail:
        "An operator needs to remove the temporary test records identified in the private receipt and verify their removal.",
    });
  if (
    receipt.restoreResourcesRemoved === false ||
    receipt.restoreTargetRemoved === false
  )
    notes.push({
      key: "restore-resources",
      label: "Temporary restore resources may remain",
      detail:
        "An operator needs to inspect and remove the test containers and volumes identified in the private receipt.",
    });
  if (receipt.sourceStagingRemoved === false)
    notes.push({
      key: "source-staging",
      label: "Temporary backup files may remain on the source server",
      detail:
        "An operator needs to remove the staging paths identified in the private receipt. They can contain credentials.",
    });
  return notes;
}

function readReceipt(path: string): Receipt | null {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size > MAX_RECEIPT_BYTES) return null;
    const text = readFileSync(descriptor, "utf8");
    if (text.length > MAX_RECEIPT_BYTES) return null;
    const value: unknown = JSON.parse(text.replace(/^﻿/, ""));
    const parsed = receiptSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
    // A read or parser error can quote the file. Never let one escape.
  } catch {
    return null;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * The proofs recorded for what this deployment is running now. A receipt from
 * an earlier deployment of the same application is counted and excluded: the
 * data it restored is not the data running today. A receipt whose own identity
 * does not match the folder holding it is counted as unreadable.
 *
 * Returns null when nothing was recorded at all, so a view keeps its existing
 * "no copy exists" state rather than showing an empty proof section.
 */
export function backupEvidenceFor(
  deployment: DeploymentRecord | null,
): BackupEvidenceFacts | null {
  if (!deployment) return null;
  const directory = proofsDirectory();
  let entries: string[];
  try {
    entries = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && UUID.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        at: statSync(join(directory, entry.name)).mtimeMs,
      }))
      .sort((a, b) => b.at - a.at)
      .map((entry) => entry.name);
  } catch {
    return null;
  }
  const proofs: BackupProof[] = [];
  let unreadable = 0;
  let mismatched = 0;
  let scheduleConfigured = false;
  let retentionConfigured = false;
  for (const name of entries
    .filter((entry) => UUID.test(entry))
    .slice(0, MAX_RECEIPTS)) {
    const receipt = readReceipt(join(directory, name, "receipt.json"));
    if (!receipt) {
      unreadable += 1;
      continue;
    }
    if (receipt.applicationId !== deployment.applicationId) continue;
    if (receipt.proofId !== name) {
      unreadable += 1;
      continue;
    }
    if (receipt.deploymentId !== deployment.id) {
      mismatched += 1;
      continue;
    }
    if (receipt.scheduleConfigured === true) scheduleConfigured = true;
    if (receipt.retentionPolicyConfigured === true) retentionConfigured = true;
    proofs.push(proofOf(receipt, deployment));
  }
  // An unreadable receipt alone says nothing about this application: the
  // folder is shared, and a broken file cannot name who it belongs to.
  if (!proofs.length && !mismatched) return null;
  const recordedAt = (proof: BackupProof) =>
    Date.parse(proof.startedAt ?? proof.finishedAt ?? "") || 0;
  proofs.sort((left, right) => recordedAt(right) - recordedAt(left));
  return {
    scheduleConfigured,
    retentionConfigured,
    proofs,
    unreadable,
    mismatched,
  };
}
