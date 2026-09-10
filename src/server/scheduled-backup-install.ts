import { currentFacts } from "./release-facts";
import { backupCapturePlan } from "./backup-capture-plan";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { DeploymentRecord } from "./deployment-types";
import { piConfigDir } from "./pi-configuration";
import { deploymentLock, deploymentSsh, shellQuote } from "./deployment-ssh";
import { writeTar } from "./tar";
import {
  backupPolicySchema,
  scheduleCalendar,
  type BackupPolicy,
} from "./scheduled-backup-types";
import {
  backupHostPaths,
  refreshScheduledBackups,
} from "./scheduled-backup-host";
import { saveBackupPolicy } from "./scheduled-backup-store";

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
export function backupKind(record: DeploymentRecord): BackupPolicy["kind"] {
  const facts = currentFacts(record);
  if (record.status !== "live" || !facts || !record.revision)
    throw new Error(
      "A live deployment with recorded configuration is required.",
    );
  backupCapturePlan(facts);
  return "stack";
}
/** Public capability facts contain no endpoint or credential material. */
export function backupSetupFor(record: DeploymentRecord | null) {
  if (!record) return undefined;
  try {
    backupKind(record);
  } catch {
    return undefined;
  }
  let connected = false;
  try {
    const root = join(piConfigDir(), "backup-destinations");
    const destination = destinationSchema.parse(
      privateJson(join(root, "default.json")),
    );
    credentialSchema.parse(privateJson(join(root, destination.credentialFile)));
    connected = true;
  } catch {
    /* The page explains the missing connection. */
  }
  return { connected };
}
export function backupUnits(policy: BackupPolicy) {
  const p = backupHostPaths(policy.deploymentId);
  return {
    service: `[Unit]\nDescription=Server Guy verified off-host backup\nAfter=docker.service network-online.target\nWants=network-online.target\nRequires=docker.service\n\n[Service]\nType=oneshot\nUMask=0077\nExecStart=${p.python} ${p.runner} ${p.config}\nExecStopPost=${p.python} ${p.runner} ${p.config} --recover\nTimeoutStartSec=20min\nTimeoutStopSec=3min\nKillMode=control-group\n`,
    timer: `[Unit]\nDescription=Server Guy scheduled backup\n\n[Timer]\nOnCalendar=${scheduleCalendar(policy)}\nPersistent=true\nRandomizedDelaySec=30\nUnit=${p.unit}.service\n\n[Install]\nWantedBy=timers.target\n`,
  };
}

