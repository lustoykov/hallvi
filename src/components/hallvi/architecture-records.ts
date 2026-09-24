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

import { pulseAsks } from "./pulse-asks";
import type {
  Ref,
  SavedInformation,
  SubjectKind,
} from "@/server/operator-data";
import {
  checkAsNow,
  currentChecks,
  currentFacts,
  freshnessOf,
  presenceOf,
  subjectsOfKind,
  topologyOf,
  type RecordCheck,
  type Topology,
} from "@/server/record-projection";

import { protectionFromRecords } from "./backups-records";

import { ago } from "./architecture-prototype/model";
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
 * controller and the source repository have no subject kind: Hallvi is
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
  // A destination off the server is not a thing Pi states on its own; what
  // states it is the copy that reached it. Without this the off-site card
  // fell through to the source's fallback and read "Where the code came
  // from", which is a sentence about a repository on a card about a bucket.
  offsite: ["backup-copy"],
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
  offsite: ["written"],
};

/** Where a reader goes to see more about a piece, or about a gap. */
const destinations: Partial<Record<Part["kind"], ApplicationSection>> = {
  source: "deployment",
  host: "processes",
  web: "processes",
  private: "processes",
  volume: "storage",
  gate: "access",
  tls: "access",
  offsite: "backups",
  monitor: "monitoring",
};

/**
 * Architecture used to date its evidence with a bare clock time — "Checked
 * 11:43 AM" — while every other destination says "7 h ago". Two things wrong
 * with that: the product spoke two time languages on adjacent pages, and a
 * clock time with no date cannot tell today from last Tuesday, which is
 * exactly the distinction a current-state view exists to make.
 */

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
  return (
    [...held.values()].find((item) => item.value.status === "failed") ?? null
  );
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
          ? "Hallvi itself"
          : "Recorded in the topology",
      detail: planned
        ? "Part of the intended shape; nothing has run yet."
        : part.kind === "controller"
          ? "This is Hallvi, not something it observes."
          : "The source named in the recorded topology; its connections are shown as recorded.",
      at: null,
    };
  // Established absence outranks everything: a record spoke for this and
  // said there is nothing there.
  const presence = presenceOf(records, ref);
  if (presence.known && presence.presence === "absent")
    return {
      certainty: "absent",
      short: "Established absent",
      detail: `${presence.record.title}${presence.record.establishedAt ? `, recorded ${ago(presence.record.establishedAt, now)}` : ""}.`,
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
      ? `Checked ${at ? ago(at, now) : "recently"}`
      : reading === "stale"
        ? `Last checked ${at ? ago(at, now) : "some time ago"}`
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
        ? " It held when it was checked."
        : freshness.kind === "unknowable"
          ? " The record does not say what kind of claim this is, so there is no telling whether it still holds."
          : ""),
    at,
    reasked: reading === "stale" ? pulseAsks(held.value, ref) : null,
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
  return [...currentFacts(records, ref).values()].map((held) => ({
    label: held.value.label,
    value: held.value.value,
    mono: held.value.mono,
  }));
}

/**
 * Where the design puts a piece. The map is a fixed bird's-eye layout with a
 * place for the source, the way in, the machine, the application and its
 * data, so the component owns the slot and Pi owns the identity. Keeping them
 * apart is what lets Pi name a host `hetzner-165619823` — a reference it can
 * reuse on every later observation — without the diagram having to guess
 * where that belongs.
 */
