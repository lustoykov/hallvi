import type { SavedInformation } from "./operator-data";

/**
 * What became of a recorded release.
 *
 * `deployed` means a check proved it started or answered. `failed` means a
 * check proved it did not. `attempted` means neither — something ran and
 * nothing established what came of it, which is its own answer. The
 * Deployment page and the branch watch both read this one rule, so the page
 * can never call a commit running that the watch would deploy again.
 */
export function releaseOutcome(
  record: Pick<SavedInformation, "presentation">,
): "deployed" | "failed" | "attempted" {
  const status = record.presentation?.status;
  const checks = record.presentation?.checks ?? [];
  if (status === "failed" || checks.some((check) => check.status === "failed"))
    return "failed";
  // A release is running because something checked, not because a record was
  // written. `verified` with no check behind it is still Pi's own judgement
  // and counts; a record with neither says only that an attempt happened.
  if (
    status === "verified" ||
    checks.some((check) => check.status === "passed")
  )
    return "deployed";
  return "attempted";
}
