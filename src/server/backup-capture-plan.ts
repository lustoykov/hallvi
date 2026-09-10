import type { DeploymentPlan } from "./deployment-types";
import { sharedVolumes } from "./deployment-layout";

/** Describe data and consumers without image or repository names. */
export function backupCapturePlan(plan: DeploymentPlan) {
  const services = ["app", ...(plan.services ?? []).map((s) => s.name)];
  const pauseServices: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name) || !services.includes(name)) return;
    visited.add(name);
    for (const dependency of plan.dependencies ?? [])
      if (dependency.service === name) visit(dependency.needs);
    pauseServices.unshift(name);
  };
  for (const name of services) visit(name);
  const volumes = sharedVolumes(plan).map((volume) => {
    const first = volume.mounts[0];
    if (
      first.sqlite &&
      !first.sqlite.startsWith(first.target.replace(/\/$/, "") + "/")
    )
      throw new Error(`SQLite must be inside volume ${volume.name}.`);
    const sqlite = first.sqlite
      ? first.sqlite.slice(first.target.replace(/\/$/, "").length + 1)
      : null;
    if (
      volume.kind === "database" &&
      !sqlite &&
      volume.capture !== "quiesced-files"
    )
      throw new Error(
        `Volume ${volume.name} needs a recorded SQLite path or a supported database capture method.`,
      );
    if (sqlite && (sqlite.startsWith("/") || sqlite.split("/").includes("..")))
      throw new Error(`SQLite must be inside volume ${volume.name}.`);
    return { ...volume, sqlite };
  });
  if (!plan.postgres && !volumes.length)
    throw new Error("No persistent application data is recorded to back up.");
  return {
    version: 1 as const,
    // Pause all application services: database writers need not mount a volume.
    // Network database clients can write without mounting local data.
    pauseServices,
    postgres: plan.postgres ? "postgres" : null,
    volumes,
  };
}
