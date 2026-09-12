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
    /**
     * Every declared writer pauses, so the dump and its live fingerprint
     * describe one moment. Without a writers declaration the dump is taken
     * online by the tool's own snapshot and no live fingerprint is taken;
     * restoration proves its content.
     */
    quiescent: boolean;
  }[];
}

/**
 * One recovery point, described from the recorded data without image or
 * service-name assumptions. What stops is derived from evidence Pi recorded:
 * a service that writes a captured volume through a mount pauses while the
 * files are copied, and so does a service Pi declared a writer of captured
 * data, such as a database client over the network; a state owner with a
 * dump procedure keeps running and dumps during that pause; everything else
 * keeps running. Mounts alone cannot establish the consistency boundary, so
 * a dump whose writers Pi did not declare is taken online, and the plan
 * says so instead of comparing a live fingerprint to it.
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
      writers: volume.writers,
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
  for (const volume of facts.volumes) {
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
    // Declared writers change the data without a mount; they pause too.
    for (const writer of volume.writers ?? []) {
      if (finished.has(writer)) continue;
      if (owners.has(writer))
        throw new Error(
          `Service ${writer} keeps running to dump its database but is declared a writer of ${volume.name}. One service cannot both pause and dump.`,
        );
      writers.add(writer);
    }
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
  // A dump is quiescent when Pi declared its writers (all of which pause),
  // or when nothing that could write it keeps running at all: every service
  // other than a dump owner or a finished one-shot is in the pause set.
  const running = facts.services.filter(
    (service) => !service.completes && !owners.has(service.name),
  );
  const nothingElseRuns = running.every((service) =>
    pauseServices.includes(service.name),
  );
  const dumpsWithEvidence = declared.map(({ writers, ...dump }) => ({
    ...dump,
    quiescent: writers !== undefined || nothingElseRuns,
  }));
  return {
    version: 2,
    pauseServices,
    volumes: copied,
    ...(dumpsWithEvidence.length ? { dumps: dumpsWithEvidence } : {}),
  };
}
