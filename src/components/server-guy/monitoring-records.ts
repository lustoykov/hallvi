"use client";

// Monitoring, built from what Pi recorded.
//
// The distinction this page exists to make, and the reason it cannot simply
// list green checks: **a check that ran once and passed is not monitoring**.
// It says something was true at a moment. Monitoring is the claim that you
// would hear about it if it stopped being true, and only a `monitor` subject
// can make that claim.
//
// So a station whose last check passed an hour ago, with nothing watching,
// reads "looked at once, not watched" — not "healthy". A page whose whole job
// is to say whether you would be told about a problem must never imply you
// would be.

import type { Ref, SavedInformation } from "@/server/operator-data";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  presenceOf,
  seriesFor,
  subjectsOfKind,
  topologyOf,
  type SubjectKindOf,
} from "@/server/record-projection";

import type {
  Look,
  TunerView,
  Unwatched,
  Watcher,
} from "./signal-prototype/signal-story";

/** Map part kinds to the subject kinds their records live under. */
const subjects: Record<string, SubjectKindOf[]> = {
  host: ["host"],
  web: ["process"],
  private: ["process"],
  volume: ["volume"],
  gate: ["door", "access"],
  tls: ["certificate"],
  monitor: ["monitor"],
};

export function monitoringFromRecords({
  records,
  applicationId,
  applicationName,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
}): TunerView {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;

  // A station exists for a part that has records of its own. A shape nobody
  // has looked at is not a station with nothing on it — it is a gap, and it
  // is drawn as one below.
  const stations: { part: string; ref: Ref }[] = [];
  for (const part of map?.parts ?? []) {
    for (const kind of subjects[part.kind] ?? []) {
      const ref: Ref = { kind, id: part.id };
      if (presenceOf(live, ref).known) {
        stations.push({ part: part.id, ref });
        break;
      }
    }
  }
  // Subjects Pi stated that the map never drew still deserve a station: the
  // map is composition and can lag behind what has been observed.
  for (const kind of ["host", "process", "volume", "database"] as const)
    for (const ref of subjectsOfKind(live, kind))
      if (!stations.some((station) => station.part === ref.id))
        stations.push({ part: ref.id, ref });

  const looks: Look[] = [];
  let lastCheckAt: string | null = null;

  for (const station of stations)
    for (const [key, held] of currentChecks(live, station.ref)) {
      const read = checkAsNow(held.value, held.record, now);
      const at = held.record.establishedAt;
      if (at && (!lastCheckAt || at > lastCheckAt)) lastCheckAt = at;
      looks.push({
        id: `${station.part}:${key}`,
        part: station.part,
        name: held.value.label,
        short: held.value.label,
        // What was checked, when Pi said. Falling back to the label printed
        // the same words twice, one above the other.
        how: held.value.detail ?? "No detail was recorded.",
        kind: "check",
        at,
        // Ageing never turns a pass into a failure. A reading past its
        // horizon is unknown again, which is exactly what it is.
        state:
          read === "failed"
            ? "failing"
            : read === "verified"
              ? "passing"
              : read === "noted"
                ? "seen"
                : "unknown",
        detail: held.value.detail ?? null,
        evidence: at
          ? [{ at, text: held.value.detail ?? held.record.title }]
          : [],
        invented: false,
      });
    }

  // ---- Is anything actually watching?
  const monitors = subjectsOfKind(live, "monitor");
  let watcher: Watcher | null = null;
  for (const ref of monitors) {
    const presence = presenceOf(live, ref);
    if (!presence.known) continue;
    if (presence.presence === "absent") {
      watcher = {
        state: "not-running",
        hostReachable: null,
        detail: `Nothing is watching: ${ref.id} was recorded as not in place.`,
      };
      continue;
    }
    const facts = currentFacts(live, ref);
    const answering = currentChecks(live, ref).get("answering");
    const read = answering
      ? checkAsNow(answering.value, answering.record, now)
      : null;
    watcher = {
      state:
        read === "verified"
          ? "running"
          : read === "stale"
            ? "stale"
            : "not-running",
      lastObservationAt: answering?.record.establishedAt ?? null,
      hostReachable:
        read === "failed" ? false : read === "verified" ? true : null,
      detail: [
        facts.get("target")?.value.value
          ? `Watches ${facts.get("target")!.value.value}`
          : null,
        facts.get("interval")?.value.value
          ? `every ${facts.get("interval")!.value.value}`
          : null,
        facts.get("notifies")?.value.value
          ? `and tells ${facts.get("notifies")!.value.value}`
          : "and there is no record of who it would tell",
      ]
        .filter(Boolean)
        .join(" "),
    };
    break;
  }

  // ---- What nothing is watching.
  const unwatched: Unwatched[] = [];
  if (!watcher)
    unwatched.push({
      id: "watch",
      part: null,
      title: "Nothing is watching",
      short: "No watcher",
      detail:
        "Every result here is something Server Guy looked at once. Nothing is checking on its own, so nothing would tell you if it stopped.",
    });
  for (const station of stations)
    if (!looks.some((look) => look.part === station.part))
      unwatched.push({
        id: `unlooked:${station.part}`,
        part: station.part,
        title: `${station.part} has never been checked`,
        short: "Never checked",
        detail:
          "It is on record as being there, but nothing has established whether it works.",
      });
  for (const part of map?.parts ?? [])
    if (!stations.some((station) => station.part === part.id))
      unwatched.push({
        id: `unstated:${part.id}`,
        part: null,
        title: `${part.name} is drawn but not observed`,
        short: "Not observed",
        detail: `The map shows ${part.plain}, and no record states it, so nothing here can say anything about it.`,
      });

  const host = subjectsOfKind(live, "host")[0] ?? null;
  const hostFacts = host ? currentFacts(live, host) : null;
  // What the machine is doing, not what it has. "4 GB" is a spec sheet and
  // never changes; "1.2 of 4 GB used" is a reading, and only the second
  // belongs on a page about whether anything is watching.
  for (const key of ["cpu-used", "memory-used", "disk-used"] as const) {
    const held = hostFacts?.get(key);
    if (!held || !host) continue;
    looks.push({
      id: `${host.id}:${key}`,
      part: host.id,
      name: held.value.label,
      short: `${held.value.label} ${held.value.value}`,
      how: held.value.value,
      kind: "output",
      at: held.record.establishedAt,
      state: "seen",
      detail: null,
      evidence: held.record.establishedAt
        ? [{ at: held.record.establishedAt, text: held.value.value }]
        : [],
      invented: false,
    });
  }

  return {
    name: applicationName,
    parts: stations.map((station) => station.part),
    processes: subjectsOfKind(live, "process").map((ref) => ({
      product: currentFacts(live, ref).get("product")?.value.value ?? ref.id,
      roleWords: map?.parts.find((part) => part.id === ref.id)?.role ?? "",
    })),
    looks,
    lastCheckAt,
    watcher,
    unwatched,
  };
}

/** Whether the page has anything at all to draw. */
export function monitoringAssessed(
  records: SavedInformation[],
  applicationId: string,
) {
  const story = monitoringFromRecords({
    records,
    applicationId,
    applicationName: "",
    now: Date.now(),
  });
  return story.looks.length > 0 || story.watcher !== null;
}

/** The series of readings for one subject, when a station is opened. */
export function readingsFor(records: SavedInformation[], ref: Ref) {
  return seriesFor(records, ref);
}
