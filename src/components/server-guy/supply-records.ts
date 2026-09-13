"use client";

// Cache & queue, Jobs, Environment Variables and CDN, built from records.
//
// Four destinations, one projection, because they read overlapping subjects
// and each is small: a broker and its queue, the jobs that repeat, the
// configuration a release needs, and whether anything caches in front. They
// stay four *views* — each page reads the slice it draws and nothing else.
//
// Two rules this file exists to keep:
//
//   The value of a variable is never here, and there is no path by which it
//   could be. A requested secret is in a sealed store with no read route to a
//   page; an ordinary variable's value was never recorded at all.
//
//   A next run is recorded, never computed. Parsing a cron expression against
//   a timezone the controller is guessing at produces a confident time that is
//   wrong twice a year, and the page cannot show that it guessed.

import type { SavedInformation } from "@/server/operator-data";
import {
  currentChecks,
  currentFacts,
  presenceOf,
  seriesFor,
  subjectsOfKind,
  topologyOf,
} from "@/server/record-projection";

import { protectionFromRecords } from "./backups-records";
import type { SecretRequest } from "./secret-request";
import type {
  Broker,
  ConfigFile,
  JobLine,
  QueueLine,
  Recurring,
  SupplyView,
  Value,
  Waiting,
} from "./supply-prototype/supply-story";

/**
 * A count Pi wrote, which may carry thousands separators or a word after it.
 * `Number("1,204")` is NaN, and the page printed "NaN tasks waiting".
 * Anything that is not a number reads as unmeasured, never as zero.
 */
const count = (value: string | null) => {
  if (value === null) return null;
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const size = Number(match[0]);
  return Number.isFinite(size) ? size : null;
};

const seconds = (value: string | null) => {
  if (!value) return null;
  const match = value.replace(/,/g, "").match(/([\d.]+)\s*(s|m|min|h)?/i);
  if (!match) return null;
  const size = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();
  return size * (unit.startsWith("h") ? 3600 : unit.startsWith("m") ? 60 : 1);
};

