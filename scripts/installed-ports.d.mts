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

export function remoteAccess(options: {
  user: string;
  address: string;
  name: string;
  ports: InstalledPorts;
}): {
  host: string;
  file: string;
  config: string;
  setup: string;
  connect: string;
  url: string;
};
export function saveInstalledPort(
  settings: string,
  value: string,
): InstalledPorts;
