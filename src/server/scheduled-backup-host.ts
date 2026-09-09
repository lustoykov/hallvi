import { z } from "zod";
import { setTimeout as delay } from "node:timers/promises";
import type { DeploymentRecord } from "./deployment-types";
import { deploymentSsh, shellQuote } from "./deployment-ssh";
import { backupSnapshotSchema } from "./scheduled-backup-types";
import {
  configuredBackupIds,
  readBackupPolicy,
  readBackupSnapshot,
  saveBackupSnapshot,
} from "./scheduled-backup-store";

export function backupHostPaths(id: string) {
  z.uuid().parse(id);
  const root = `/opt/server-guy/backups/${id}`;
  return {
    root,
    config: `${root}/config.json`,
    python: `${root}/venv/bin/python`,
    runner: `${root}/runner.py`,
    unit: `server-guy-backup-${id}`,
  };
}
export async function refreshScheduledBackups(
  record: DeploymentRecord,
  signal?: AbortSignal,
) {
  if (!readBackupPolicy(record))
    throw new Error("No backup schedule is configured for this deployment.");
  const paths = backupHostPaths(record.id);
  const previous = readBackupSnapshot(record);
  const at = new Date().toISOString();
  try {
    const script = `import json,subprocess\np=${JSON.stringify(paths)}\ndef call(args):\n r=subprocess.run(args,capture_output=True,text=True,timeout=15)\n return r.returncode,r.stdout.strip()\ncode,body=call([p['python'],p['runner'],p['config'],'--status'])\nif code: raise SystemExit(1)\ns=json.loads(body)\ns['timerActive']=call(['systemctl','is-active',p['unit']+'.timer'])[1]=='active' and call(['systemctl','is-enabled',p['unit']+'.timer'])[1] in ['enabled','enabled-runtime']\ns['running']=call(['systemctl','is-active',p['unit']+'.service'])[1] in ['active','activating','deactivating'] or call(['systemctl','is-active','server-guy-restore-'+${JSON.stringify(record.id)}+'.service'])[1] in ['active','activating','deactivating']\ns['next']=call(['systemctl','show',p['unit']+'.timer','--property=NextElapseUSecRealtime','--value','--timestamp=unix'])[1]\nprint(json.dumps(s))`;
    const raw = JSON.parse(
      await deploymentSsh(record, `python3 -c ${shellQuote(script)}`, {
        signal,
      }),
    );
    const next =
      typeof raw.next === "string"
        ? raw.next.startsWith("@")
          ? Number(raw.next.slice(1)) * 1000
          : Date.parse(raw.next)
        : NaN;
    const snapshot = backupSnapshotSchema.parse({
      ...raw,
      observedAt: at,
      checkedAt: at,
      reachable: true,
      nextAt: Number.isFinite(next) ? new Date(next).toISOString() : null,
    });
    if (
      snapshot.applicationId !== record.applicationId ||
      snapshot.deploymentId !== record.id ||
      snapshot.runs.some(
        (run) =>
          run.applicationId !== record.applicationId ||
          run.deploymentId !== record.id,
      )
    )
      throw new Error("Backup status belongs to a different application.");
    saveBackupSnapshot(snapshot);
    return snapshot;
  } catch {
    const snapshot = previous
      ? { ...previous, checkedAt: at, reachable: false }
      : {
          version: 1 as const,
          applicationId: record.applicationId,
          deploymentId: record.id,
          observedAt: at,
          checkedAt: at,
          reachable: false,
          timerActive: false,
          nextAt: null,
          running: false,
          cleanupPending: false,
          runs: [],
        };
    saveBackupSnapshot(snapshot);
    return snapshot;
  }
}

/** Observe host timers, which run independently of this worker. */
export async function runBackupObservationWorker(signal: AbortSignal) {
  const { getDeployment } = await import("./deployment-store");
  while (!signal.aborted) {
    for (const id of configuredBackupIds()) {
      if (signal.aborted) break;
      const record = getDeployment(id);
      if (record?.status === "live" && readBackupPolicy(record))
        await refreshScheduledBackups(record, signal).catch(() => undefined);
    }
    await delay(30_000, undefined, { signal }).catch(() => undefined);
  }
}
