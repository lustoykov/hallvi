export interface InstalledPorts {
  web: number;
  terminal: number;
  privateFirst: number;
  privateLast: number;
}
export function installedPorts(
  env?: Record<string, string | undefined>,
): InstalledPorts;
export function forwardedPorts(ports: InstalledPorts): number[];
