import { z } from "zod";

const timestamp = z.iso.datetime({ offset: true });
export const backupPolicySchema = z.object({
  version: z.literal(1),
  applicationId: z.uuid(),
  deploymentId: z.uuid(),
  revision: z.string().regex(/^[a-f0-9]{40,64}$/),
  kind: z.enum(["sqlite-stack", "postgres", "stack"]),
  data: z
    .object({
      postgres: z.boolean(),
      sqlite: z.boolean(),
      fileDatabases: z.boolean().optional(),
      /** Databases their declared owners dump by recorded commands. */
      dumps: z.boolean().optional(),
    })
    .optional(),
  provider: z.enum(["r2", "s3"]),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
  region: z.string().regex(/^[a-z0-9-]{1,40}$/),
  schedule: z.enum(["daily", "six-hourly"]),
  timezone: z.literal("Europe/Sofia"),
  keep: z.number().int().min(2).max(90),
  configuredAt: timestamp,
  operationId: z.uuid().nullable().default(null),
});
export type BackupPolicy = z.infer<typeof backupPolicySchema>;

export const scheduledRunSchema = z.object({
  version: z.literal(1),
  id: z.uuid(),
  applicationId: z.uuid(),
  deploymentId: z.uuid(),
  revision: z.string().regex(/^[a-f0-9]{40,64}$/),
  startedAt: timestamp,
  capturedAt: timestamp.nullable().default(null),
  finishedAt: timestamp.nullable().default(null),
  expiredAt: timestamp.nullable().default(null),
  restoreInProgress: z.boolean().default(false),
  outcome: z.enum(["running", "succeeded", "failed"]),
  phase: z.string().max(40),
  bytes: z.number().int().nonnegative().nullable().default(null),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
  sourcePauseSeconds: z.number().nonnegative().nullable().default(null),
  errorCode: z.string().max(80).nullable().default(null),
  retention: z.object({
    deleted: z.number().int().nonnegative(),
    failed: z.boolean(),
  }),
  restore: z
    .object({
      at: timestamp,
      recoveryPointAt: timestamp.nullable(),
      outcome: z.enum(["verified", "failed"]),
      scope: z.enum(["offline-database-and-files", "offline-database"]),
      checks: z
        .array(
          z.enum([
            "archive-hash",
            "archive-structure",
            "backup-identity",
            "file-inventory",
            "database-integrity",
            "database-schema",
            "database-rows",
            "database-restored",
            "database-tables",
            "database-empty",
          ]),
        )
        .max(20),
      measurements: z.object({
        files: z.number().int().nonnegative().optional(),
        tables: z.number().int().nonnegative().optional(),
        rows: z.number().int().nonnegative().optional(),
      }),
      cleanupComplete: z.boolean(),
      errorCode: z.string().max(80).nullable().default(null),
    })
    .nullable()
    .default(null),
});
export type ScheduledRun = z.infer<typeof scheduledRunSchema>;

export const backupSnapshotSchema = z.object({
  version: z.literal(1),
  applicationId: z.uuid(),
  deploymentId: z.uuid(),
  observedAt: timestamp,
  checkedAt: timestamp,
  reachable: z.boolean(),
  timerActive: z.boolean(),
  nextAt: timestamp.nullable(),
  running: z.boolean(),
  cleanupPending: z.boolean(),
  runs: z.array(scheduledRunSchema).max(30),
});
export type BackupSnapshot = z.infer<typeof backupSnapshotSchema>;

export function scheduleCalendar(policy: Pick<BackupPolicy, "schedule">) {
  return policy.schedule === "daily"
    ? "*-*-* 03:00:00 Europe/Sofia"
    : "*-*-* 00,06,12,18:00:00 Europe/Sofia";
}
export function scheduleLabel(policy: Pick<BackupPolicy, "schedule">) {
  return policy.schedule === "daily" ? "Daily at 03:00" : "Every 6 hours";
}
