"use client";

// The Database destination, built from what Pi recorded.
//
// A database earns its own subject because a volume is where bytes survive a
// restart and an engine that answers queries is a different thing. A SQLite
// file is both: a `database` whose `path` sits inside a `volume`, joined by
// the map's `disk` edge, and each is separately observable — the file can
// persist while the engine refuses to open it.
//
// The three lanes never borrow from one another. A passing health check is
// not a copy; a copy is not a restore. That is the whole point of drawing
// them as three lanes rather than one status.

import type { SavedInformation } from "@/server/operator-data";
import {
  currentChecks,
  currentFacts,
  freshnessOf,
  presenceOf,
  seriesFor,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

import { protectionFromRecords } from "./backups-records";
import type { DataStore, DataView, Mark } from "./data-prototype/data-story";

export function databaseFromRecords({
  records,
  applicationId,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  now: number;
}): DataView {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;
  const ref = subjectsOfKind(live, "database")[0] ?? null;
  const protection = protectionFromRecords(live, now);
  const marks: Mark[] = [];

  let database: DataStore | null = null;
  let tone: DataView["tone"] = "planned";

  if (ref) {
    const presence = presenceOf(live, ref);
    const facts = currentFacts(live, ref);
    const checks = currentChecks(live, ref);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;

    // Who owns it: the map's edge into this database, else what Pi said.
    const edge = map?.edges.find((item) => item.to === ref.id);
    const owner = edge
      ? map?.parts.find((part) => part.id === edge.from)
      : undefined;

    // Where the bytes are. A path inside a volume names both.
    const path = fact("path");
    const disk = map?.edges.find(
      (item) => item.network === "disk" && item.from === ref.id,
    );
    const volume = disk
      ? map?.parts.find((part) => part.id === disk.to)
      : undefined;

    const engine = (fact("engine") ?? "").toLowerCase();
    const answering = checks.get("answering");
    const version = fact("version");

    database =
      presence.known && presence.presence === "absent"
        ? null
        : {
            kind: engine.includes("sqlite") ? "sqlite" : "postgres",
            label: [fact("engine") ?? "The database", version]
              .filter(Boolean)
              .join(" "),
            owner: owner?.name ?? fact("owner") ?? "The application",
            ownerName: owner?.id ?? "",
            file: path,
            volume: volume
              ? {
                  name: volume.id,
                  docker: null,
                  mount:
                    currentFacts(live, { kind: "volume", id: volume.id }).get(
                      "path",
                    )?.value.value ?? "",
                }
              : null,
            probe: answering
              ? {
                  name: answering.value.label,
                  probe: answering.value.detail ?? answering.value.label,
                  inside: true,
                  at: answering.record.establishedAt,
                }
              : null,
            firstFailure:
              answering?.value.status === "failed" &&
              answering.record.establishedAt
                ? {
                    at: answering.record.establishedAt,
                    detail: answering.value.detail ?? answering.record.title,
                  }
                : null,
          };

    // The health lane is the whole series, not just the newest: "when was it
    // last known good" is a question about history.
    for (const { record, withdrawn } of seriesFor(live, ref)) {
      if (withdrawn || !record.establishedAt) continue;
      for (const item of record.presentation?.checks ?? []) {
        if (item.key !== "answering") continue;
        marks.push({
          id: `health:${record.id}`,
          lane: "health",
          at: record.establishedAt,
          tone: item.status === "failed" ? "fail" : "pass",
          title: item.label,
          detail: item.detail ?? record.title,
        });
      }
    }

    tone =
      answering?.value.status === "failed"
        ? "failed"
        : answering &&
            freshnessOf(answering.value, answering.record, now).kind === "fresh"
          ? "verified"
          : answering
            ? "stale"
            : "planned";
  }

  for (const copy of protection.copies)
    marks.push({
      id: `copies:${copy.id}`,
      lane: "copies",
      at: copy.at,
      tone: "pass",
      title: "Off-host copy",
      detail: copy.detail,
    });
  for (const schedule of protection.schedules)
    marks.push({
      id: `schedule:${schedule.id}`,
      lane: "copies",
      at: schedule.at,
      tone: "set",
      title: "Backups set up",
      detail: schedule.detail,
    });
  for (const restore of protection.restores)
    marks.push({
      id: `restores:${restore.id}`,
      lane: "restores",
      at: restore.at,
      tone: "pass",
      title: "Restore test",
      detail: restore.detail,
    });

  return {
    tone,
    database,
    marks: marks.sort((a, b) => a.at.localeCompare(b.at)),
    newestCopyAt: protection.summary.backup?.at ?? null,
    protection: protection.summary,
  };
}

/** Whether anything at all names a database, for the empty state. */
export function databaseAssessed(records: SavedInformation[]) {
  return (
    subjectsOfKind(
      records.filter((record) => !record.retiredAt),
      "database",
    ).length > 0
  );
}
