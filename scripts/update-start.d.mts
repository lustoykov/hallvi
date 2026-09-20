import type { UpdateAttempt } from "./update-attempt.mjs";
import type { ReleaseCandidate } from "./release-source.mjs";

export const CHECK_INTERVAL_MS: number;

export interface ReleaseLook {
  checkedAt: string;
  candidate: ReleaseCandidate | null;
  error: string | null;
}

export interface ReleaseViewValue {
  installed:
    | {
        kind: "installed";
        version: string;
        revision: string;
        platform: string | null;
      }
    | {
        kind: "development";
        version: string | null;
        revision: string | null;
        reason: string;
      };
  machine: string;
  channel: string;
  ownKey: boolean;
  available: {
    version: string;
    revision: string;
    notes: string;
    releasedAt: string;
    size: number | null;
    blocked: string | null;
  } | null;
  checkedAt: string | null;
  checkError: string | null;
  attempt: UpdateAttempt | null;
}

export function checkForRelease(
  data: string,
  options?: { force?: boolean; env?: NodeJS.ProcessEnv },
): Promise<ReleaseLook>;
/** Only the manifest is read, so a bare manifest is enough to ask. */
export function blockedReason(
  program: string,
  candidate: Pick<ReleaseCandidate, "manifest">,
): string | null;
export function releaseView(options: {
  program: string;
  data: string;
  check?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<ReleaseViewValue>;
export function startUpdate(options: {
  program: string;
  data: string;
  env?: NodeJS.ProcessEnv;
}): Promise<UpdateAttempt>;
export function dismissUpdate(data: string): void;
export function currentAttempt(data: string): UpdateAttempt | null;

export declare function checkForReleaseIfDue(options?: {
  program?: string;
  data?: string;
  home?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  checkedAt: string;
  candidate: unknown;
  error: string | null;
} | null>;
