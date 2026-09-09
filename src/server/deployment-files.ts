import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { piConfigDir } from "./pi-configuration";

export function deploymentPath(id: string) {
  return join(piConfigDir(), "deployments", z.uuid().parse(id));
}
export function deploymentDirectory(record: { id: string }) {
  const directory = deploymentPath(record.id);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  return directory;
}
/** Only after committing cancellation of a definitively uncreated setup. */
export function removeCancelledDeploymentFiles(id: string) {
  rmSync(deploymentPath(id), { recursive: true, force: true });
}
