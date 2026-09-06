import { Type } from "typebox";

import { getApplicationStatus } from "./operator-view";
import type { ApplicationStatus } from "./types";

// Empty input: the worker supplies the application and Chat from the accepted
// Run, so the model cannot select another application, add filters, or ask for
// a provider refresh. The SDK rejects any additional property before execution.
export const applicationStatusParameters = Type.Object(
  {},
  { additionalProperties: false },
);

// The same public-text bound the former per-Run summary used. An oversized or
// malformed projection is a tool error, never a silently truncated status.
export const MAX_APPLICATION_STATUS_CHARACTERS = 12_000;

/**
 * Reads this application's current saved state for Pi. Every call reads the
 * current records; nothing is cached across Runs. A missing or mismatched
 * application/Chat and a failed storage read throw, so the model receives a
 * tool error rather than an empty successful result. Missing repository
 * evidence is a successful read carrying the existing `not-yet` check.
 */
export function readPiApplicationStatus(
  applicationId: string,
  chatId: string,
): { status: ApplicationStatus; text: string } {
  const status = getApplicationStatus(applicationId, chatId);
  const text = JSON.stringify(status);
  if (text.length > MAX_APPLICATION_STATUS_CHARACTERS)
    throw new Error(
      "The current application status is larger than the supported tool result. Check the application's records in the Operator View.",
    );
  return { status, text };
}
