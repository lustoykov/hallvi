/**
 * Bounded operator proof, not the scheduled backup product.
 * Uses the existing SSH identity and Wrangler's work-account login; no secrets
 * are accepted as arguments. The local restore container has no network.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import Database from "better-sqlite3";
import { deploymentPlanSchema } from "../src/server/deployment-types";
import {
  backupSha256,
  verifyPostgresArchive,
  verifyRestoredRows,
} from "../src/server/backup-proof-verification";

function run(file: string, args: string[], input?: Buffer | string) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = execFile(
      file,
      args,
      {
        encoding: "buffer",
        maxBuffer: 64 * 1024 * 1024,
        timeout: 180_000,
        killSignal: "SIGKILL",
      },
      (error, stdout) => {
        // Never echo command output: database values and provider tokens can
        // appear in error streams. Record the failed phase instead.
        if (error)
          reject(new Error(`${file} failed or exceeded the proof limit.`));
        else resolve(stdout);
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

async function main() {
  const [applicationIdInput, accountInput, bucketInput, mode] =
    process.argv.slice(2);
  if (mode !== undefined && mode !== "--local-only")
    throw new Error("Unknown proof mode.");
  const localOnly = mode === "--local-only";
  const applicationId = z.uuid().parse(applicationIdInput);
  const account = z
    .string()
    .regex(/^[a-f0-9]{32}$/)
    .parse(accountInput);
  const bucket = z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
    .parse(bucketInput);
  const runtimeDir =
    process.env.SERVER_GUY_CONFIG_DIR ?? join(process.cwd(), ".server-guy");
  const database = new Database(
    process.env.SERVER_GUY_DB_PATH ??
      join(process.cwd(), ".server-guy", "server-guy.db"),
    { readonly: true, fileMustExist: true },
  );
  let row: unknown;
  try {
    row = database
      .prepare("SELECT body FROM deployments WHERE application_id = ?")
      .get(applicationId);
  } finally {
    database.close();
  }
  const body = z.object({ body: z.string() }).parse(row).body;
  const deployment = z
    .object({
      id: z.uuid(),
      status: z.string(),
      address: z.string().nullable(),
      revision: z.string().nullable(),
      plan: deploymentPlanSchema.nullable(),
    })
    .parse(JSON.parse(body));
  if (
    !deployment ||
    deployment.status !== "live" ||
    !deployment.plan?.postgres ||
    !deployment.address ||
    isIP(deployment.address) !== 4 ||
    deployment.plan.volumes?.length ||
    deployment.plan.services?.length
  )
    throw new Error(
      "This proof requires a live PostgreSQL-only application stack.",
    );
  z.uuid().parse(deployment.id);
  const version = z
    .enum(["16", "17", "18"])
    .parse(deployment.plan.postgres.version);
  process.env.CLOUDFLARE_ACCOUNT_ID = account;
  // Database backups and receipts stay in ignored, private controller storage.
  const proofId = randomUUID();
  const directory = join(runtimeDir, "backup-proofs", proofId);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const archivePath = join(directory, "postgres.dump");
  const downloadPath = join(directory, "downloaded.dump");
  const objectKey = `applications/${applicationId}/${proofId}/postgres.dump`;
  const receipt: Record<string, unknown> = {
    proofId,
    applicationId,
    deploymentId: deployment.id,
    revision: deployment.revision,
    startedAt: new Date().toISOString(),
    destination: { provider: "cloudflare-r2", account, bucket, objectKey },
    offHostVerified: false,
    status: "running",
    phase: "preflight",
    scheduleConfigured: false,
    coverage: "Todo PostgreSQL database only",
    restoreDestination:
      "Fresh local PostgreSQL container; no network or published ports",
  };
  function save() {
    const path = join(directory, "receipt.json");
    writeFileSync(`${path}.tmp`, JSON.stringify(receipt, null, 2) + "\n", {
      mode: 0o600,
    });
    renameSync(`${path}.tmp`, path);
  }
  function phase(value: string) {
    receipt.phase = value;
    save();
  }
  const identity = join(runtimeDir, "deployments", deployment.id);
  const sshArgs = [
    "-i",
    join(identity, "client"),
    "-o",
    `UserKnownHostsFile=${join(identity, "known_hosts")}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
    "-o",
    "ConnectTimeout=10",
    `root@${deployment.address}`,
  ];
  const compose = `cd /opt/server-guy/${deployment.id} && docker compose -p sg-${deployment.id.slice(0, 8)} -f compose.json`;
  const source = (args: string[]) =>
    run("ssh", [
      ...sshArgs,
      `${compose} exec -T postgres ${args.map(quote).join(" ")}`,
    ]);
  const sqlArgs = (sql: string) => [
    "psql",
    "-X",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "serverguy",
    "-d",
    "application",
    "-Atc",
    sql,
  ];
  const rowsSql =
    "SELECT row_to_json(t)::text FROM public.todos t ORDER BY t.id";
  const container = `sg-restore-proof-${proofId}`;
  let containerAttempted = false;
  let canaryId: string | undefined;
  save();
  try {
    // Do not generalize this application's row assertion to other databases.
    const tables = await source(
      sqlArgs(
        "SELECT schemaname || '.' || tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY 1",
      ),
    );
    if (tables.toString().trim() !== "public.todos")
      throw new Error(
        "This bounded proof only supports the Todo reference schema.",
      );
    const token = `SG_BACKUP_PROOF_${proofId}`;
    receipt.canary = { token, status: "creating" };
    save();
    const response = await fetch(`http://${deployment.address}/api/todos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: token,
        notes: "Temporary backup restore proof",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 201)
      throw new Error("Could not create the proof todo.");
    const created = z
      .object({
        todo: z.object({
          id: z.uuid(),
          title: z.literal(token),
        }),
      })
      .parse(await response.json());
    canaryId = created.todo.id;
    receipt.canary = { token, id: canaryId, status: "created" };
    save();
    const before = await source(sqlArgs(rowsSql));
    if (!before.toString().trim())
      throw new Error("Todo has no rows to prove recovery.");
    await run("docker", ["info", "--format", "{{.ServerVersion}}"]);
    phase("create-archive");
    receipt.recoveryPointStartedAt = new Date().toISOString();
    const archive = await source([
      "pg_dump",
      "-U",
      "serverguy",
      "-d",
      "application",
      "--format=custom",
      "--no-owner",
      "--no-acl",
    ]);
    verifyPostgresArchive(archive, archive);
    const after = await source(sqlArgs(rowsSql));
    if (!before.equals(after))
      throw new Error("Source data changed during backup. Repeat the proof.");
    writeFileSync(archivePath, archive, { mode: 0o600, flag: "wx" });
    receipt.archive = {
      createdAt: new Date().toISOString(),
      bytes: archive.length,
      sha256: backupSha256(archive),
    };
    let downloaded = archive;
    if (!localOnly) {
      phase("upload");
      await run("npx", [
        "--yes",
        "wrangler@4.130.0",
        "r2",
        "object",
        "put",
        `${bucket}/${objectKey}`,
        "--file",
        archivePath,
        "--remote",
      ]);
      receipt.uploadedAt = new Date().toISOString();
      phase("download-and-verify");
      await run("npx", [
        "--yes",
        "wrangler@4.130.0",
        "r2",
        "object",
        "get",
        `${bucket}/${objectKey}`,
        "--file",
        downloadPath,
        "--remote",
      ]);
      downloaded = readFileSync(downloadPath);
      verifyPostgresArchive(archive, downloaded);
      receipt.downloadVerifiedAt = new Date().toISOString();
      receipt.offHostVerified = true;
    }
    phase("restore");
    // Reuse a matching local major version; pin its immutable image ID below.
    try {
      await run("docker", ["image", "inspect", `postgres:${version}`]);
    } catch {
      await run("docker", ["pull", `postgres:${version}`]);
    }
    const image = (
      await run("docker", [
        "image",
        "inspect",
        `postgres:${version}`,
        "--format",
        "{{.Id}}",
      ])
    )
      .toString()
      .trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(image))
      throw new Error("Cannot identify the restore image.");
    receipt.restoreImage = image;
    containerAttempted = true;
    await run("docker", [
      "run",
      "--detach",
      "--name",
      container,
      "--network",
      "none",
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env",
      "POSTGRES_USER=serverguy",
      "--env",
      "POSTGRES_DB=application",
      "--tmpfs",
      `/var/lib/postgresql${version === "18" ? "" : "/data"}`,
      image,
    ]);
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        await run("docker", [
          "exec",
          container,
          "pg_isready",
          "-U",
          "serverguy",
          "-d",
          "application",
        ]);
        ready = true;
        break;
      } catch {
        await delay(500);
      }
    }
    if (!ready)
      throw new Error("The isolated restore database did not become ready.");
    await run(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "--exit-on-error",
        "--no-owner",
        "--no-acl",
        "-U",
        "serverguy",
        "-d",
        "application",
      ],
      downloaded,
    );
    const restored = await run("docker", [
      "exec",
      container,
      ...sqlArgs(rowsSql),
    ]);
    receipt.rowVerification = verifyRestoredRows(before, after, restored);
    receipt.restoreVerifiedAt = new Date().toISOString();
    receipt.status = localOnly ? "verified-local-only" : "verified";
    phase("complete");
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error instanceof Error ? error.message : "Proof failed.";
    throw error;
  } finally {
    if (canaryId !== undefined) {
      try {
        const response = await fetch(
          `http://${deployment.address}/api/todos/${canaryId}`,
          {
            method: "DELETE",
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (response.status !== 204) throw new Error("Canary cleanup failed.");
        receipt.canaryRemoved = true;
      } catch {
        receipt.canaryRemoved = false;
        receipt.status = "failed";
      }
    }
    if (containerAttempted) {
      try {
        await run("docker", ["rm", "--force", "--volumes", container]);
        receipt.restoreTargetRemoved = true;
      } catch {
        receipt.restoreTargetRemoved = false;
        receipt.status = "failed";
        receipt.cleanupError = `Inspect and remove only ${container}.`;
      }
    }
    receipt.finishedAt = new Date().toISOString();
    save();
    console.log(`Proof receipt: ${join(directory, "receipt.json")}`);
  }
  if (!["verified", "verified-local-only"].includes(String(receipt.status)))
    throw new Error("Restore cleanup requires attention.");
  console.log(
    localOnly
      ? "Local Todo restore verified. Off-host backup has NOT been verified."
      : "Verified R2 round trip and isolated Todo row recovery. No schedule configured.",
  );
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Backup proof failed.",
  );
  process.exitCode = 1;
});
