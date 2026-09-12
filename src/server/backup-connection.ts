import {
  chmodSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { piConfigDir } from "./pi-configuration";
import { backupPolicySchema } from "./scheduled-backup-types";
const destinationSchema = z
  .object({
    provider: z.enum(["r2", "s3"]),
    endpoint: z.string().url(),
    bucket: backupPolicySchema.shape.bucket,
    region: backupPolicySchema.shape.region,
    credentialFile: z.string().regex(/^[a-z0-9-]+\.json$/),
  })
  .superRefine((d, ctx) => {
    const url = new URL(d.endpoint);
    const host =
      d.provider === "r2"
        ? /^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/
        : /^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/;
    if (
      url.protocol !== "https:" ||
      !host.test(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      ctx.addIssue({
        code: "custom",
        message: "Use the provider's HTTPS object-storage endpoint.",
      });
  });
const credentialSchema = z.object({
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(32).max(128),
});
function privateJson(file: string) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size > 8192 ||
    (stat.mode & 0o077) !== 0
  )
    throw new Error("Backup access must be stored in a private regular file.");
  return JSON.parse(readFileSync(file, "utf8"));
}
export function saveBackupDestination(input: {
  provider: "r2" | "s3";
  endpoint: string;
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}) {
  const destination = destinationSchema.parse({
    provider: input.provider,
    endpoint: input.endpoint,
    bucket: input.bucket,
    region: input.region,
    credentialFile: "default-credentials.json",
  });
  const credentials = credentialSchema.parse({
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
  });
  const root = join(piConfigDir(), "backup-destinations");
  mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const [file, value] of [
    [destination.credentialFile, credentials],
    ["default.json", destination],
  ] as const) {
    writeFileSync(join(root, file), JSON.stringify(value), { mode: 0o600 });
    chmodSync(join(root, file), 0o600);
  }
  return backupDestination();
}

/** What Settings may show about the destination; never its key. */
export function backupDestination() {
  try {
    const root = join(piConfigDir(), "backup-destinations");
    const destination = destinationSchema.parse(
      privateJson(join(root, "default.json")),
    );
    credentialSchema.parse(privateJson(join(root, destination.credentialFile)));
    return {
      connected: true as const,
      provider: destination.provider,
      bucket: destination.bucket,
      host: new URL(destination.endpoint).hostname,
    };
  } catch {
    return { connected: false as const };
  }
}
