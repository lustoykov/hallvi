"use client";

// Architecture, built from what Pi recorded.
//
// The design is the one accepted on claude/architecture-directions; this
// replaces the prototype's builder, which read the old facts model. Only the
// ten fields the design actually draws are produced, and every one of them
// comes from a record or is left saying it is not known.
//
// The shape of the map is Pi's: it writes a `topology` on the record that
// speaks for the application. The state of each piece is not in that map —
// a part's state is the newest record stating that part — so the diagram can
// never contradict the page a reader clicks through to.
//
// Composition here is the reading layer's own job, per the contract's
// division of labour: journeys, their order and their sentences are layout,
// not facts. What is never done here is inventing a fact to complete the
// picture. A part nobody has looked at reads unknown; a part Pi declared
// missing reads absent; the two are not the same and neither is healthy.

import type { Ref, SavedInformation, SubjectKind } from "@/server/operator-data";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  freshnessOf,
  presenceOf,
  topologyOf,
  type RecordCheck,
} from "@/server/record-projection";

import type { ApplicationSection } from "./application-sections";
import type {
  ArchitectureModel,
  Certainty,
  Evidence,
  Journey,
  Part,
} from "./architecture-prototype/model";

/**
 * What kind of thing a drawn piece is, so its own records can be found. The
 * controller and the source repository have no subject kind: Server Guy is
 * not a thing it observes, and the repository's state lives in Deployment.
 */
const subjects: Partial<Record<Part["kind"], SubjectKind[]>> = {
  host: ["host"],
  web: ["process"],
  private: ["process"],
  volume: ["volume"],
  // A way in is a door; Pi may reasonably speak of the tunnel through it as
  // access instead. Both are the same thing on the map.
  gate: ["door", "access"],
  tls: ["certificate"],
  monitor: ["monitor"],
};

/** The subject a drawn part's records are under, whichever kind Pi chose. */
function refFor(
  records: SavedInformation[],
  part: { id: string; kind: Part["kind"] },
) {
  const kinds = subjects[part.kind] ?? [];
  const stated = kinds.find(
    (kind) => presenceOf(records, { kind, id: part.id }).known,
  );
  return kinds.length
    ? ({ kind: stated ?? kinds[0], id: part.id } as Ref)
    : null;
}

/**
 * The checks a drawn part's tag may rest on, most telling first. A check with
 * a key outside this table still reads in the part's detail, but it never
 * decides what the map says: an unknown key silently driving designed UI is
 * how a page starts asserting things nobody specified.
 */
const tagKeys: Partial<Record<Part["kind"], string[]>> = {
  host: ["ssh"],
  web: ["http", "container"],
  private: ["reachable", "container"],
  volume: ["persistence"],
  gate: ["refused", "open"],
  tls: ["valid"],
  monitor: ["answering"],
};

/** Where a reader goes to see more about a piece, or about a gap. */
const destinations: Partial<Record<Part["kind"], ApplicationSection>> = {
  source: "deployment",
  host: "processes",
  web: "processes",
  private: "processes",
  volume: "storage",
  gate: "security",
  tls: "domains",
  offsite: "backups",
};

