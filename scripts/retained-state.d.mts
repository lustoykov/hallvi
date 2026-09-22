// Types for the plain-Node rule the application, the launchers and the
// attach/detach tooling share.
export interface RetainedMark {
  version: number;
  /** The real path of the directory this mark protects. */
  state: string;
  /** The directory name the tooling addresses it by. */
  directory: string;
  application: { id: string; name: string };
  port: number;
  format: { schema: number; pi: string };
  separatedAt: string;
  recoveryCopy?: string;
}
export interface RetainedRuntime {
  runtimeId: string;
  pid: number;
  worktree: string;
  branch: string | null;
  revision: string | null;
  ports: { app: number };
  attachedAt: string;
  node: string;
  stoppedAt?: string;
  outcome?: "forced" | "crashed";
  busy?: number;
  exit?: number | string | null;
}
export const MARK_FILE: string;
export const RUNTIME_FILE: string;
export function readMark(directory: string): RetainedMark | null;
export function readRuntime(directory: string): RetainedRuntime | null;
export function holdRuntime(directory: string): { release: () => void } | null;
export function runtimeHeld(directory: string): boolean;
export function retainedRefusal(
  databasePath: string,
  env?: Record<string, string | undefined>,
): string | null;
export const DETACH_FORCED_EXIT: number;
