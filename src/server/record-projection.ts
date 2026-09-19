// Reading records is not writing them.
//
// Pi writes partial observations: a record says what Pi looked at this time
// and deliberately does not restate what it did not. So "the current state of
// the host" is not a record — it is assembled, key by key, from the newest
// record carrying each key. Every view needs that assembly, and if each one
// did it for itself some of them would get it wrong in ways a reader cannot
// see. So it happens once, here.
//
// Three questions that look like one and are not:
//
//   Presence — is the thing there? Only a record speaking for a subject can
//   say. No record means nobody looked, which is never the same as "none".
//
//   Outcome — did what ran pass? `failed` and `warning` are judgements and
//   survive everything, including time.
//
//   Freshness — is the claim still worth trusting? This depends on the claim
//   being drawn, not on the subject, and on whether the view is showing
//   evidence about now or the recorded outcome of an event. The same check
//   reads verified on Deployment and stale in Overview an hour later, and
//   both are right.
//
// Nothing here invents a fact. A missing input reads unknown — never healthy,
// and never absent.

import {
  subjectKinds,
  type Claim,
  type Ref,
  type SavedInformation,
  type SubjectKind,
} from "./operator-data";

type Presentation = NonNullable<SavedInformation["presentation"]>;
export type RecordCheck = Presentation["checks"][number];
export type RecordFact = NonNullable<Presentation["facts"]>[number];
export type Topology = Extract<
  NonNullable<Presentation["content"]>,
  { kind: "topology" }
>;

/**
 * How long a claim is worth trusting. Arithmetic, which is why it lives in
 * the reading layer and not in anything Pi writes: choosing the claim is
 * semantic and Pi's, choosing the number is not.
 *
 * `identity` never expires because a thing whose identity changed is a
 * different thing — a rebuilt host is a new presence epoch, not an aged fact.
 */
const expiry: Record<Claim, number> = {
  identity: Number.POSITIVE_INFINITY,
  configuration: 7 * 24 * 60 * 60 * 1000,
  contents: 3 * 24 * 60 * 60 * 1000,
  reachability: 12 * 60 * 60 * 1000,
  liveness: 15 * 60 * 1000,
};

/** The subject kinds, re-exported so components can name one in a table. */
export type SubjectKindOf = SubjectKind;

export function refKey(ref: Ref) {
  return `${ref.kind}:${ref.id}`;
}

/**
 * When a record's content is as of. `establishedAt` is when Pi gathered the
 * evidence; a record with none established nothing, and nothing in it ever
 * ages, because it never started.
 */
function asOf(record: SavedInformation) {
  return record.establishedAt ?? record.createdAt;
}

