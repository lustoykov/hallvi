"use client";

// Processes, built from what Pi recorded.
//
// A process is a subject: Pi names it, states whether it is there, and hangs
// facts and checks on it. The map says what kind of thing it is — the web app
// you open, or something only the server reaches — and the release says which
// image it runs. Nothing here counts processes the map merely draws: a part on
// a diagram is a shape, and only a record can say a process exists.
//
// The three questions stay apart. Presence is whether Pi found it. Outcome is
// whether its checks passed. Freshness is whether those checks are still worth
// trusting, and only the reader decides that.

import type { Ref, SavedInformation } from "@/server/operator-data";
import {
  currentChecks,
  currentFacts,
  freshnessOf,
  presenceOf,
  releasedServices,
  subjectsOfKind,
  topologyOf,
  type Held,
  type RecordCheck,
} from "@/server/record-projection";

import type {
  Change,
  Gap,
  LineStory,
  ProcessCard,
  Probe,
} from "./stack-prototype/line-story";

/** A digest is the honest identity and unreadable as a headline. */
export function shortImage(image: string) {
  const [reference, digest] = image.split("@");
  const name = reference.split("/").at(-1) ?? reference;
  return digest
    ? `${name.split(":")[0]} · ${digest.replace("sha256:", "").slice(0, 12)}`
    : name;
}

/** "grafana/grafana:11.2.0" → "Grafana". A name, not a claim. */
function productFrom(image: string | null, fallback: string) {
  if (!image) return fallback;
  const name = (image.split("@")[0].split(":")[0].split("/").at(-1) ?? "")
    .replace(/[-_]/g, " ")
    .trim();
  if (!name) return fallback;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

const roleWords: Record<ProcessCard["role"], string> = {
  web: "The web app you open",
  private: "Private: only processes on the server reach it",
  worker: "Works in the background",
  service: "A supporting service",
};

/**
 * What a check says it looked at, in one line. `detail` is Pi's own words for
 * it; without one the label has to stand in, because inventing a probe string
 * would be describing a check that was never written down that way.
 */
function probeOf(held: Held<RecordCheck>): Probe {
  return {
    name: held.value.label,
    probe: held.value.detail ?? held.value.label,
    // A check about a private process was necessarily run from inside; one
    // about something reachable was not necessarily run from outside, so the
    // claim is only made where the key says it.
    inside: held.value.key === "reachable" || held.value.key === "container",
    at: held.record.establishedAt,
  };
}

export interface ProcessesInput {
  records: SavedInformation[];
  applicationId: string;
  now: number;
}

export function processesFromRecords({
  records,
  applicationId,
  now,
}: ProcessesInput): LineStory {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;
  const partOf = (id: string) => map?.parts.find((part) => part.id === id);

  // What is running is what Pi stated, in the order the map draws it — the
  // map is layout, so it may order, but it may not add.
  const order = new Map(map?.parts.map((part, index) => [part.id, index]));
  const refs = subjectsOfKind(live, "process").sort(
    (a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99),
  );

  // The newest release, for the image each process actually runs.
  const release = live
    .filter((record) => record.presentation?.content?.kind === "deployment")
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )[0];
  const deployment = release?.presentation?.content;
  const services =
    deployment?.kind === "deployment" ? releasedServices(deployment) : [];

  // How the application is reached, which is what makes "port 80 → 3000" true
  // for the web process and false for everything else.
  const accessRecord = live.find(
    (record) => record.presentation?.content?.kind === "application-access",
  );
  const access = accessRecord?.presentation?.content;
  const restricted =
    access?.kind === "application-access" ? access.mode === "private" : false;

  const processes: ProcessCard[] = refs.map((ref) => {
    const facts = currentFacts(live, ref);
    const checks = currentChecks(live, ref);
    const part = partOf(ref.id);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;

    const service =
      services.find((item) => item.process === ref.id) ??
      // A one-image release names no process; it belongs to the web process,
      // and to nothing else.
      (services.length === 1 &&
      services[0].process === null &&
      part?.kind === "web"
        ? services[0]
        : null);
    const image = service?.image ?? fact("image");
    const port = Number(fact("port")) || null;

    const role: ProcessCard["role"] =
      part?.kind === "web"
        ? "web"
        : part?.kind === "private"
          ? "private"
          : fact("role") === "worker"
            ? "worker"
            : "service";

    const probes = [...checks.values()].map(probeOf);
    return {
      name: ref.id,
      product: fact("product") ?? productFrom(image, part?.name ?? ref.id),
      role,
      roleWords: roleWords[role],
      port,
      reach:
        role === "web"
          ? `Port 80 → ${port ?? "its port"} · ${restricted ? "from your network only" : "open to anyone"}`
          : port
            ? `Port ${port} · inside the server only`
            : "No port recorded",
      health: fact("health"),
      image: image ?? "Not recorded",
      imageShort: image ? shortImage(image) : "Not recorded",
      command: fact("command"),
      probes,
      lastPassed:
        probes
          .filter((probe) => probe.at)
          .map((probe) => probe.at!)
          .sort()
          .at(-1) ?? null,
    };
  });

  // ---- How sure we are, over the whole page.
  //
  // Ageing never turns a pass into a failure. A process whose liveness check
  // has gone out of window is not unhealthy — it is unwatched, and the word
  // for that is "may have changed".
  const stated = refs.map((ref) => presenceOf(live, ref));
  const anyPresent = stated.some(
    (item) => item.known && item.presence === "present",
  );
  const failing = refs.some((ref) =>
    [...currentChecks(live, ref).values()].some(
      (held) => held.value.status === "failed",
    ),
  );
  const freshest = refs
    .flatMap((ref) => [...currentChecks(live, ref).values()])
    .filter((held) => held.value.status === "passed")
    .map((held) => ({
      at: held.record.establishedAt,
      fresh: freshnessOf(held.value, held.record, now).kind === "fresh",
    }));
  const anyFresh = freshest.some((item) => item.fresh);
  const verifiedAt =
    freshest
      .map((item) => item.at)
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1) ?? null;

  const state: LineStory["state"] = !refs.length
    ? "none"
    : failing
      ? "running"
      : !anyPresent
        ? "planned"
        : anyFresh
          ? "running"
          : "unknown";

  return {
    state,
    tone: failing
      ? "failed"
      : state === "running"
        ? "verified"
        : state === "unknown"
          ? "stale"
          : "planned",
    word: failing
      ? "A check failed"
      : state === "running"
        ? "Checked recently"
        : state === "unknown"
          ? "Needs a check"
          : state === "planned"
            ? "Not running yet"
            : "Nothing recorded",
    verifiedAt,
    restricted,
    from: null,
    processes,
    processChanges: changesFor(live, refs),
    processGaps: gapsFor(processes),
  };
}

