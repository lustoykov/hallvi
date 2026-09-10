import type { ReleaseFacts } from "./release-facts";

/** Describe data and consumers without image or repository names. */
export function backupCapturePlan(facts: ReleaseFacts) {
  const database = facts.database;
  const services = facts.services
    .map((service) => service.name)
    .filter((name) => name !== database?.service);
  const pauseServices: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name) || !services.includes(name)) return;
    visited.add(name);
    for (const needs of facts.services.find((s) => s.name === name)!.dependsOn)
      visit(needs);
    pauseServices.unshift(name);
  };
  for (const name of services) visit(name);
  // The managed database is captured by its own dump, not as files.
  const volumes = facts.volumes
    .filter((volume) => volume.name !== database?.volume)
    .map(({ name, kind, capture, mounts, sqlite }) => {
      if (kind === "database" && !sqlite && capture !== "quiesced-files")
        throw new Error(
          `Volume ${name} needs a recorded SQLite path or a supported database capture method.`,
        );
      if (
        sqlite &&
        (sqlite.startsWith("/") || sqlite.split("/").includes(".."))
      )
        throw new Error(`SQLite must be inside volume ${name}.`);
      return { name, kind, ...(capture ? { capture } : {}), mounts, sqlite };
    });
  if (!database && !volumes.length)
    throw new Error("No persistent application data is recorded to back up.");
  return {
    version: 1 as const,
    // Pause all application services: database writers need not mount a volume.
    // Network database clients can write without mounting local data.
    pauseServices,
    postgres: database ? database.service : null,
    volumes,
  };
}