export function supplyFromRecords({
  records,
  applicationId,
  applicationName,
  secrets,
  now,
}: {
  records: SavedInformation[];
  applicationId: string;
  applicationName: string;
  /** What Pi asked the owner for. Names and states; never values. */
  secrets: SecretRequest[];
  now: number;
}): SupplyView {
  const live = records.filter((record) => !record.retiredAt);
  const map = topologyOf(live, applicationId)?.value ?? null;
  const partOf = (id: string) => map?.parts.find((part) => part.id === id);

  const release = live
    .filter((record) => record.presentation?.content?.kind === "deployment")
    .sort(
      (a, b) =>
        Date.parse(b.establishedAt ?? b.createdAt) -
        Date.parse(a.establishedAt ?? a.createdAt),
    )[0];
  const deployment = release?.presentation?.content;

  // ---- The brokers, and the queues they hold.
  const brokers: Broker[] = subjectsOfKind(live, "cache")
    .filter((ref) => {
      const presence = presenceOf(live, ref);
      return !(presence.known && presence.presence === "absent");
    })
    .map((ref) => {
      const facts = currentFacts(live, ref);
      const fact = (key: string) => facts.get(key)?.value.value ?? null;
      const port = fact("port");
      return {
        name: ref.id,
        product: [fact("engine") ?? ref.id, fact("version")]
          .filter(Boolean)
          .join(" "),
        role: partOf(ref.id)?.role ?? "A broker the application talks to",
        persistence: fact("persistence"),
        reach: port
          ? `Port ${port} · inside the server only`
          : "No port recorded",
      };
    });

  // A worker is a process whose recorded role says it does work in the
  // background. "Private in the topology" is not that: a database is private
  // and is not a worker, and reading it that way put PostgreSQL and Valkey on
  // the page as the two things taking from Paperless's Celery queue.
  const workers = subjectsOfKind(live, "process")
    .filter((ref) =>
      /\b(worker|workers|background|queue|jobs?)\b/i.test(
        currentFacts(live, ref).get("role")?.value.value ?? "",
      ),
    )
    // The owner's word for it, not the reference Pi reuses between records.
    .map(
      (ref) =>
        currentFacts(live, ref).get("product")?.value.value ??
        partOf(ref.id)?.name ??
        ref.id,
    );

  const queues: QueueLine[] = subjectsOfKind(live, "queue")
    .filter((ref) => {
      const presence = presenceOf(live, ref);
      return !(presence.known && presence.presence === "absent");
    })
    .map((ref) => {
      const facts = currentFacts(live, ref);
      const fact = (key: string) => facts.get(key)?.value.value ?? null;
      const depth = facts.get("depth");
      return {
        library: fact("library") ?? ref.id,
        backedBy: fact("backend") ?? brokers[0]?.product ?? "Not recorded",
        workers: (fact("workers") ?? "").split(/[,\s]+/).filter(Boolean),
        // A queue nobody has measured is not a queue with nothing in it.
        backlog: depth ? count(depth.value.value) : null,
        oldestSeconds: seconds(fact("oldest")),
        failedLastHour: count(fact("failed")),
        at: depth?.record.establishedAt ?? null,
      };
    });

  // ---- The jobs, and what each one last did.
  const jobs: JobLine[] = [];
  const runs: SupplyView["runs"] = [];
  for (const ref of subjectsOfKind(live, "job")) {
    const presence = presenceOf(live, ref);
    if (presence.known && presence.presence === "absent") continue;
    const facts = currentFacts(live, ref);
    const fact = (key: string) => facts.get(key)?.value.value ?? null;
    const ran = currentChecks(live, ref).get("ran");
    jobs.push({
      name: ref.id,
      command: fact("command") ?? "Not recorded",
      schedule: fact("schedule") ?? "Not recorded",
      timezone: fact("timezone") ?? "the server's clock",
      // Recorded, never computed from the schedule.
      nextAt: fact("next-run"),
      paused: fact("paused") === "yes",
      last:
        ran && ran.record.establishedAt
          ? {
              outcome: ran.value.status === "failed" ? "failed" : "succeeded",
              at: ran.record.establishedAt,
              seconds: seconds(fact("took")),
            }
          : null,
    });
    for (const { record, withdrawn } of seriesFor(live, ref)) {
      if (withdrawn || !record.establishedAt) continue;
      for (const item of record.presentation?.checks ?? [])
        if (item.key === "ran")
          runs.push({
            id: record.id,
            jobName: ref.id,
            outcome: item.status === "failed" ? "failed" : "succeeded",
            at: record.establishedAt,
          });
    }
  }

  // ---- The configuration. Names, sources and whether a value exists.
  const values: Value[] = subjectsOfKind(live, "variable")
    .filter((ref) => {
      const presence = presenceOf(live, ref);
      return !(presence.known && presence.presence === "absent");
    })
    .map((ref) => {
      const facts = currentFacts(live, ref);
      const fact = (key: string) => facts.get(key)?.value.value ?? null;
      const asked = secrets.find((item) => item.name === ref.id);
      const scope = fact("scope");
      const source = fact("source") ?? (asked ? "Supplied by you" : null);
      return {
        id: ref.id,
        name: ref.id,
        service: scope ?? "",
        // The application when the map does not know the scope: echoing the
        // id back reads "shop-web · shop-web", which says nothing twice.
        product: (scope ? partOf(scope)?.name : null) ?? applicationName,
        who: asked
          ? ("you" as const)
          : source && /generat/i.test(source)
            ? ("generated" as const)
            : source && /connect/i.test(source)
              ? ("connection" as const)
              : ("plan" as const),
        // A secret is held by the controller; an ordinary value is in the
        // release. Either way its content is not here.
        held: Boolean(asked),
        where: asked
          ? "Kept sealed on this computer; put in as the command runs"
          : (source ?? "Not recorded"),
        why: asked?.why ?? null,
        pending: asked ? !asked.establishedAt : fact("established") === "no",
      };
    });

  // Something asked for that nobody has supplied is a gap the page shows even
  // before a `variable` record exists for it — the request is itself evidence.
  const named = new Set(values.map((value) => value.name));
  const waiting: Waiting[] = secrets
    .filter((secret) => !secret.establishedAt)
    .map((secret) => ({ name: secret.name, reason: secret.why }));
  for (const secret of secrets)
    if (!named.has(secret.name))
      values.push({
        id: secret.name,
        name: secret.name,
        service: secret.process ?? "",
        product:
          (secret.process ? partOf(secret.process)?.name : null) ??
          applicationName,
        who: "you",
        held: true,
        where: secret.establishedAt
          ? "Kept sealed on this computer; put in as the command runs"
          : "Waiting for you",
        why: secret.why,
        pending: !secret.establishedAt,
      });

  // ---- Where it is served from, and whether anything caches in front.
  const host = subjectsOfKind(live, "host")[0] ?? null;
  const hostFacts = host ? currentFacts(live, host) : null;
  const access = live.find(
    (record) => record.presentation?.content?.kind === "application-access",
  );
  const cdnRef = subjectsOfKind(live, "cdn")[0] ?? null;
  const cdnPresence = cdnRef ? presenceOf(live, cdnRef) : null;
  const cdnFacts = cdnRef ? currentFacts(live, cdnRef) : null;
  const cdnChecks = cdnRef ? currentChecks(live, cdnRef) : null;
  const caching = cdnChecks?.get("caching") ?? null;
  // A cache in front and a working origin behind it are two facts, and only
  // the second one decides what a visitor gets. Kept apart so a page cannot
  // report "cached by Cloudflare" as though it meant the site is up.
  const originCheck = cdnChecks?.get("origin-reachable") ?? null;

  const protection = protectionFromRecords(live, now);
  const recurring: Recurring[] = protection.schedules.map((schedule) => ({
    id: schedule.id,
    title: "Backups",
    words: protection.summary.schedule?.words ?? schedule.detail,
    detail: schedule.detail,
    at: schedule.at,
    where: "backups",
  }));

  return {
    name: applicationName,
    revision:
      deployment?.kind === "deployment"
        ? deployment.revision.slice(0, 7)
        : null,
    appliedAt: release?.establishedAt ?? null,
    values,
    // No subject records a config file yet, and a page must not invent one.
    files: [] as ConfigFile[],
    waiting,
    place: hostFacts?.get("region")?.value.value ?? null,
    machine: host?.id ?? null,
    address: access?.presentation?.url ?? null,
    cdn: {
      on:
        Boolean(cdnPresence?.known && cdnPresence.presence === "present") &&
        caching?.value.status !== "failed",
      provider: cdnFacts?.get("provider")?.value.value ?? null,
      origin: cdnFacts?.get("origin")?.value.value ?? null,
      // The machine card underneath names this application's own server, so
      // an origin that is a different address has to be called out or the
      // two read as one.
      concern: (() => {
        const origin = cdnFacts?.get("origin")?.value.value ?? null;
        const address = hostFacts?.get("address")?.value.value ?? null;
        return origin && address && origin !== address
          ? `It forwards to ${origin}, which is not ${address} — this application's server.`
          : null;
      })(),
      originReachable: !originCheck
        ? "unchecked"
        : originCheck.value.status === "failed"
          ? "no"
          : "yes",
      detail:
        cdnPresence?.known && cdnPresence.presence === "absent"
          ? "Nothing caches in front of this application."
          : !cdnRef
            ? "Nobody has looked at whether a cache sits in front."
            : originCheck?.value.status === "failed"
              ? (originCheck.value.detail ??
                "The cache is in front, and it cannot get an answer out of the origin behind it.")
              : (cdnFacts?.get("covers")?.value.value ??
                "What it covers has not been recorded."),
    },
    brokers,
    queues,
    workers,
    jobs,
    runs: runs.sort((a, b) => b.at.localeCompare(a.at)),
    recurring,
    invented: null,
  };
}