/** Records that touched any of these processes, newest five. */
function changesFor(records: SavedInformation[], refs: Ref[]): Change[] {
  const ids = new Set(refs.map((ref) => ref.id));
  const touches = (record: SavedInformation) =>
    (record.presentation?.about ?? []).some(
      (item) => item.kind === "process" && ids.has(item.id),
    ) ||
    (record.presentation?.states?.ref.kind === "process" &&
      ids.has(record.presentation.states.ref.id));
  return records
    .filter((record) => record.presentation && touches(record))
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )
    .slice(0, 5)
    .map((record) => ({
      id: record.id,
      title: record.title,
      at: record.establishedAt ?? record.createdAt,
      state:
        record.presentation?.status === "failed"
          ? "failed"
          : record.presentation?.status === "verified"
            ? "verified"
            : "queued",
      summary: record.presentation?.nextStep ?? "",
      origin: null,
    }));
}

/**
 * What Server Guy cannot do yet. These are ghosts in the design and never
 * readings: none of them is a claim that something is missing, only that
 * nothing here watches for it.
 */
function gapsFor(processes: ProcessCard[]): Gap[] {
  return [
    {
      id: "watch",
      title: "Health watch and restarts",
      detail:
        "Not set up. Only the checks Pi ran are recorded, and nothing restarts a process that stops.",
    },
    ...(processes.some((item) => item.role === "worker")
      ? []
      : [
          {
            id: "workers",
            title: "Background workers",
            detail:
              "None recorded. That is not a claim there are none — no record names one.",
          },
        ]),
  ];
}
