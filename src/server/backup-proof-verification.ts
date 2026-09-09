import { createHash } from "node:crypto";

export function backupSha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyPostgresArchive(original: Buffer, downloaded: Buffer) {
  if (original.subarray(0, 5).toString() !== "PGDMP")
    throw new Error("The backup is not a PostgreSQL custom-format archive.");
  if (
    original.length !== downloaded.length ||
    backupSha256(original) !== backupSha256(downloaded)
  )
    throw new Error("The downloaded backup does not match the source archive.");
}

export function verifyRestoredRows(
  before: Buffer,
  after: Buffer,
  restored: Buffer,
) {
  if (!before.toString().trim())
    throw new Error(
      "An empty database cannot prove recovery of application data.",
    );
  if (!before.equals(after))
    throw new Error("Source data changed during the backup. Repeat the proof.");
  if (!before.equals(restored))
    throw new Error("Restored application rows differ from the source data.");
  return {
    rowCount: before.toString().trim().split("\n").length,
    rowsSha256: backupSha256(before),
  };
}
