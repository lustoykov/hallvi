// Types for the plain-Node module the application, launchers and tests share.
export interface StateLocation {
  directory: string;
  database: string;
  settings: string;
}
export function adoptLegacyEnvironment(
  env?: Record<string, string | undefined>,
): Record<string, string | undefined>;
export function stateFiles(directory: string): StateLocation;
export function stateLocation(
  parent: string,
  options?: { hidden?: boolean },
): StateLocation;
export function piAccountLocation(home: string): string;
