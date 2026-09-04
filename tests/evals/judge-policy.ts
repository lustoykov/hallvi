import type { SavedCase } from "../dashboard/results.ts";

// A previous prompt's pass is still readable advice, but not current-policy clearance.
export const JUDGE_PROMPT_VERSION = "phase-one-meaning-v2";

export function automaticFailure(record: SavedCase): string | null {
  if (record.outcome !== "checks-passed") return `Automatic outcome: ${record.outcome}.`;
  if (record.error) return "The saved turn contains an error.";
  const failed = Object.entries(record.checks).filter(([, passed]) => !passed).map(([name]) => name);
  return failed.length ? `Failed automatic checks: ${failed.join(", ")}.` : null;
}

export function hasAutomaticEvidence(record: SavedCase): boolean {
  return Boolean(record.input && record.reply && Object.keys(record.checks).length);
}
