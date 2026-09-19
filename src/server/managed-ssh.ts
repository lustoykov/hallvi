import type { OperatorSettings } from "./operator-data";

/** Shared identity and host verification; callers own the session lifecycle. */
export function managedSshOptions(host: NonNullable<OperatorSettings["host"]>) {
  return [
    "-F",
    "/dev/null",
    "-i",
    host.privateKeyPath,
    "-p",
    String(host.port),
    "-o",
    `UserKnownHostsFile=${host.knownHostsPath}`,
    "-o",
    "StrictHostKeyChecking=yes",
    "-o",
    "BatchMode=yes",
    "-o",
    "IdentitiesOnly=yes",
  ];
}
