import type { UpdateAttempt } from "./update-attempt.mjs";

export const HELPER_LABEL: string;
export const HELPER_UNIT: string;

export interface UpdateHelper {
  kind: "launchd" | "systemd";
  name: string;
  log: string;
}

export function helperAlive(attempt: UpdateAttempt | null): boolean;
export function helperTarget(options: {
  data: string;
  attempt: string;
}): UpdateHelper;
export function startHelper(options: {
  data: string;
  program: string;
  attempt: string;
}): UpdateHelper & { staging: string };
export function retireHelper(): void;
