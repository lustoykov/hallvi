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

import type {
  InformationContent,
  Ref,
  SavedInformation,
} from "@/server/operator-data";
import {
  checkAsNow,
  horizonOf,
  currentChecks,
  currentFacts,
  presenceOf,
  seriesFor,
  subjectsOfKind,
  topologyOf,
  type SubjectKindOf,
} from "@/server/record-projection";

export interface Look {
  id: string;
  /** The part of the map it is about. */
  part: string;
  name: string;
  short: string;
  how: string;
  kind: "check" | "output";
  at: string | null;
  state: "passing" | "failing" | "unknown" | "seen";
  detail: string | null;
}

export interface Unwatched {
  id: string;
  /** The part it would belong to, or null for the whole application. */
  part: string | null;
  title: string;
  short: string;
  detail: string;
}

export interface Watcher {
  state: "running" | "stale" | "not-running";
  lastObservationAt?: string | null;
  hostReachable: boolean | null;
  detail: string;
}

export interface MonitoringStory {
  name: string;
  /** Every part something was observed about, in the order the map draws. */
  parts: string[];
  processes: { product: string; roleWords: string }[];
  looks: Look[];
  lastCheckAt: string | null;
  watcher: Watcher | null;
  unwatched: Unwatched[];
}

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
}): MonitoringStory {
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
        how: held.value.detail ?? "",
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
          ? `Watches ${facts.get("target")!.value.value.replace(/^https?:\/\//, "")}`
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
        "Every result here is something Hallvi looked at once. Nothing is checking on its own, so nothing would tell you if it stopped.",
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

export type Usage = Extract<InformationContent, { kind: "usage" }> & {
  /** When Hallvi read the window: its last bucket ends here. */
  at: string | null;
  /** The host's `disk-used` fact, which changes too slowly to chart. */
  disk: string | null;
};

/** The newest window of traffic and host readings, when one was read. */
export function usageFromRecords(
  records: SavedInformation[],
  applicationId: string,
): Usage | null {
  const live = records.filter((record) => !record.retiredAt);
  const newest = live
    .filter(
      (record) =>
        record.applicationId === applicationId &&
        record.presentation?.content?.kind === "usage",
    )
    .sort((a, b) =>
      (b.establishedAt ?? "").localeCompare(a.establishedAt ?? ""),
    )[0];
  if (newest?.presentation?.content?.kind !== "usage") return null;
  const host = subjectsOfKind(live, "host")[0];
  return {
    ...newest.presentation.content,
    at: newest.establishedAt,
    disk: host
      ? (currentFacts(live, host).get("disk-used")?.value.value ?? null)
      : null,
  };
}

// ---- The parts, as the Watching map draws them.
//
// What a list of check keys never said: a part has a name and a kind, a
// check is a sentence, and a pass counts for a window and then expires.

/** What a check key means, in words an owner would use. */
const checkWords: Record<string, [title: string, means: string]> = {
  http: ["Answers web requests", "A request to it got a good response."],
  "release-http": [
    "Answers web requests",
    "A request to it got a good response.",
  ],
  container: ["Its container is running", "Docker reports it as up."],
  reachable: ["Can be reached", "Another part could connect to it."],
  persistence: [
    "Data survives a restart",
    "Its files live outside the container.",
  ],
  ssh: ["Server accepts connections", "Hallvi could log in over SSH."],
  answering: ["Database answers", "A test query came back."],
  connects: ["Database answers", "A test query came back."],
};
const readingWords: Record<string, string> = {
  "cpu-used": "CPU in use",
  "memory-used": "Memory in use",
  "disk-used": "Disk in use",
};
const kindWords: Record<string, string> = {
  web: "Web app",
  private: "Background process",
  process: "Process",
  volume: "Storage",
  host: "The machine it runs on",
  database: "Database",
  door: "Way in",
  certificate: "Certificate",
};

export interface PartLook {
  id: string;
  title: string;
  means: string;
  at: string | null;
  /** `expired` worked once, too long ago to count. Never a failure. */
  state: "counts" | "expired" | "failed" | "read";
  /** Why it failed, or the value that was read. */
  detail: string | null;
  /** How much longer a pass counts, in ms; null when it never expires. */
  left: number | null;
}
export interface WatchedPart {
  id: string;
  name: string;
  kind: string;
  kindWord: string;
  looks: PartLook[];
  /**
   * Every dated reading of this part, oldest first: one mark per record that
   * checked it. The run is what shows absence — a part read once, a day ago,
   * is a single mark and then a long stretch of nobody looking.
   */
  readings: { at: string; failed: boolean; title: string }[];
  lastAt: string | null;
  state: "failed" | "counts" | "expired" | "never";
  /** Whether the running watcher covers it. */
  watched: boolean;
}
export interface Watching {
  parts: WatchedPart[];
  /** Parts the map draws that no record states: ghosts. */
  ghosts: Unwatched[];
  counts: { counts: number; expired: number; failed: number };
}

export function watchingFromRecords(
  records: SavedInformation[],
  applicationId: string,
  story: MonitoringStory,
  now: number,
): Watching {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value;
  const watching = story.watcher?.state === "running";

  const parts = story.parts.map((id): WatchedPart => {
    const drawn = map?.parts.find((part) => part.id === id);
    const ref = (
      ["process", "host", "volume", "database", "door", "certificate"] as const
    )
      .map((kind): Ref => ({ kind, id }))
      .find((candidate) => presenceOf(live, candidate).known);
    const kind = drawn?.kind ?? ref?.kind ?? "process";

    const looks: PartLook[] = ref
      ? [...currentChecks(live, ref)].map(([key, held]) => {
          const read = checkAsNow(held.value, held.record, now);
          const horizon = horizonOf(held.value);
          const at = held.record.establishedAt;
          return {
            id: `${id}:${key}`,
            title: checkWords[key]?.[0] ?? held.value.label,
            means: checkWords[key]?.[1] ?? "",
            at,
            state:
              read === "failed"
                ? "failed"
                : // A note, or a pass with no claim to age it by: on record,
                  // and not a statement about now.
                  read === "noted" || read === "recorded"
                  ? "read"
                  : read === "verified"
                    ? "counts"
                    : "expired",
            detail: held.value.detail ?? null,
            left:
              at && horizon !== null && Number.isFinite(horizon)
                ? Date.parse(at) + horizon - now
                : null,
          };
        })
      : [];
    for (const look of story.looks)
      if (look.part === id && look.kind === "output")
        looks.push({
          id: look.id,
          title: readingWords[look.name] ?? look.name,
          means: "",
          at: look.at,
          state: "read",
          detail: look.how,
          left: null,
        });

    const judged = looks.filter((look) => look.state !== "read");
    const readings = ref
      ? live
          .flatMap((record) => {
            const about = (record.presentation?.checks ?? []).filter(
              (check) => {
                const subject = check.about ?? record.presentation?.states?.ref;
                return (
                  subject?.kind === ref.kind &&
                  subject.id === ref.id &&
                  check.status !== "info"
                );
              },
            );
            return record.establishedAt && about.length
              ? [
                  {
                    at: record.establishedAt,
                    failed: about.some((check) => check.status === "failed"),
                    title: record.title,
                  },
                ]
              : [];
          })
          .sort((a, b) => a.at.localeCompare(b.at))
      : [];
    return {
      id,
      readings,
      name:
        drawn?.name ??
        (ref ? currentFacts(live, ref).get("product")?.value.value : null) ??
        (kind === "host" ? "Server" : id),
      kind,
      kindWord: kindWords[kind] ?? "Part",
      looks,
      lastAt:
        looks
          .map((look) => look.at)
          .filter((at): at is string => Boolean(at))
          .sort()
          .at(-1) ?? null,
      state: judged.some((look) => look.state === "failed")
        ? "failed"
        : !judged.length
          ? "never"
          : judged.some((look) => look.state === "counts")
            ? "counts"
            : "expired",
      // All a watcher's record says it watches is a web address.
      watched: watching && kind === "web",
    };
  });

  const judged = parts.flatMap((part) =>
    part.looks.filter((look) => look.state !== "read"),
  );
  return {
    parts,
    ghosts: story.unwatched.filter((gap) => gap.id.startsWith("unstated:")),
    counts: {
      counts: judged.filter((look) => look.state === "counts").length,
      expired: judged.filter((look) => look.state === "expired").length,
      failed: judged.filter((look) => look.state === "failed").length,
    },
  };
}