function newestFirst(a: SavedInformation, b: SavedInformation) {
  return (
    Date.parse(asOf(b)) - Date.parse(asOf(a)) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
}

/**
 * Records speaking for a subject, newest first. A retired record leaves every
 * current read — the previous record carrying a key becomes current again —
 * but it stays in the series, so a reader can still see that Pi said it and
 * took it back.
 */
function stating(records: SavedInformation[], ref: Ref) {
  const key = refKey(ref);
  return records
    .filter(
      (record) =>
        !record.retiredAt &&
        record.presentation?.states &&
        refKey(record.presentation.states.ref) === key,
    )
    .sort(newestFirst);
}

/**
 * Every subject of a kind that any record speaks for, newest statement
 * first. This is how a destination finds what it is about: Pi names things,
 * the page does not have a list of them in advance.
 *
 * A subject stated `absent` is still returned — a volume that used to be
 * there is information, and a page that silently dropped it would be
 * reporting an absence as if nobody had looked.
 */
export function subjectsOfKind(records: SavedInformation[], kind: SubjectKind) {
  const seen = new Map<string, Ref>();
  for (const record of records
    .filter((item) => !item.retiredAt)
    .sort(newestFirst)) {
    const ref = record.presentation?.states?.ref;
    if (ref?.kind === kind && !seen.has(ref.id)) seen.set(ref.id, ref);
  }
  return [...seen.values()];
}

/**
 * Every subject of a kind that any record *mentions*: one it speaks for, one
 * a check was about, or one it lists in `about`.
 *
 * A destination needs this rather than only the stated ones, because a
 * deployment legitimately says "the http check passed, about process:web"
 * without speaking for that process — the deployment is an event and states
 * nothing. Reading only stated subjects made the Processes page empty for an
 * application whose every check named a process by id.
 *
 * Mentioning is not presence. A subject found only this way has
 * `presenceOf` → not known, and the page says nobody has stated whether it is
 * there, which is exactly the situation.
 */
export function subjectsMentioned(
  records: SavedInformation[],
  kind: SubjectKind,
) {
  const seen = new Map<string, Ref>();
  const add = (ref: Ref | undefined) => {
    if (ref?.kind === kind && !seen.has(ref.id)) seen.set(ref.id, ref);
  };
  for (const record of records
    .filter((item) => !item.retiredAt)
    .sort(newestFirst)) {
    add(record.presentation?.states?.ref);
    for (const ref of record.presentation?.about ?? []) add(ref);
    for (const check of record.presentation?.checks ?? []) add(check.about);
  }
  return [...seen.values()];
}

export type Presence =
  | { known: false }
  | {
      known: true;
      presence: "present" | "absent";
      record: SavedInformation;
    };

/** Presence of a subject: the newest record stating it, and what it said. */
export function presenceOf(records: SavedInformation[], ref: Ref): Presence {
  const [newest] = stating(records, ref);
  const states = newest?.presentation?.states;
  if (!states) return { known: false };
  return { known: true, presence: states.presence, record: newest };
}

/**
 * A key for assembly. Records written before the contract carry no `key`, so
 * their label stands in — which keeps the deployment already on record
 * assembling correctly. New writes are required to carry a real one.
 */
function keyOf(item: { key?: string; label: string }) {
  return item.key ?? item.label;
}

export interface Held<T> {
  value: T;
  /** The record it came from, which is also what dates it. */
  record: SavedInformation;
}

/**
 * Current facts of a subject, assembled key by key: the newest record
 * carrying each key wins, and each value keeps the record it came from, which
 * is what dates it and cites its evidence.
 *
 * A record that says only "SSH answered" therefore leaves the earlier
 * location and size standing — they were never contradicted, and Pi
 * correctly did not re-assert what it did not re-observe. A replaced machine
 * cannot inherit anything, because a new machine is a new identity and so a
 * different subject.
 */
export function currentFacts(records: SavedInformation[], ref: Ref) {
  const held = new Map<string, Held<RecordFact>>();
  for (const record of stating(records, ref))
    for (const fact of record.presentation?.facts ?? [])
      if (!held.has(keyOf(fact)))
        held.set(keyOf(fact), { value: fact, record });
  return held;
}

/** Newest observation per key, from a subject record or an event. */
export function currentChecks(records: SavedInformation[], ref: Ref) {
  const held = new Map<string, Held<RecordCheck>>();
  const key = refKey(ref);
  for (const record of records
    .filter((item) => !item.retiredAt)
    .sort(newestFirst)) {
    for (const check of record.presentation?.checks ?? []) {
      const subject = check.about ?? record.presentation?.states?.ref;
      if (subject && refKey(subject) === key && !held.has(keyOf(check)))
        held.set(keyOf(check), { value: check, record });
    }
  }
  return held;
}

/** Every record stating a subject, oldest first, withdrawals included. */
export function seriesFor(records: SavedInformation[], ref: Ref) {
  const key = refKey(ref);
  return records
    .filter(
      (record) =>
        record.presentation?.states &&
        refKey(record.presentation.states.ref) === key,
    )
    .sort((a, b) => -newestFirst(a, b))
    .map((record) => ({ record, withdrawn: Boolean(record.retiredAt) }));
}

/** Everything that touched a subject: `about` as well as `states`. */
export function everythingAbout(records: SavedInformation[], ref: Ref) {
  const key = refKey(ref);
  return records
    .filter(
      (record) =>
        (record.presentation?.states &&
          refKey(record.presentation.states.ref) === key) ||
        (record.presentation?.about ?? []).some((item) => refKey(item) === key),
    )
    .sort(newestFirst);
}

export type Freshness =
  /** Nothing was established, so it never ages. */
  | { kind: "never-established" }
  /** No claim on the item, so there is no horizon to judge it by. */
  | { kind: "unknowable"; at: string }
  | { kind: "fresh"; at: string }
  | { kind: "stale"; at: string };

/** How long one claim is believed, in ms; null when nothing says. */
export function horizonOf(item: { claim?: Claim; freshFor?: number }) {
  return item.freshFor
    ? item.freshFor * 1000
    : item.claim
      ? expiry[item.claim]
      : null;
}

/**
 * Freshness of one claim, asked for by the component drawing it. The same
 * host record is fresh in Deployment's identity row and stale in Overview's
 * reachability lane, and neither reading changes what is stored.
 */
export function freshnessOf(
  item: { claim?: Claim; freshFor?: number },
  record: SavedInformation,
  now: number,
): Freshness {
  if (!record.establishedAt) return { kind: "never-established" };
  const at = record.establishedAt;
  const horizon = horizonOf(item);
  if (horizon === null) return { kind: "unknowable", at };
  return now - Date.parse(at) < horizon
    ? { kind: "fresh", at }
    : { kind: "stale", at };
}

/**
 * A check read as **evidence about now** — an Overview lane, a part's tag on
 * the map. Ageing never turns green into red: a passed check that has gone
 * out of window is stale and amber, and only a check that ran and failed is
 * red. A note makes no claim, so it never ages.
 */
export function checkAsNow(
  check: RecordCheck,
  record: SavedInformation,
  now: number,
): "verified" | "stale" | "failed" | "noted" | "recorded" {
  if (check.status === "failed") return "failed";
  if (check.status === "info") return "noted";
  const freshness = freshnessOf(check, record, now);
  if (freshness.kind === "fresh") return "verified";
  if (freshness.kind === "stale") return "stale";
  // Nothing established, or no claim to age it by: say it was recorded
  // rather than imply it still holds.
  return "recorded";
}

/**
 * A check read as the **recorded outcome of an event** — Deployment's check
 * list, History's result. It keeps what it reported, whatever the clock has
 * done since, and the component shows the observation time beside it.
 */
export function checkAsRecorded(
  check: RecordCheck,
): "passed" | "failed" | "noted" {
  return check.status === "failed"
    ? "failed"
    : check.status === "info"
      ? "noted"
      : "passed";
}

export type Reading = "failed" | "warning" | "stale" | "verified" | "unknown";

/**
 * Pi's judgements and the checks' readings, worst first. A failed judgement
 * or check outranks everything and never ages; a warning is a judgement that
 * outranks a passing check on the same record; one stale claim makes the
 * whole stale, because reporting "verified" on the strength of the freshest
 * check would hide the one that has lapsed.
 */
export function worstReading(
  judgements: (string | undefined)[],
  readings: ReturnType<typeof checkAsNow>[],
): Reading {
  if (judgements.includes("failed") || readings.includes("failed"))
    return "failed";
  if (judgements.includes("warning")) return "warning";
  if (readings.includes("stale")) return "stale";
  if (readings.includes("verified")) return "verified";
  return "unknown";
}

/**
 * The application's condition, from every subject its records mention — the
 * list's card and Overview's headline both ask this, so they cannot disagree.
 *
 * Every subject, not only the application: a check that failed on its domain
 * is the application in trouble, whichever subject it was filed under. For
 * each subject only the newest record with a decisive judgement counts, so an
 * informational observation cannot clear a failure and a verified recovery
 * replaces an older one. Events state no subject and judge nothing current.
 */
export function applicationReading(
  records: SavedInformation[],
  applicationId: string,
  now: number,
) {
  const refs = new Map<string, Ref>(
    [
      { kind: "application" as const, id: applicationId },
      ...subjectKinds.flatMap((kind) => subjectsMentioned(records, kind)),
    ].map((ref) => [refKey(ref), ref]),
  );
  const decisive = records.filter((record) =>
    ["failed", "warning", "verified"].includes(
      record.presentation?.status ?? "",
    ),
  );
  const judgements = [...refs.values()].flatMap((ref) => {
    const presence = presenceOf(decisive, ref);
    return presence.known ? [presence.record] : [];
  });
  const checks = [...refs.values()].flatMap((ref) => [
    ...currentChecks(records, ref).values(),
  ]);
  const reading = worstReading(
    judgements.map((record) => record.presentation?.status),
    checks.map((item) => checkAsNow(item.value, item.record, now)),
  );
  return { reading, judgements, checks };
}

export type Tag =
  "verified" | "stale" | "failed" | "warning" | "info" | "recorded";

/**
 * A card's headline tag: the record's own status, aged by the soonest
 * expiring claim among the items that card is showing — never an average.
 * `failed` and `warning` pass through unaged, because a failure does not age
 * into doubt and a judgement that something wants looking at stays true.
 *
 * A card showing only identity facts never goes stale; the same record in a
 * reachability lane goes stale in twelve hours.
 */
export function tagFor(
  record: SavedInformation,
  shown: { claim?: Claim; freshFor?: number }[],
  now: number,
): Tag {
  const status = record.presentation?.status ?? "info";
  if (status === "failed" || status === "warning") return status;
  if (status !== "verified") return record.establishedAt ? "info" : "recorded";
  if (!record.establishedAt) return "recorded";
  const horizons = shown.map((item) =>
    item.freshFor
      ? item.freshFor * 1000
      : item.claim
        ? expiry[item.claim]
        : null,
  );
  // An item with no claim gives no horizon; if nothing shown has one there is
  // no arithmetic to do and the record stands as recorded.
  const known = horizons.filter((value): value is number => value !== null);
  if (!known.length) return "recorded";
  const soonest = Math.min(...known);
  return now - Date.parse(record.establishedAt) >= soonest
    ? "stale"
    : "verified";
}

export type Lane = "checks" | "backups" | "server" | "access";

/**
 * Which of Overview's four lanes a subject belongs to.
 *
 * A volume belongs to the application, not to Backups: surviving a restart is
 * the application keeping its own data, and nothing was copied anywhere. Only
 * a backup plan — and the copies and restores that reference one — speaks to
 * whether a copy exists off the machine. The earlier mapping would have shown
 * a green Backups lane on the strength of a restart test.
 */
const lanes: Partial<Record<SubjectKind, Lane>> = {
  application: "checks",
  process: "checks",
  volume: "checks",
  // All three, because the lane's question is "is my data safe" and a plan
  // alone cannot answer it. A plan says copies are meant to happen, a copy
  // says one exists, and a restore test is the only one that says recovery
  // works. Reading only the plan let a passing timer check speak for all
  // three.
  "backup-plan": "backups",
  "backup-copy": "backups",
  "restore-test": "backups",
  host: "server",
  access: "access",
  door: "access",
  certificate: "access",
};

export function laneOf(ref: Ref | undefined): Lane | null {
  return ref ? (lanes[ref.kind] ?? null) : null;
}

/**
 * A check's lane comes from what it was about, or else from the subject its
 * record speaks for. `record.about` is never consulted: it is unordered, so
 * no element of it was ever worth privileging.
 */
export function lane(
  check: RecordCheck,
  record: SavedInformation,
): Lane | null {
  return laneOf(check.about ?? record.presentation?.states?.ref);
}

/** A check reaches a timeline only if it has a lane and a time. */
export function timelineWorthy(check: RecordCheck, record: SavedInformation) {
  return lane(check, record) !== null && record.establishedAt !== null;
}

/**
 * The map: the newest topology on a record stating this application. One per
 * application, and its parts carry no state — a part's state is the newest
 * record stating that part, so the map can never contradict the page a
 * reader clicks through to.
 */
export function topologyOf(
  records: SavedInformation[],
  applicationId: string,
): Held<Topology> | null {
  const ref: Ref = { kind: "application", id: applicationId };
  for (const record of stating(records, ref)) {
    const content = record.presentation?.content;
    if (content?.kind === "topology") return { value: content, record };
  }
  return null;
}

export type Deployment = Extract<
  NonNullable<Presentation["content"]>,
  { kind: "deployment" }
>;
export interface ReleasedService {
  /** The `process` subject this image runs as, when the record says. */
  process: string | null;
  /** What was asked for: a tag, which can change under you. */
  image: string;
  /** What actually ran, when it is known. */
  digest: string | null;
}

/**
 * What a release put on the server, in one shape.
 *
 * A release used to name one image, so a two-service release could only be
 * recorded as one of them — Prometheus's digest stored against a Grafana
 * deployment. `services` says it properly. This reads either, so no view has
 * to know which shape it got, and a record written before `services` existed
 * still answers the question it was always answering.
 */
export function releasedServices(content: Deployment): ReleasedService[] {
  if (content.services?.length)
    return content.services.map((service) => ({
      process: service.process,
      image: service.image,
      digest: service.digest ?? digestIn(service.image),
    }));
  if (content.image)
    return [
      {
        process: null,
        image: content.image,
        digest: digestIn(content.image),
      },
    ];
  return [];
}

/** A digest pinned inside a reference — `name@sha256:…` — is still a digest. */
function digestIn(image: string) {
  const [, digest] = image.split("@");
  return digest?.startsWith("sha256:") ? digest : null;
}
