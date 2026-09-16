// Facts a stable view shows once a capability records them.
//
// This is what is left of a larger contract. Most of its blocks described a
// capability that never wrote one, and the views read them through a
// deployment model the product stopped writing to; a block nothing fills is
// not a contract, it is a promise. What remains is what something actually
// records: Server Guy's own protection, and the two shapes the Domains and
// Monitoring layouts read a slice of.

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
 * Server Guy's own protection: whether its records and keys are copied off
 * this machine, and whether the owner holds what opens those copies. It is
 * not application-scoped — every application's Backups view states the same
 * controller fact.
 */
export interface ControllerProtectionFacts {
  connected: boolean;
  state: "unprotected" | "copied" | "recoverable" | "failing";
  bucket: string | null;
  host: string | null;
  keep: number;
  lastCopyAt: string | null;
  nextCopyBy: string | null;
  kitConfirmedAt: string | null;
  /** A kit exists, so at least one copy has reached storage. */
  kitReady: boolean;
  copies: Array<{
    id: string;
    at: string;
    outcome: "succeeded" | "failed" | "skipped";
    reason: string | null;
    size: string | null;
  }>;
  retentionFailed: boolean;
}

/**
 * The facts an application page is handed. Only the controller's own
 * protection is filled today; a page without its facts renders the honest
 * unavailable state rather than an invented one.
 */
export interface ApplicationFacts {
  controllerProtection?: ControllerProtectionFacts;
}
