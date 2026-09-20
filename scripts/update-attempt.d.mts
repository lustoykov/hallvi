export type UpdatePhase =
  | "checking"
  | "downloading"
  | "verifying"
  | "installing"
  | "reconnecting"
  | "completed"
  | "failed"
  | "blocked";

export interface UpdateAttempt {
  id: string;
  phase: UpdatePhase;
  message: string;
  startedAt: string;
  updatedAt?: string;
  finishedAt: string | null;
  progress?: number;
  from: { version: string; revision: string } | null;
  to: { version: string; revision: string; notes?: string } | null;
  candidate: { document: string; signature: string; channel: string };
  helper?: { kind: "launchd" | "systemd"; name: string; log: string };
  running?: boolean;
}

export const PHASES: UpdatePhase[];
export const FINISHED: UpdatePhase[];

export class UpdateInProgressError extends Error {}

export function attemptFile(data: string): string;
export function readAttempt(data: string): UpdateAttempt | null;
export function attemptStatus(
  data: string,
  alive: (attempt: UpdateAttempt) => boolean,
): UpdateAttempt | null;
export function claimAttempt(
  data: string,
  alive: (attempt: UpdateAttempt) => boolean,
  attempt: Omit<
    UpdateAttempt,
    "phase" | "startedAt" | "finishedAt" | "message"
  >,
): UpdateAttempt;
export function recordPhase(
  data: string,
  phase: UpdatePhase,
  message: string,
  extra?: Record<string, unknown>,
): UpdateAttempt | null;
export function clearAttempt(data: string): void;
