import { execFile } from "node:child_process";
import { isIP } from "node:net";
import { join } from "node:path";
import { z } from "zod";
import { deploymentPath } from "./deployment-files";
import type { DeploymentRecord } from "./deployment-types";

export const shellQuote = (value: string) =>
  `'${value.replaceAll("'", "'\\''")}'`;
export function deploymentLock(id: string, command: string) {
  z.uuid().parse(id);
  return `flock -n /run/lock/server-guy-${id}.lock sh -c ${shellQuote(command)}`;
}

/** Output is private to the executor; errors never include SSH or app data. */
export function deploymentSsh(
  record: DeploymentRecord,
  command: string,
  options: {
    input?: Buffer | string;
    timeout?: number;
    signal?: AbortSignal;
  } = {},
) {
  if (!record.address || isIP(record.address) !== 4)
    throw new Error("A verified host address is required.");
  const directory = deploymentPath(record.id);
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "ssh",
      [
        "-i",
        join(directory, "client"),
        "-o",
        `UserKnownHostsFile=${join(directory, "known_hosts")}`,
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        "BatchMode=yes",
        "-o",
        "IdentitiesOnly=yes",
        "-o",
        "ConnectTimeout=10",
        `root@${record.address}`,
        command,
      ],
      {
        timeout: options.timeout ?? 30000,
        signal: options.signal,
        maxBuffer: 2 * 1024 * 1024,
      },
      (error, stdout) =>
        error
          ? reject(
              new Error(
                "The host backup command did not complete. Refresh its status before retrying.",
              ),
            )
          : resolve(stdout),
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input);
  });
}
