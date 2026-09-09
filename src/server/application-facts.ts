// Facts a stable view shows once a capability records them. Each block is
// optional: a view without its facts renders the honest unavailable state,
// so the same components serve the product today and the fuller product
// later. Nothing here is a prototype type; it is the integration contract
// for what each capability must record.

/** A value as observed; freshness is derived from the time, not stored. */
export interface Observed<T> {
  value: T;
  observedAt: string;
}

export interface CoverageItem {
  key: string;
  /** "PostgreSQL 16", "Files · media", "SQLite · kuma.db". */
  label: string;
  /** "consistent database dump", "file archive", "consistent copy". */
  method: string;
  state:
    | "protected"
    | "behind"
    | "failed"
    | "unprotected"
    | "not-covered"
    | "unknown";
  lastSuccessfulAt?: string | null;
  size?: string | null;
  note?: string | null;
}

export interface ProtectionFacts {
  /** Host observation, separate from the age of a stored recovery point. */
  observation?: {
    at: string | null;
    reachable: boolean;
    timerActive: boolean;
    nextAt: string | null;
    running: boolean;
    cleanupPending: boolean;
    retentionFailed: boolean;
  };
  destination: {
    provider: "r2" | "s3";
    bucket: string;
    region: string;
    connectedAt: string;
    /** How the credential is scoped, in words. Never the credential. */
    access: string;
  } | null;
  policy: {
    schedule: string;
    timezone: string;
    retention: string;
    /** The conversation and operation that set the policy. */
    operationId?: string | null;
  } | null;
  coverage: CoverageItem[];
  lastAttempt: {
    at: string;
    outcome: "succeeded" | "failed" | "partial";
    reason?: string | null;
    size?: string | null;
  } | null;
  restoreTest: {
    at: string;
    recoveryPointAt: string;
    verified: string;
    operationId?: string | null;
  } | null;
  history: {
    id: string;
    at: string;
    kind: "backup" | "restore-test" | "policy" | "upload";
    outcome: "succeeded" | "failed" | "partial";
    detail: string;
    operationId?: string | null;
  }[];
}

/**
 * One line a proof states: a check it made, or a limit it has. The label and
 * detail are composed from validated numbers and booleans in the receipt,
 * never from a string the receipt carries, so a receipt can never put text of
 * its own on the page.
 */
export interface BackupNote {
  key: string;
  /** "Archived files", "Application records after boot". */
  label: string;
  /** What was compared and what matched, or what was left untested. */
  detail: string;
}

/**
 * Grafana checks a later proof may record: a dashboard created against the
 * live source, a private authenticated fixture, and the plugins that fixture
 * installs. Counts only. Absent means those checks were not made, which is
 * never the same as passing.
 */
export interface GrafanaFunctionalChecks {
  checkedAt: string | null;
  dashboard: {
    panels: number;
    queriesVerified: number;
    browserRendered?: boolean;
    renderedCharts?: number;
  } | null;
  credential: {
    authenticatedQuery: boolean;
    unauthenticatedRejected: boolean;
    wrongPasswordRejected: boolean;
  } | null;
  plugins: {
    total: number;
    registered: number;
    moduleServed: number;
    behaviourChecked: number;
    items: import("./backup-plugin-evidence").BackupPluginEvidence[];
  } | null;
}

/** One operator proof, as its receipt recorded it and this module read it. */
export interface BackupProof {
  id: string;
  /**
   * `verified` requires a complete receipt whose restore consumed bytes
   * downloaded back from the destination. Anything else is `failed` when the
   * run said so and `incomplete` otherwise, including a run still recorded as
   * running and one that claimed success without the off-host round trip.
   */
  outcome: "verified" | "failed" | "incomplete";
  /** The application revision the proof ran against, when recorded. */
  revision: string | null;
  /** False when the deployment now serves a different revision. */
  revisionCurrent: boolean;
  startedAt: string | null;
  /** When the copied state was taken, when the receipt records that moment. */
  capturedAt: string | null;
  uploadedAt: string | null;
  finishedAt: string | null;
  destination: { provider: "r2"; bucket: string } | null;
  /** The archive as measured, with the checksum the round trip compared. */
  archive: { bytes: number | null; sha256: string } | null;
  /** The restore read bytes downloaded back from the destination. */
  downloadedCopyVerified: boolean;
  /** When bucket visibility was checked. It does not prove current access. */
  privateBucketCheckedAt: string | null;
  /** Cleanup is independent of whether the archived data restored. */
  cleanupNotes: BackupNote[];
  /** How long the source was paused while its state was copied. */
  sourcePauseSeconds: number | null;
  checks: BackupNote[];
  /** What this proof does not show, stated in the view's own words. */
  gaps: BackupNote[];
  grafana: GrafanaFunctionalChecks | null;
}

