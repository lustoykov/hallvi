// Facts a stable view shows once a capability records them.
//
// This is what is left of a larger contract. Most of its blocks described a
// capability that never wrote one, and the views read them through a
// deployment model the product stopped writing to; a block nothing fills is
// not a contract, it is a promise. What remains is what something actually
// records: Hallvi's own protection, and the two shapes the Domains and
// Monitoring layouts read a slice of.

/**
 * Hallvi's own protection: whether its records and keys are copied off
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