function localTime(at: string) {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The check a part's tag should draw: the first declared key it carries.
 * Architecture's tag is evidence about now, and the keys are ordered so the
 * most telling claim wins — something answered beats something is running.
 */
function tagCheck(
  held: Map<string, { value: RecordCheck; record: SavedInformation }>,
  kind: Part["kind"],
) {
  for (const key of tagKeys[kind] ?? []) {
    const found = held.get(key);
    if (found) return found;
  }
  // A failure is worth saying even under a key this page does not know.
  return [...held.values()].find((item) => item.value.status === "failed") ?? null;
}

/**
 * A piece's certainty, presence and freshness kept apart: presence decides
 * whether there is anything to say, the check's outcome decides whether it
 * passed, and only then does the clock get a vote.
 */
function evidenceFor(
  records: SavedInformation[],
  part: { id: string; kind: Part["kind"] },
  planned: boolean,
  now: number,
): Evidence {
  const ref = refFor(records, part);
  if (!ref)
    return {
      certainty: planned ? "planned" : "verified",
      short: planned
        ? "In the plan"
        : part.kind === "controller"
          ? "Server Guy itself"
          : "Where the code came from",
      detail: planned
        ? "Part of the intended shape; nothing has run yet."
        : part.kind === "controller"
          ? "This is Server Guy, not something it observes."
          : "The repository the deployment was built from; what was built is on Deployment.",
      at: null,
    };
  // Established absence outranks everything: a record spoke for this and
  // said there is nothing there.
  const presence = presenceOf(records, ref);
  if (presence.known && presence.presence === "absent")
    return {
      certainty: "absent",
      short: "Established absent",
      detail: `${presence.record.title}${presence.record.establishedAt ? `, recorded at ${localTime(presence.record.establishedAt)}` : ""}.`,
      at: presence.record.establishedAt,
    };

  // Then the evidence, which is a different question from presence. A part
  // nobody wrote a state record for can still have a check about it from a
  // deployment — and a homepage that answered is evidence it is there.
  const held = tagCheck(currentChecks(records, ref), part.kind);
  if (!held)
    return planned
      ? {
          certainty: "planned",
          short: "In the plan",
          detail:
            "Part of the intended shape; nothing has been observed of it yet.",
          at: null,
        }
      : presence.known
        ? {
            certainty: "unknown",
            short: "Recorded, nothing checked",
            detail:
              "A record speaks for this part, but nothing this page can read says whether it is working.",
            at: presence.record.establishedAt,
          }
        : {
            certainty: "unknown",
            short: "Not assessed",
            detail:
              "Nothing on record says anything about this part, so nobody has looked. That is not a claim that anything is wrong.",
            at: null,
          };

  const reading = checkAsNow(held.value, held.record, now);
  const freshness = freshnessOf(held.value, held.record, now);
  const at = held.record.establishedAt;
  const certainty: Certainty =
    reading === "verified"
      ? "verified"
      : reading === "stale"
        ? "stale"
        : reading === "failed"
          ? "failed"
          : "unknown";
  const short =
    reading === "verified"
      ? `Checked ${at ? localTime(at) : "recently"}`
      : reading === "stale"
        ? `Last checked ${at ? localTime(at) : "some time ago"}`
        : reading === "failed"
          ? "A check failed"
          : freshness.kind === "never-established"
            ? "Written, nothing established"
            : "Recorded, not dated";
  return {
    certainty,
    short,
    detail:
      `${held.value.label}: ${held.value.status}.` +
      (held.value.detail ? ` ${held.value.detail}` : "") +
      (freshness.kind === "stale"
        ? " It held when it was checked; enough time has passed that it may have changed."
        : freshness.kind === "unknowable"
          ? " The record does not say what kind of claim this is, so there is no telling whether it still holds."
          : ""),
    at,
  };
}

/** One declared fact of a part, by key. */
function factOf(
  records: SavedInformation[],
  part: { id: string; kind: Part["kind"] },
  key: string,
) {
  const ref = refFor(records, part);
  if (!ref) return null;
  return currentFacts(records, ref).get(key)?.value.value ?? null;
}

function factsFor(
  records: SavedInformation[],
  part: { id: string; kind: Part["kind"] },
) {
  const ref = refFor(records, part);
  if (!ref) return [];
  return [...currentFacts(records, ref).values()].map(
    (held) => ({
      label: held.value.label,
      value: held.value.value,
      mono: held.value.mono,
    }),
  );
}

/**
 * Where the design puts a piece. The map is a fixed bird's-eye layout with a
 * place for the source, the way in, the machine, the application and its
 * data, so the component owns the slot and Pi owns the identity. Keeping them
 * apart is what lets Pi name a host `hetzner-165619823` — a reference it can
 * reuse on every later observation — without the diagram having to guess
 * where that belongs.
 */
/** A door on port 22 is the one Server Guy comes through. */
function sshLooking(
  part: { id: string; kind: string; name: string; role: string },
  records: SavedInformation[],
) {
  if (part.kind !== "gate") return false;
  if (/\bssh\b|\b22\b/i.test(`${part.name} ${part.role}`)) return true;
  return (
    factOf(records, { id: part.id, kind: "gate" }, "port") === "22"
  );
}

function slotFor(part: { id: string; kind: Part["kind"] }, sshLike: boolean) {
  switch (part.kind) {
    case "controller":
      return "controller";
    case "source":
      return "source";
    case "host":
      return "host";
    case "web":
      return "app";
    case "offsite":
      return "offsite";
    case "gate":
      return sshLike ? "gate:ssh" : "gate:http";
    default:
      // Volumes, private services and monitors are found by kind, so they
      // keep the reference Pi gave them.
      return part.id;
  }
}

function list(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * How the application can be reached. `restricted` alone cannot say "we have
 * not read this back", and the design renders its absence as "anyone", so the
 * three-way reading is what gets threaded through.
 */
function opennessOf(
  records: SavedInformation[],
  edges: { from: string; to: string; network: string }[],
  webIds: Set<string>,
): ArchitectureModel["openness"] {
  const access = records
    .filter((record) => !record.retiredAt)
    .map((record) => record.presentation?.content)
    .find((content) => content?.kind === "application-access");
  if (access?.kind === "application-access")
    return access.mode === "private" ? "restricted" : "public";
  const inbound = edges.filter((edge) => webIds.has(edge.to));
  if (inbound.some((edge) => edge.network === "public")) return "public";
  if (inbound.some((edge) => edge.network === "loopback")) return "restricted";
  return "unknown";
}

/**
 * Null when no record maps this application: the page then draws its own
 * unassessed state rather than a diagram of nothing.
 */
export function architectureFromRecords({
  records,
  applicationId,
  applicationName,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  now: number;
}): ArchitectureModel | null {
  const map = topologyOf(records, applicationId);
  if (!map) return null;
  const planned = map.value.from === "plan";

  // The revision belongs to the deployment record; the repository card shows
  // it, and reading it from there keeps one authority for it.
  const revision = records
    .filter((record) => !record.retiredAt)
    .map((record) => record.presentation?.content)
    .find((content) => content?.kind === "deployment");

  const slots = new Map(
    map.value.parts.map((part) => [
      part.id,
      slotFor(part, sshLooking(part, records)),
    ]),
  );
  const edges = map.value.edges.map((edge) => ({
    ...edge,
    from: slots.get(edge.from) ?? edge.from,
    to: slots.get(edge.to) ?? edge.to,
  }));

  const parts: Part[] = map.value.parts.map((part) => {
    const evidence = evidenceFor(records, part, planned, now);
    const facts =
      part.kind === "source"
        ? revision?.kind === "deployment"
          ? [
              {
                label: "Revision",
                value: revision.revision,
                mono: true,
              },
            ]
          : []
        : factsFor(records, part);
    const sshLike =
      /\bssh\b/i.test(`${part.name} ${part.role}`) ||
      facts.some((fact) => fact.value === "22");
    return {
      id: slots.get(part.id)!,
      kind: part.kind as Part["kind"],
      name: part.name,
      role: part.role,
      plain: part.plain,
      // What mounts a volume, in the slot the design drew it in. Pi may say
      // so directly; otherwise the disk edge already said it, and asking for
      // it twice is asking for two answers that can disagree.
      owner: part.owner
        ? (slots.get(part.owner) ?? part.owner)
        : part.kind === "volume"
          ? edges.find(
              (edge) =>
                edge.network === "disk" && edge.to === slots.get(part.id),
            )?.from
          : undefined,
      // What was observed of something Pi has since recorded as gone
      // described the thing that is gone; it is in the series, not here.
      facts: evidence.certainty === "absent" ? [] : facts,
      evidence,
      destination: destinations[part.kind as Part["kind"]],
      // Server Guy and the repository have no state of their own to tag.
      quiet: part.kind === "controller",
    };
  });

  /**
   * The design draws a placeholder where a monitor could be. A placeholder is
   * not a claim: it reads unassessed until a record stating a monitor says
   * otherwise, and it disappears entirely once one exists. This is why the map
   * declares nothing absent — two authorities on the same question eventually
   * disagree, and the reader has no way to tell which one to believe.
   */
  const monitors = records
    .filter(
      (record) =>
        !record.retiredAt &&
        record.presentation?.states?.ref.kind === "monitor",
    )
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    );
  const monitoring = parts.some((part) => part.kind === "monitor")
    ? "present"
    : (monitors[0]?.presentation?.states?.presence ?? "unassessed");
  const monitoringGap =
    monitoring === "present"
      ? null
      : {
          id: "monitoring",
          title: monitors[0]?.title ?? "Nothing is watching this",
          detail:
            monitoring === "absent"
              ? monitors[0]?.body ||
                "Pi recorded that nothing watches this application."
              : "Nobody has looked at whether anything watches this application, which is not the same as there being nothing.",
          destination: "monitoring" as ApplicationSection,
        };
  const ghosts: Part[] = monitoringGap
    ? [
        {
          id: "gap:monitoring",
          kind: "monitor" as const,
          name: monitoringGap.title,
          role: monitoringGap.detail,
          plain: monitoringGap.detail,
          facts: [],
          evidence:
            monitoring === "absent"
              ? {
                  certainty: "absent" as const,
                  short: "Established absent",
                  detail: monitoringGap.detail,
                  at: monitors[0]?.establishedAt ?? null,
                }
              : {
                  certainty: "unknown" as const,
                  short: "Not assessed",
                  detail: monitoringGap.detail,
                  at: null,
                },
          destination: "monitoring" as ApplicationSection,
        },
      ]
    : [];

  const all = [...parts, ...ghosts];
  const byId: Record<string, Part> = {};
  for (const part of all) byId[part.id] = part;

  const of = (kind: Part["kind"]) => parts.filter((part) => part.kind === kind);
  const web = of("web");
  const volumes = of("volume");
  const offsite = of("offsite");
  const host = of("host")[0];
  const hostSubject = map.value.parts.find((part) => part.kind === "host");
  const headline = web[0]?.name ?? applicationName;
  const openness = opennessOf(
    records,
    edges,
    new Set(web.map((part) => part.id)),
  );

  const stops = (kinds: Part["kind"][]) =>
    kinds.flatMap((kind) => of(kind).map((part) => part.id));
  const journeys: Journey[] = ([
    {
      id: "visit",
      label: "A visit",
      stops: stops(["controller", "gate", "tls", "web", "private"]),
      summary:
        openness === "restricted"
          ? `A visit reaches ${headline} only from the machine running Server Guy.`
          : openness === "public"
            ? `A visit reaches ${headline} from anywhere.`
            : `A visit reaches ${headline}; how far it can be reached from has not been read back.`,
    },
    {
      id: "data",
      label: "Your data",
      stops: stops(["volume", "offsite"]),
      summary: volumes.length
        ? offsite.length
          ? `${list(volumes.map((part) => part.name))} live on the server and are copied to ${list(offsite.map((part) => part.name))}.`
          : `${list(volumes.map((part) => part.name))} live on the server. Whether anything copies them off it has not been assessed.`
        : "No stored data is on record for this application.",
    },
    {
      id: "release",
      label: "A release",
      stops: stops(["source", "controller", "gate", "host", "web"]),
      summary: host
        ? `Server Guy delivers to ${host.name} over the connection it holds.`
        : "No host is on record for this application yet.",
    },
  ] satisfies Journey[]).filter((journey) => journey.stops.length >= 1);

  // The application's own reading, as three separate questions.
  const applicationRef: Ref = { kind: "application", id: applicationId };
  const own = [...currentChecks(records, applicationRef).values()];
  const readings = own.map((held) => checkAsNow(held.value, held.record, now));
  const condition: ArchitectureModel["condition"] = planned
    ? { certainty: "planned", text: "Nothing has run yet; this is the intended shape." }
    : readings.includes("failed")
      ? { certainty: "failed", text: "A check on the application did not pass." }
      : readings.includes("stale")
        ? {
            certainty: "stale",
            text: "It held when it was last checked, and enough time has passed that it may have changed.",
          }
        : readings.includes("verified")
          ? { certainty: "verified", text: "Every check on the application held when it was last read." }
          : {
              certainty: "unknown",
              text: "Nothing on record says whether the application is working.",
            };

  return {
    scenario: "live",
    invented: false,
    now,
    status: planned ? "planned" : "live",
    applicationName,
    headline,
    parts: all,
    byId,
    journeys,
    condition,
    gaps: monitoringGap ? [monitoringGap] : [],
    // Read by its declared key, and against Pi's own reference rather than
    // the slot the design drew it in — the two are deliberately not the same.
    region: hostSubject ? factOf(records, hostSubject, "region") : null,
    openness,
    restricted: openness === "restricted",
    // Not drawn by this design, and not inferred from silence.
    monitored: parts.some((part) => part.kind === "monitor"),
    restoreAt: null,
    log: [],
  };
}
