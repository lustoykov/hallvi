import type { ReleaseFacts } from "./release-facts";

/**
 * One consistent recovery point, described from the recorded data without
 * image or service-name assumptions: writers pause, state owners with a dump
 * procedure keep running to dump, finished one-shot services stay stopped,
 * and every other recorded volume is copied as files while writers pause.
 */
export function backupCapturePlan(facts: ReleaseFacts) {
  const database = facts.database;
  const dumps = facts.volumes.filter((volume) => volume.capture === "dump");
  const running = new Set([
    ...(database ? [database.service] : []),
    ...dumps.flatMap((volume) => (volume.owner ? [volume.owner] : [])),
  ]);
  const oneShot = facts.services
    .filter((service) => service.completes)
    .map((service) => service.name);
  const services = facts.services
    .map((service) => service.name)
    .filter((name) => !running.has(name) && !oneShot.includes(name));
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
  // The managed database and declared dumps are captured by their owners.
  const volumes = facts.volumes
    .filter(
      (volume) => volume.name !== database?.volume && volume.capture !== "dump",
    )
    .map(({ name, kind, capture, mounts, sqlite }) => {
      if (kind === "database" && !sqlite && capture !== "quiesced-files")
        throw new Error(
          `Volume ${name} holds a database: record its SQLite path, capture "quiesced-files" when a clean stop leaves it consistent, or a dump procedure run by its owner.`,
        );
      if (
        sqlite &&
        (sqlite.startsWith("/") || sqlite.split("/").includes(".."))
      )
        throw new Error(`SQLite must be inside volume ${name}.`);
      return { name, kind, ...(capture ? { capture } : {}), mounts, sqlite };
    });
  const declared = dumps.map((volume) => {
    const mount = volume.mounts.find(
      (item) => item.service === volume.owner && !item.readOnly,
    );
    if (!volume.owner || !volume.procedure || !mount)
      throw new Error(
        `Volume ${volume.name}: a dump needs its owner's read-write mount and a procedure.`,
      );
    return {
      volume: volume.name,
      service: volume.owner,
      target: mount.target,
      ...volume.procedure,
    };
  });
  if (!database && !volumes.length && !declared.length)
    throw new Error("No persistent application data is recorded to back up.");
  return {
    version: 1 as const,
    // Pause all application services: database writers need not mount a volume.
    // Network database clients can write without mounting local data.
    pauseServices,
    postgres: database ? database.service : null,
    ...(database?.volume ? { postgresVolume: database.volume } : {}),
    volumes,
    ...(declared.length ? { dumps: declared } : {}),
    ...(oneShot.length ? { oneShot } : {}),
  };
}