/**
 * Manual restore proofs, read back from the receipts a proof run writes.
 * Deliberately not `ProtectionFacts`: a proof is a dated test an operator
 * started by hand, not a schedule, a retention policy or a copy being taken
 * now. Nothing here may be rendered as ongoing protection, and a missing,
 * corrupt or mismatched receipt contributes nothing at all.
 */
export interface BackupEvidenceFacts {
  /** Only ever true if a receipt records one. No proof implies a schedule. */
  scheduleConfigured: boolean;
  retentionConfigured: boolean;
  /** Every readable proof for the current deployment, newest first. */
  proofs: BackupProof[];
  /** Receipts rejected as unreadable, invalid or self-inconsistent. */
  unreadable: number;
  /** Readable receipts belonging to an earlier deployment of this app. */
  mismatched: number;
}

export interface Issue {
  id: string;
  title: string;
  /** What the user or their users experience. */
  impact: string;
  detectedAt: string;
  state: "open" | "acknowledged" | "recovered";
  recoveredAt?: string | null;
  evidence: string;
  next: string;
  /** What raised it: a check, a job, a backup or a deployment. */
  source: { kind: "check" | "job" | "backup" | "release" | "host"; id: string };
  operationId?: string | null;
  /** The conversation investigating it, once one exists. */
  conversationId?: string | null;
  unread: boolean;
}

export interface MonitoringFacts {
  collector: {
    state: "running" | "stale" | "not-running";
    lastObservationAt?: string | null;
    hostReachable: boolean | null;
    detail: string;
  };
  checks: {
    id: string;
    name: string;
    kind: "http" | "process" | "disk" | "job" | "backup" | "certificate";
    target: string;
    state: "passing" | "failing" | "unknown";
    lastAt?: string | null;
    detail: string;
  }[];
  resources: {
    cpuPercent: number;
    memoryUsedMb: number;
    memoryTotalMb: number;
    diskUsedGb: number;
    diskTotalGb: number;
    measuredAt: string;
  } | null;
  issues: Issue[];
  /** External providers are an agreed later expansion; in-app is always on. */
  providers: { kind: string; state: "connected" | "failed"; detail: string }[];
}

export interface DomainFacts {
  address: string | null;
  domain: {
    name: string;
    provider: "cloudflare" | "external";
    state: "resolving" | "pending-dns" | "failed";
    detail: string;
    /** A step only the user can do, shown as words. */
    userStep?: string | null;
  } | null;
  tls: {
    state: "valid" | "pending" | "failed" | "not-configured";
    issuer?: string | null;
    expiresAt?: string | null;
    renewal?: string | null;
    detail?: string | null;
  };
  cdn: {
    state: "active" | "not-configured" | "not-useful" | "partial";
    provider?: string | null;
    detail: string;
  };
  routes: { host: string; service: string; port: number; protocol: string }[];
}

/**
 * What can reach this application, as the host provider records it. The
 * executor already creates a firewall with the ports it opens; this is the
 * shape that firewall must be read back into, so the view states exposure
 * from observation rather than from the plan that asked for it.
 */
export interface SecurityFacts {
  firewall: {
    state: "active" | "not-configured" | "unknown";
    provider: string;
    /** The provider's own name for it, so it is findable outside the app. */
    name?: string | null;
    lastCheckedAt?: string | null;
    detail: string;
  };
  /** One entry per inbound rule the provider reports. */
  rules: {
    id: string;
    port: string;
    protocol: string;
    /** The exact sources, as the provider states them. */
    sources: string[];
    /** Those sources in words: "any network", "your network". */
    reach: "internet" | "restricted";
    /** What listens behind it, when the recorded stack says. */
    serves?: string | null;
  }[];
  ssh: {
    state: "key-only" | "password" | "closed" | "unknown";
    detail: string;
    /** Who holds a key, in words. Never a key. */
    holders?: string | null;
  };
  /** Services that are not reachable from outside at all. */
  privateServices: string[];
  /** Provider checks do not necessarily inspect host networking. */
  privateServicesDetail?: string;
}