/** A door on port 22 is the one Hallvi comes through. */
function sshLooking(
  part: { id: string; kind: string; name: string; role: string },
  records: SavedInformation[],
) {
  if (part.kind !== "gate") return false;
  if (/\bssh\b|\b22\b/i.test(`${part.name} ${part.role}`)) return true;
  return factOf(records, { id: part.id, kind: "gate" }, "port") === "22";
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

type MapPart = Topology["parts"][number];

/**
 * Whether a way in is open, or a port that refuses.
 *
 * The check Pi wrote answers this and nothing else does: the application's own
 * reach is a different question, and reading one as the other is how a
 * database port that refuses from outside would have been counted among the
 * doors that are open.
 */
function admitsOf(
  records: SavedInformation[],
  part: { id: string; kind: Part["kind"] },
): NonNullable<Part["admits"]> {
  const ref = refFor(records, part);
  if (!ref) return "unknown";
  // The newest connection observation decides. A failed `open` check does
  // not establish an open port, and an older refusal cannot overrule a newer
  // successful connection (or vice versa).
  const observation = [...currentChecks(records, ref).entries()].find(
    ([key]) => key === "open" || key === "refused",
  );
  return observation?.[1].value.status === "passed"
    ? observation[0] === "open"
      ? "open"
      : "refused"
    : "unknown";
}

/**
 * What the records know that this application's map does not name.
 *
 * A topology is composition: Pi writes what the application is made of. The
 * machine it runs on, the watcher outside it and the place its copies land
 * are each written down under their own subject instead, which is how Backups
 * could say "Data on hetzner-999999" and Monitoring "Watcher checked 4 min
 * ago" while the map drew a server card with no name on it, no watcher at
 * all, and nothing off the server.
 *
 * Nothing is invented here. Each of these is drawn only because a record
 * states it, and each is drawn under the subject that states it, so its
 * reading, its facts and its freshness are the same ones the destination it
 * links to shows. A subject nobody wrote stays undrawn, and the design's own
 * placeholders keep saying that nobody has looked.
 */
function fromRecords(
  records: SavedInformation[],
  declared: Set<string>,
  /** Part ids the topology already names, so a door is not drawn twice. */
  named: Set<string>,
  now: number,
): MapPart[] {
  const found: MapPart[] = [];
  const stated = (kind: SubjectKind) =>
    subjectsOfKind(records, kind).find((ref) => {
      const presence = presenceOf(records, ref);
      return presence.known && presence.presence === "present";
    });

  if (!declared.has("host")) {
    const ref = stated("host");
    // The reference Pi reuses on every later observation, which is the
    // machine's identity. Its address and size are facts on the card.
    if (ref)
      found.push({
        id: ref.id,
        kind: "host",
        name: ref.id,
        role: "the machine this runs on",
        plain: "the server everything here runs on",
      });
  }

  {
    // Every door, not the first one, and not all-or-nothing either.
    //
    // A map that drew one and said nothing about the other is the map
    // claiming a shape the records contradict — and the one it dropped was
    // the database port, which is the one a reader most wants the state of.
    // Skipping every door the moment the topology declared one had the same
    // effect by a different route: Pi naming one gate silently dropped every
    // other door on record.
    //
    // A way in is a door; Pi may reasonably speak of the tunnel through it as
    // access instead, and the two are the same thing on the map. So whichever
    // Pi chose is read, and not both — the alternative is one way in drawn
    // twice under two names.
    const doors = subjectsOfKind(records, "door");
    const doorIds = new Set(doors.map((ref) => ref.id));
    // A door and an access record with the same id describe one way in;
    // distinct access records still describe distinct ways in.
    const waysIn = [
      ...doors,
      ...subjectsOfKind(records, "access").filter(
        (ref) => !doorIds.has(ref.id),
      ),
    ];
    for (const ref of waysIn) {
      if (named.has(ref.id)) continue;
      const presence = presenceOf(records, ref);
      if (!presence.known || presence.presence !== "present") continue;
      const port = currentFacts(records, ref).get("port")?.value.value;
      found.push({
        id: ref.id,
        kind: "gate",
        name: port ? `Port ${port}` : ref.id,
        // Pi's own sentence about this port, which is what the card's
        // second line and the inspector both read.
        role: presence.record.title,
        plain: presence.record.title,
      });
    }
  }

  if (!declared.has("monitor")) {
    const ref = stated("monitor");
    if (ref) {
      const facts = currentFacts(records, ref);
      const target = facts.get("target")?.value.value;
      const interval = facts.get("interval")?.value.value;
      found.push({
        id: ref.id,
        kind: "monitor",
        // The slot is sized for a sentence: the placeholder that stands here
        // when nothing watches says "Nothing is watching this", and the
        // positive case is worth saying just as plainly.
        name: "Something is watching this",
        role: [
          target
            ? `checks ${target.replace(/^https?:\/\//, "")}`
            : "checks this application",
          interval ? `every ${interval}` : null,
        ]
          .filter(Boolean)
          .join(" "),
        plain:
          "A watcher outside the server checks this application and can tell you when it stops answering.",
      });
    }
  }

  if (!declared.has("offsite")) {
    // Backups' own rule, so the two cannot disagree: where the *newest* copy
    // went, never the union of every copy's destination and never the plan's.
    // An off-site copy from last week does not move this morning's local copy
    // off the server, and an intention to write to object storage is not a
    // transfer that happened.
    const newest = protectionFromRecords(records, now).copies[0];
    if (newest && (newest.kind === "off-site" || newest.kind === "controller"))
      found.push({
        id: newest.id,
        kind: "offsite",
        name: newest.destination ?? "Off the server",
        role: "where the copies go",
        plain: "a place off this server that a copy of your data reached",
      });
  }

  return found;
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
  /** Slots that only describe where the code came from. */
  sources: Set<string>,
): ArchitectureModel["openness"] {
  const access = records
    .filter((record) => !record.retiredAt)
    .map((record) => record.presentation?.content)
    .find((content) => content?.kind === "application-access");
  if (access?.kind === "application-access")
    return access.mode === "private" ? "restricted" : "public";
  // Only edges that describe reaching the running application. An edge from
  // the repository is a build-time relationship — Pi drew "GitHub source →
  // the app" as public, meaning the code is public, and reading that as
  // network reach told the page the application was open to the internet.
  const inbound = edges.filter(
    (edge) => webIds.has(edge.to) && !sources.has(edge.from),
  );
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

  // A slot is a fixed position in the design and a part is Pi's. The first
  // web process is drawn in "app" and the first HTTP gate in "gate:http";
  // a second of either keeps its own reference rather than landing on top of
  // the first, which drew one part over another and left React to report the
  // duplicate key instead of the hidden part.
  const taken = new Set<string>();
  // What Pi mapped, and what the records know that the map did not name.
  const mapParts = [
    ...map.value.parts,
    ...fromRecords(
      records,
      new Set(map.value.parts.map((part) => part.kind)),
      new Set(map.value.parts.map((part) => part.id)),
      now,
    ),
  ];
  const slots = new Map(
    mapParts.map((part) => {
      const wanted = slotFor(part, sshLooking(part, records));
      const slot = taken.has(wanted) ? part.id : wanted;
      taken.add(slot);
      return [part.id, slot];
    }),
  );
  const edges = map.value.edges.map((edge) => ({
    ...edge,
    from: slots.get(edge.from) ?? edge.from,
    to: slots.get(edge.to) ?? edge.to,
  }));

  const parts: Part[] = mapParts.map((part) => {
    const evidence = evidenceFor(records, part, planned, now);
    const facts =
      part.kind === "source"
        ? revision?.kind === "deployment" &&
          !edges.some(
            (edge) =>
              edge.from === slots.get(part.id) &&
              ["gate", "tls"].includes(
                mapParts.find((p) => slots.get(p.id) === edge.to)?.kind ?? "",
              ),
          )
          ? [
              {
                label: "Revision",
                value: revision.revision,
                mono: true,
              },
            ]
          : []
        : factsFor(records, part);
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
      port:
        part.kind === "gate"
          ? (factOf(records, part, "port") ?? undefined)
          : undefined,
      admits: part.kind === "gate" ? admitsOf(records, part) : undefined,
      sources:
        part.kind === "gate"
          ? (factOf(records, part, "sources") ?? undefined)
          : undefined,
      // What a port leads to, from the edge leaving it — the same move the
      // disk edge makes for a volume's owner. Never from the port number or
      // the subject's name: a door Pi called `postgres` is not evidence that
      // PostgreSQL is behind it.
      serves:
        part.kind === "gate"
          ? edges.find((edge) => edge.from === slots.get(part.id))?.to
          : undefined,
      destination: destinations[part.kind as Part["kind"]],
      // Hallvi and the repository have no state of their own to tag.
      quiet: part.kind === "controller" || part.kind === "source",
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
  const hostSubject = mapParts.find((part) => part.kind === "host");
  const headline = web[0]?.name ?? applicationName;
  const openness = opennessOf(
    records,
    edges,
    new Set(web.map((part) => part.id)),
    new Set(of("source").map((part) => part.id)),
  );

  /**
   * Whether anything copies the data off the server — and the difference
   * between nobody having looked and somebody having established that nothing
   * does.
   *
   * Architecture said "has not been assessed" for an application whose records
   * carried a nightly export job, two backup copies and a verified restore.
   * Nobody had failed to look; what they found was that every copy lands on the
   * same host, which is why Storage says nothing is off the server and the
   * application list says "A backup plan, no copy yet". Reporting that as an
   * open question is the softer of the two readings and the wrong one.
   */
  function offServer(records: SavedInformation[]) {
    const looked = ["backup-copy", "backup-plan", "offsite"].some(
      (kind) => subjectsOfKind(records, kind as "backup-copy").length > 0,
    );
    return looked
      ? "Nothing on record copies them off it."
      : "Whether anything copies them off it has not been assessed.";
  }

  const stops = (kinds: Part["kind"][]) =>
    kinds.flatMap((kind) => of(kind).map((part) => part.id));
  const journeys: Journey[] = (
    [
      {
        id: "visit",
        label: "A visit",
        stops: stops(["controller", "gate", "tls", "web", "private"]),
        summary:
          openness === "restricted"
            ? `A visit reaches ${headline} only from the machine running Hallvi.`
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
            ? // What a copy record establishes is that a copy reached the
              // place, not that copies keep reaching it: the newest attempt
              // at the same destination may since have failed, and Backups is
              // where that verdict is read. The map says where, in the tense
              // the evidence supports.
              `${list(volumes.map((part) => part.name))} live on the server, and a copy of them reached ${list(offsite.map((part) => part.name))}.`
            : `${list(volumes.map((part) => part.name))} live on the server. ${offServer(records)}`
          : "No stored data is on record for this application.",
      },
      {
        id: "release",
        label: "A release",
        stops: stops(["source", "controller", "gate", "host", "web"]),
        summary: host
          ? `Hallvi delivers to ${host.name} over the connection it holds.`
          : "No host is on record for this application yet.",
      },
    ] satisfies Journey[]
  ).filter((journey) => journey.stops.length >= 1);

  // The application's own reading, as three separate questions.
  const applicationRef: Ref = { kind: "application", id: applicationId };
  const own = [...currentChecks(records, applicationRef).values()];
  const readings = own.map((held) => checkAsNow(held.value, held.record, now));
  const condition: ArchitectureModel["condition"] = planned
    ? {
        certainty: "planned",
        text: "Nothing has run yet; this is the intended shape.",
      }
    : readings.includes("failed")
      ? {
          certainty: "failed",
          text: "A check on the application did not pass.",
        }
      : readings.includes("stale")
        ? {
            certainty: "stale",
            text: "It held when it was last checked.",
          }
        : readings.includes("verified")
          ? {
              certainty: "verified",
              text: "The application's own checks held when they were last read.",
            }
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
    edges,
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
