// Types for the attach/detach tooling's readable parts, which the developer
// dashboard lists.
import type { RetainedMark, RetainedRuntime } from "./retained-state.mjs";

export const ROOT: string;
export interface RetainedApplication {
  directory: string;
  state: string;
  mark: RetainedMark;
  runtime: RetainedRuntime | null;
  attached: boolean;
  backups: string;
}
export function listApplications(): RetainedApplication[];
export function status(): string;
export function copyState(
  state: string,
  into: string,
): Promise<{
  takenAt: string;
  source: string;
  database: {
    path: string;
    schema: number;
    intact: boolean;
    counts: Record<string, number>;
  };
  files: { path: string; sha256: string }[];
}>;
export function snapshot(into: string, names: string[]): Promise<string>;