export interface VariableFacts {
  variables: {
    name: string;
    scope: "build" | "runtime" | "both";
    source: "plan" | "user" | "generated" | "database" | "service";
    secret: boolean;
    updatedAt?: string | null;
    /** A change that has not reached the running processes yet. */
    pendingRestart?: boolean;
    note?: string | null;
  }[];
  /** Values Server Guy still needs, provided in conversation. */
  pending: { name: string; reason: string; operationId?: string | null }[];
}

export interface ReleaseFacts {
  serving: {
    revision: string;
    message: string;
    image: string;
    deployedAt: string;
    verifiedAt: string | null;
  } | null;
  candidate: {
    revision: string;
    message: string;
    author: string;
    pushedAt: string;
    ci: { state: "passed" | "failed" | "running" | "none"; detail: string };
    image?: string | null;
  } | null;
  history: {
    id: string;
    revision: string;
    at: string;
    outcome: "verified" | "failed" | "rolled-back";
    note: string;
    operationId?: string | null;
  }[];
  preparation: {
    dockerfile: "reused" | "generated";
    compose: "reused" | "generated";
    checks: number;
    revision: string;
    detail: string;
  } | null;
}

export interface LogFacts {
  streams: {
    service: string;
    lines: number;
    lastAt: string;
    level?: "ok" | "errors";
  }[];
  retention: string;
  snapshot: { at: string; service: string; lines: string[] } | null;
}

export interface DatabaseFacts {
  measuredAt: string;
  sizeGb: number;
  connections: number;
  growthMbPerWeek: number | null;
  scratch: {
    name: string;
    rows: number;
    from: string;
    until: string;
    operationId?: string | null;
  } | null;
}

export interface StorageFacts {
  volumes: { name: string; sizeGb: number; measuredAt: string }[];
  hostDisk: { usedGb: number; totalGb: number; measuredAt: string } | null;
}

export interface JobRun {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt?: string | null;
  outcome: "succeeded" | "failed" | "timed-out" | "missed" | "running";
  trigger: "schedule" | "run-now";
  revision: string;
  durationSeconds?: number | null;
  output?: string | null;
  operationId?: string | null;
}

export interface JobFacts {
  runs: JobRun[];
  queues: {
    library: string;
    backlog: number | null;
    oldestWaitingSeconds: number | null;
    failedLastHour: number | null;
    observedAt: string | null;
  }[];
}

export interface ApplicationFacts {
  protection?: ProtectionFacts;
  backupSetup?: { connected: boolean };
  /** Manual restore proofs. Independent of `protection`, never a stand-in. */
  backupEvidence?: BackupEvidenceFacts;
  security?: SecurityFacts;
  monitoring?: MonitoringFacts;
  domains?: DomainFacts;
  variables?: VariableFacts;
  releases?: ReleaseFacts;
  logs?: LogFacts;
  database?: DatabaseFacts;
  storage?: StorageFacts;
  jobs?: JobFacts;
}

/**
 * Something a view lets the user start. The product wires each one to a
 * real operation as the capability lands; a view without a handler shows
 * the fact and no control.
 */
export type ViewAction =
  | { type: "run-job"; job: string }
  | { type: "pause-job"; job: string }
  | { type: "resume-job"; job: string }
  | { type: "acknowledge-issue"; issue: string }
  | { type: "investigate-issue"; issue: string }
  | { type: "deploy-candidate"; revision: string }
  | { type: "roll-back"; revision: string }
  | { type: "measure-database" }
  | { type: "refresh-logs"; service?: string }
  | { type: "check-firewall" }
  | { type: "clear-cdn-cache" }
  | { type: "configure-backups" }
  | { type: "run-backup" }
  | { type: "refresh-backups" }
  | { type: "test-restore" }
  | { type: "verify-now" };
