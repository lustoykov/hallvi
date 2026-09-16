// The launcher is plain Node so that nothing has to be transformed before the
// development command can start. These types let the test that holds it to the
// application's own resolution import it.
export interface DevEnvironment {
  database: string;
  config: string;
  piAccount: string;
  logs: string;
}
export function resolveEnvironment(
  env?: NodeJS.ProcessEnv,
  cwd?: string,
): DevEnvironment;
export function environmentVariables(
  resolved: DevEnvironment,
): Record<string, string>;
export const WORKER_BUSY_EXIT: number;