/** Configure the host using previously connected private storage access. */
export async function installScheduledBackups(
  record: DeploymentRecord,
  selection: {
    schedule: BackupPolicy["schedule"];
    keep: number;
    operationId?: string;
  },
) {
  const kind = backupKind(record);
  const facts = currentFacts(record)!;
  const capture = backupCapturePlan(facts);
  let destination: z.infer<typeof destinationSchema>;
  let credentials: z.infer<typeof credentialSchema>;
  try {
    const root = join(piConfigDir(), "backup-destinations");
    destination = destinationSchema.parse(
      privateJson(join(root, "default.json")),
    );
    credentials = credentialSchema.parse(
      privateJson(join(root, destination.credentialFile)),
    );
  } catch {
    throw new Error(
      "Connect private R2 or S3 backup access before configuring a schedule.",
    );
  }
  const policy = backupPolicySchema.parse({
    version: 1,
    applicationId: record.applicationId,
    deploymentId: record.id,
    revision: record.revision,
    kind,
    data: {
      postgres: Boolean(facts.database),
      fileDatabases: capture.volumes.some(
        (v) =>
          v.kind === "database" && v.capture === "quiesced-files" && !v.sqlite,
      ),
      sqlite: capture.volumes.some((v) => v.sqlite !== null),
    },
    provider: destination.provider,
    bucket: destination.bucket,
    region: destination.region,
    schedule: selection.schedule,
    timezone: "Europe/Sofia",
    keep: selection.keep,
    configuredAt: new Date().toISOString(),
    operationId: selection.operationId ?? null,
  });
  const p = backupHostPaths(record.id);
  // Older deployments predate bundle receipts. Pin the observed configuration
  // for installation; the runner also checks the live revision before capture.
  const composeHash =
    record.bundleHashes?.["compose.json"] ??
    (
      await deploymentSsh(
        record,
        `sha256sum /opt/server-guy/${record.id}/compose.json`,
      )
    ).split(/\s+/)[0];
  if (!/^[a-f0-9]{64}$/.test(composeHash))
    throw new Error("The host configuration could not be identified.");
  const stage = `/var/lib/server-guy/backup-install/${randomUUID()}`;
  const config = {
    version: 1,
    applicationId: policy.applicationId,
    deploymentId: policy.deploymentId,
    revision: policy.revision,
    kind,
    capture,
    composeSha256: composeHash,
    endpoint: destination.endpoint,
    region: destination.region,
    bucket: destination.bucket,
    prefix: `scheduled/${record.applicationId}/${record.id}/`,
    credentialsFile: `${p.root}/credentials.json`,
    keep: policy.keep,
    schedule: scheduleCalendar(policy),
    timezone: policy.timezone,
  };
  const source = join(process.cwd(), "scripts", "scheduled-backups");
  const files = readdirSync(source)
    .filter((name) => /^[a-z_]+\.py$/.test(name))
    .map((name) => ({
      path: name,
      content: readFileSync(join(source, name)),
      mode: 0o600,
    }));
  if (!files.some((file) => file.path === "runner.py"))
    throw new Error(
      "The host backup runner is not installed in this controller.",
    );
  const units = backupUnits(policy);
  const archive = await writeTar([
    ...files,
    {
      path: "capture_sqlite_stack.py",
      content: readFileSync(
        join(process.cwd(), "scripts/backup-proof/capture-sqlite-stack.py"),
      ),
      mode: 0o600,
    },
    {
      path: "policy.json",
      content: Buffer.from(JSON.stringify(policy)),
      mode: 0o600,
    },
    {
      path: "config.json",
      content: Buffer.from(JSON.stringify(config)),
      mode: 0o600,
    },
    {
      path: "credentials.json",
      content: Buffer.from(JSON.stringify(credentials)),
      mode: 0o600,
    },
    {
      path: `${p.unit}.service`,
      content: Buffer.from(units.service),
      mode: 0o644,
    },
    { path: `${p.unit}.timer`, content: Buffer.from(units.timer), mode: 0o644 },
  ]);
  // Stage privately before taking the shared source-mutation lock. Nothing is
  // enabled until the runner, credential and systemd unit files are in place.
  await deploymentSsh(
    record,
    `umask 077; mkdir -p ${stage}; tar -xf - -C ${stage}`,
    { input: archive },
  );
  const destinations = [
    ...files.map((file) => `${p.root}/${file.path}`),
    `${p.root}/capture_sqlite_stack.py`,
    `${p.root}/credentials.json`,
    p.config,
    `${p.root}/policy.json`,
    `/etc/systemd/system/${p.unit}.service`,
    `/etc/systemd/system/${p.unit}.timer`,
  ];
  const install = `set -eu
umask 077
trap 'rm -rf ${stage}' EXIT
command -v flock >/dev/null
if ! python3 -c 'import venv,ensurepip' >/dev/null 2>&1; then apt-get update -qq >/dev/null; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq python3-venv >/dev/null; fi
mkdir -p ${p.root}
if [ ! -x ${p.python} ]; then python3 -m venv ${p.root}/venv; fi
${p.root}/venv/bin/pip -q install boto3==1.43.90
${deploymentLock(
  record.id,
  `set -eu
[ "$(sha256sum /opt/server-guy/${record.id}/compose.json | cut -d ' ' -f1)" = ${shellQuote(composeHash)} ]
mkdir -p ${stage}/previous
timer_active=0; systemctl is-active --quiet ${p.unit}.timer && timer_active=1
timer_enabled=0; systemctl is-enabled --quiet ${p.unit}.timer 2>/dev/null && timer_enabled=1
${destinations.map((file, i) => `[ ! -e ${file} ] || cp -p ${file} ${stage}/previous/${i}`).join("\n")}
rollback() {
  code=$?
  trap - EXIT
  if [ "$code" != 0 ]; then
    systemctl stop ${p.unit}.timer 2>/dev/null || true
    ${destinations.map((file, i) => `if [ -e ${stage}/previous/${i} ]; then cp -p ${stage}/previous/${i} ${file}; else rm -f ${file}; fi`).join("\n    ")}
    systemctl daemon-reload
    if [ "$timer_enabled" = 1 ]; then systemctl enable ${p.unit}.timer >/dev/null; else systemctl disable ${p.unit}.timer 2>/dev/null || true; fi
    if [ "$timer_active" = 1 ]; then systemctl start ${p.unit}.timer; fi
  fi
  exit "$code"
}
trap rollback EXIT
systemctl stop ${p.unit}.timer 2>/dev/null || true
cp ${stage}/*.py ${p.root}/
install -m 600 ${stage}/credentials.json ${p.root}/credentials.json
install -m 600 ${stage}/config.json ${p.config}
install -m 644 ${stage}/${p.unit}.service /etc/systemd/system/${p.unit}.service
install -m 644 ${stage}/${p.unit}.timer /etc/systemd/system/${p.unit}.timer
systemd-analyze verify /etc/systemd/system/${p.unit}.service /etc/systemd/system/${p.unit}.timer
systemctl daemon-reload
systemctl enable --now ${p.unit}.timer >/dev/null
systemctl is-active --quiet ${p.unit}.timer
install -m 600 ${stage}/policy.json ${p.root}/policy.json`,
)}
`;
  try {
    await deploymentSsh(record, install, { timeout: 8 * 60_000 });
  } catch (error) {
    // A lost SSH response can follow a completed installation. Read the
    // exact committed policy before deciding whether a retry is needed.
    let installed = false;
    try {
      const remote = backupPolicySchema.parse(
        JSON.parse(await deploymentSsh(record, `cat ${p.root}/policy.json`)),
      );
      installed = JSON.stringify(remote) === JSON.stringify(policy);
    } catch {
      /* The original failure is more useful than reconciliation. */
    }
    if (!installed) throw error;
  }
  saveBackupPolicy(policy);
  const snapshot = await refreshScheduledBackups(record);
  if (!snapshot.reachable || !snapshot.timerActive)
    throw new Error(
      "The schedule was installed, but its host status could not be verified. Refresh before retrying.",
    );
  return {
    evidence: `Configured ${policy.schedule} backups on the application host; keep the latest ${policy.keep} successful scheduled copies. Backup and restore verification are recorded separately in Backups.`,
    policy,
  };
}
