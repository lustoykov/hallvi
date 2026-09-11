import type { ReleaseFacts } from "./release-facts";

export interface BackupCapturePlan {
  version: 2;
  /** Writers of captured files, dependents first; nothing else is touched. */
  pauseServices: string[];
  /** Volumes copied as files while their writers pause. */
  volumes: {
    name: string;
    kind: "files" | "database";
    capture?: "quiesced-files";
    sqlite: string | null;
  }[];
  /** Databases their owners dump while still running. */
  dumps?: {
    volume: string;
    service: string;
    target: string;
    dump: string[];
    restore: string[];
    verify: string[];
  }[];
}

/**
 * One consistent recovery point, described from the recorded data without
 * image or service-name assumptions. What actually needs to stop is derived
 * from the mounts: a service that writes a captured volume pauses while the
 * files are copied; a state owner with a dump procedure keeps running and
 * dumps during that pause; a service that mounts nothing writable, or only
 * reads, keeps running. A stack whose only state is dumped pauses nothing.
 */
export function backupCapturePlan(facts: ReleaseFacts): BackupCapturePlan {
  const dumps = facts.volumes.filter((volume) => volume.capture === "dump");
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
  const owners = new Set(declared.map((dump) => dump.service));
  const copied = facts.volumes
    .filter((volume) => volume.capture !== "dump")
    .map(({ name, kind, capture, sqlite }) => {
      if (kind === "database" && !sqlite && capture !== "quiesced-files")
        throw new Error(
          `Volume ${name} holds a database: record its SQLite path, capture "quiesced-files" when a clean stop leaves it consistent, or a dump procedure run by its owner.`,
        );
      if (
        sqlite &&
        (sqlite.startsWith("/") || sqlite.split("/").includes(".."))
      )
        throw new Error(`SQLite must be inside volume ${name}.`);
      return {
        name,
        kind,
        ...(capture === "quiesced-files" ? { capture } : {}),
        sqlite,
      };
    });
  if (!copied.length && !declared.length)
    throw new Error("No persistent application data is recorded to back up.");
  // Writers: every running service with a read-write mount of a recorded
  // volume. A finished one-shot holds no open writer. A dump owner stays up
  // to dump, so it may write nothing but its own database.
  const finished = new Set(
    facts.services.filter((s) => s.completes).map((s) => s.name),
  );
  const writers = new Set<string>();
  for (const volume of facts.volumes)
    for (const mount of volume.mounts) {
      if (mount.readOnly || finished.has(mount.service)) continue;
      if (owners.has(mount.service)) {
        if (volume.capture === "dump" && volume.owner === mount.service)
          continue;
        throw new Error(
          `Service ${mount.service} keeps running to dump its database but also writes volume ${volume.name}. One service cannot both pause and dump; give ${volume.name} another owner or capture.`,
        );
      }
      writers.add(mount.service);
    }
  // Dependents stop before what they depend on, so a worker can finish with
  // its broker or database still available.
  const pauseServices: string[] = [];
  const visited = new Set<string>();
  const visit = (name: string) => {
    if (visited.has(name) || !writers.has(name)) return;
    visited.add(name);
    for (const needs of facts.services.find((s) => s.name === name)!.dependsOn)
      visit(needs);
    pauseServices.unshift(name);
  };
  for (const service of facts.services) visit(service.name);
  return {
    version: 2,
    pauseServices,
    volumes: copied,
    ...(declared.length ? { dumps: declared } : {}),
  };
}
