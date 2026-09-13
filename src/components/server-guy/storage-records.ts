"use client";

// Storage, built from what Pi recorded.
//
// One question: what is on disk, who owns it, and would it survive the
// container being replaced. The answer to the last one is a check Pi ran, not
// a property of having a volume — a bind mount and a named volume look the
// same until somebody replaces the container.
//
// Backups are a different question and are read from their own subjects. A
// volume that survives a restart has been copied nowhere, and the page that
// implied otherwise was the reason `volume` sits in Overview's checks lane
// rather than its backups lane.

import type { SavedInformation } from "@/server/operator-data";
import {
  currentChecks,
  currentFacts,
  presenceOf,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

import type {
  Check,
  Dated,
  Piece,
  ProtectView,
  Vol,
} from "./backup-prototype/protect-story";
import { protectionFromRecords } from "./backups-records";

/** "4.2 GB" → 4.2. A size Pi wrote in words is still a number to a bar. */
function gigabytes(value: string | null) {
  if (!value) return null;
  const match = value.match(/([\d.]+)\s*(k|m|g|t)?b?/i);
  if (!match) return null;
  const size = Number(match[1]);
  if (!Number.isFinite(size)) return null;
  const scale = { k: 1 / 1e6, m: 1 / 1000, g: 1, t: 1000 } as const;
  return size * (scale[match[2]?.toLowerCase() as keyof typeof scale] ?? 1);
}

export function storageFromRecords({
  records,
  applicationId,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  now: number;
}): ProtectView {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;
  const refs = subjectsOfKind(live, "volume");

  // Who owns a volume is the map's `disk` edge, which is the one thing about
  // a volume the map is entitled to say: it is composition, not state.
  const ownerOf = (id: string) => {
    const edge = map?.edges.find(
      (item) => item.network === "disk" && item.to === id,
    );
    if (!edge) return null;
    return map?.parts.find((part) => part.id === edge.from) ?? null;
  };

  const volumes: Vol[] = [];
  const pieces: Piece[] = [];
  let keptAt: string | null = null;
  let createdAt: string | null = null;
  const later = (a: string | null, b: string) => (!a || b > a ? b : a);

  for (const ref of refs) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    const facts = currentFacts(live, ref);
    const checks = currentChecks(live, ref);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;
    const owner = ownerOf(ref.id);

    const persistence = checks.get("persistence");
    if (
      persistence?.value.status === "passed" &&
      persistence.record.establishedAt
    )
      keptAt = later(keptAt, persistence.record.establishedAt);
    const created = facts.get("created")?.record.establishedAt ?? null;
    if (created && (!createdAt || created < createdAt)) createdAt = created;

    // What is in it, in the fewest words that stay true. Pi's own `holds`
    // is best; failing that the owner names it, because "Grafana's data"
    // reads and a mount path does not.
    const holds = fact("holds");
    const piece: Piece = {
      key: ref.id,
      label:
        holds ?? (owner ? `${owner.name}'s data` : `Everything in ${ref.id}`),
      volume: ref.id,
      // Only a backup plan that says it covers this volume makes it copied.
      method: null,
    };
    pieces.push(piece);
    volumes.push({
      name: ref.id,
      owner: owner?.name ?? "Not recorded",
      ownerName: owner?.id ?? "",
      mount: fact("path") ?? "Not recorded",
      docker: fact("docker"),
      note:
        persistence === undefined
          ? "Nobody has tested whether this survives the container being replaced."
          : persistence.value.status === "failed"
            ? "The data did not survive a container replacement."
            : null,
      sizeGb: gigabytes(fact("size")),
      measuredAt: facts.get("size")?.record.establishedAt ?? null,
      pieces: [piece],
    });
  }

  // What the plan says it covers turns a piece from uncopied into copied.
  const protection = protectionFromRecords(live, now);
  for (const piece of pieces)
    piece.method = protection.covers.get(piece.volume) ?? null;

  const host = subjectsOfKind(live, "host")[0] ?? null;
  const hostFacts = host ? currentFacts(live, host) : null;
  // The reading, not the capacity: `disk` is "40 GB" and never moves.
  const disk = hostFacts?.get("disk-used") ?? null;
  const used = disk
    ? disk.value.value.match(/([\d.]+)\s*\w*\s*(?:of|\/)\s*([\d.]+)/)
    : null;

  return {
    volumes,
    pieces,
    createdAt,
    keptAt,
    disk:
      used && disk?.record.establishedAt
        ? {
            usedGb: Number(used[1]),
            totalGb: Number(used[2]),
            measuredAt: disk.record.establishedAt,
          }
        : null,
    copies: protection.copies,
    schedules: protection.schedules,
    restores: protection.restores,
    checks: protection.checks,
    protection: protection.summary,
  };
}

export type { Check, Dated };
