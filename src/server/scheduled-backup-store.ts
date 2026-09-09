import {
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { piConfigDir } from "./pi-configuration";
import type { DeploymentRecord } from "./deployment-types";
import {
  backupPolicySchema,
  backupSnapshotSchema,
  type BackupPolicy,
  type BackupSnapshot,
} from "./scheduled-backup-types";
import { scheduledProtection } from "./scheduled-backup-facts";

export function backupSchedulePath(deploymentId: string, snapshot = false) {
  return join(
    piConfigDir(),
    "backup-schedules",
    `${z.uuid().parse(deploymentId)}${snapshot ? ".status" : ""}.json`,
  );
}
function read(path: string): unknown {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024)
      return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
function save(path: string, value: unknown) {
  mkdirSync(join(piConfigDir(), "backup-schedules"), {
    recursive: true,
    mode: 0o700,
  });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
  renameSync(temporary, path);
}
export function readBackupPolicy(
  record: DeploymentRecord | null,
): BackupPolicy | null {
  if (!record) return null;
  const parsed = backupPolicySchema.safeParse(
    read(backupSchedulePath(record.id)),
  );
  return parsed.success &&
    parsed.data.applicationId === record.applicationId &&
    parsed.data.deploymentId === record.id
    ? parsed.data
    : null;
}
export function saveBackupPolicy(policy: BackupPolicy) {
  save(
    backupSchedulePath(policy.deploymentId),
    backupPolicySchema.parse(policy),
  );
}
export function readBackupSnapshot(
  record: DeploymentRecord,
): BackupSnapshot | null {
  const parsed = backupSnapshotSchema.safeParse(
    read(backupSchedulePath(record.id, true)),
  );
  return parsed.success &&
    parsed.data.applicationId === record.applicationId &&
    parsed.data.deploymentId === record.id
    ? parsed.data
    : null;
}
export function saveBackupSnapshot(snapshot: BackupSnapshot) {
  const previous = backupSnapshotSchema.safeParse(
    read(backupSchedulePath(snapshot.deploymentId, true)),
  );
  if (
    previous.success &&
    Date.parse(previous.data.checkedAt) > Date.parse(snapshot.checkedAt)
  )
    return;
  save(
    backupSchedulePath(snapshot.deploymentId, true),
    backupSnapshotSchema.parse(snapshot),
  );
}
export function configuredBackupIds() {
  try {
    return readdirSync(join(piConfigDir(), "backup-schedules"))
      .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
      .map((name) => name.slice(0, -5))
      .filter((id) => z.uuid().safeParse(id).success);
  } catch {
    return [];
  }
}
export function scheduledProtectionFor(
  record: DeploymentRecord | null,
  now = Date.now(),
) {
  const policy = readBackupPolicy(record);
  return record && policy
    ? scheduledProtection(record, policy, readBackupSnapshot(record), now)
    : null;
}
