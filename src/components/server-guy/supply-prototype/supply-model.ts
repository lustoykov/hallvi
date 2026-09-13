// PROTOTYPE · opus-ui-improvements · throwaway.
// What the four remaining pages say: the configuration this application was
// given (Variables), the one machine that answers every request (CDN), the
// cache and queue it does not have (Cache & queue), and what recurs on this
// server (Jobs). Three of the four are about something the application does
// not have, which is the honest answer for most applications: each says why
// it is absent from the record, and what it would take. Built on the story
// the Processes page reads (stack-model.ts). Nothing here contacts a host.

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";

import { ago, CITIES, productName } from "../architecture-prototype/model";
import {
  buildStackStory,
  when,
  type StackStory,
} from "../stack-prototype/stack-model";

export { when, ago };

/** Who decided a value. */
// The seven the Manifest, Origin, Queue and Rota designs draw are shared
// with the records path, so they live beside those designs.
export type {
  Broker,
  ConfigFile,
  Decider,
  JobLine,
  QueueLine,
  Recurring,
  Value,
  Waiting,
} from "./supply-story";
import type {
  Broker,
  ConfigFile,
  JobLine,
  QueueLine,
  Recurring,
  Value,
  Waiting,
} from "./supply-story";

export interface SupplyStory extends StackStory {
  revision: string | null;
  appliedAt: string | null;
  values: Value[];
  files: ConfigFile[];
  waiting: Waiting[];
  /** Where the one machine is. */
  place: string | null;
  machine: string | null;
  address: string | null;
  cdn: {
    on: boolean;
    provider: string | null;
    detail: string;
  };
  brokers: Broker[];
  queues: QueueLine[];
  workers: string[];
  jobs: JobLine[];
  runs: { id: string; jobName: string; outcome: string; at: string }[];
  recurring: Recurring[];
  /** The scenario that invented part of this, in words. */
  invented: string | null;
}

/** "0600", as the host writes it. */
const modeOf = (mode: number) => `0${mode.toString(8).slice(-3)}`;
/** The exact size of base64 content, without decoding it. */
const sizeOf = (content: string) => {
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.max(0, (content.length / 4) * 3 - padding);
};
export const sizeWords = (bytes: number) =>
  bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} kB`;
export const waitWords = (seconds: number) =>
  seconds < 90 ? `${Math.round(seconds)} s` : `${Math.round(seconds / 60)} min`;

export function buildSupplyStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
  /** "equipped" invents the cache, queue, job and CDN this record lacks. */
  invent: "equipped" | null;
}): SupplyStory {
  const { record, stack, facts, now, invent } = input;
  const base = buildStackStory(input);
  const release = currentFacts(record);
  const native = record?.native ?? null;
  const resolved = native?.resolved ?? null;
  const inputs = new Set(native?.inputs ?? []);
  const reasons = native?.inputReasons ?? {};
  const pinnedOf = (name: string) =>
    release?.services.find((service) => service.name === name)?.pinned ?? null;
  const productOf = (name: string) =>
    base.processes.find((process) => process.name === name)?.product ??
    productName(pinnedOf(name) ?? undefined, name);

  // ---- The names and values the plan gives each process. A private value
  // only ever appears as ${NAME}; the value itself is on the host.
  const values: Value[] = Object.entries(resolved?.services ?? {}).flatMap(
    ([service, definition]) =>
      Object.entries(definition.environment ?? {}).map(([name, raw]) => {
        const text = raw == null ? "" : String(raw);
        const held = inputs.has(name) || /^\$\{[^}]+\}$/.test(text);
        return {
          id: `${service}:${name}`,
          name,
          service,
          product: productOf(service),
          who: held ? ("you" as const) : ("plan" as const),
          held,
          where: held
            ? "Held on the host"
            : `In the repository at ${record?.revision?.slice(0, 8) ?? "the recorded revision"}`,
          why: reasons[name] ?? null,
          pending: false,
        };
      }),
  );

  // ---- Configuration that is a file: written beside the containers and
  // mounted into them, never printed here.
  const files: ConfigFile[] = (native?.files ?? []).map((file) => {
    const mount = Object.entries(resolved?.services ?? {}).flatMap(
      ([service, definition]) =>
        (definition.volumes ?? [])
          .filter(
            (item) =>
              item.type === "bind" &&
              item.source?.replace(/^\.\//, "") === file.path,
          )
          .map((item) => ({
            service,
            target: item.target,
            readOnly: Boolean(item.read_only),
          })),
    )[0];
    return {
      id: file.path,
      name: file.path.replace(/^configs\//, ""),
      service: mount?.service ?? "the host",
      product: mount ? productOf(mount.service) : "Nothing recorded",
      target: mount?.target ?? "Not mounted by any process on record",
      readOnly: mount?.readOnly ?? false,
      bytes: sizeOf(file.content),
      mode: modeOf(file.mode),
      sha: file.sha256.slice(0, 12),
    };
  });

  // ---- Where the one machine is.
  const offer = record?.offer ?? null;
  const city = offer ? CITIES[offer.location] : undefined;
  const place = offer
    ? city
      ? `${city[0]}, ${city[1]}`
      : offer.location
    : null;
  const cdnFacts = facts.domains?.cdn;
  const cdnOn = cdnFacts?.state === "active" || cdnFacts?.state === "partial";

  // ---- What is beside the application, and what it carries.
  const brokers: Broker[] = stack.services.map((service) => ({
    name: service.name,
    product: `${service.kind === "valkey" ? "Valkey" : "Redis"}${service.version ? ` ${service.version}` : ""}`,
    role:
      service.role === "broker"
        ? "Queue broker"
        : service.role === "cache"
          ? "Cache"
          : "Cache and broker",
    persistence: service.persistence ?? null,
    reach: "Private · only processes on the server reach it",
  }));
  const observed = facts.jobs?.queues ?? [];
  const workers = base.processes
    .filter((process) => process.role === "worker")
    .map((process) => process.name);
  const queues: QueueLine[] = stack.queues.map((queue) => {
    const seen = observed.find((item) => item.library === queue.library);
    return {
      library: queue.library,
      backedBy:
        queue.backend === "redis"
          ? (brokers[0]?.product ?? "the Redis-compatible service")
          : "PostgreSQL · the application’s own database",
      workers: queue.workers,
      backlog: seen?.backlog ?? null,
      oldestSeconds: seen?.oldestWaitingSeconds ?? null,
      failedLastHour: seen?.failedLastHour ?? null,
      at: seen?.observedAt ?? null,
    };
  });

  // ---- The application's scheduled commands, and what recurs instead.
  const jobs: JobLine[] = stack.jobs.map((job) => ({
    name: job.name,
    command: job.command,
    schedule: job.schedule,
    timezone: job.timezone,
    nextAt: job.nextRunAt ?? null,
    paused: Boolean(job.paused),
    last: job.lastRun
      ? {
          outcome: job.lastRun.outcome,
          at: job.lastRun.at,
          seconds: job.lastRun.durationSeconds ?? null,
        }
      : null,
  }));
  const runs = (facts.jobs?.runs ?? []).map((run) => ({
    id: run.id,
    jobName: run.jobName,
    outcome: run.outcome,
    at: run.startedAt,
  }));
  const keep = base.protection.keep;
  const recurring: Recurring[] = base.protection.schedule
    ? [
        {
          id: "backup",
          title: "Server Guy’s own backup",
          words: base.protection.schedule.words,
          detail: `The host copies this application’s data off the server${keep ? `, keeping the latest ${keep}` : ""}. The record does not say at what hour it runs, only that it was set up.`,
          at: base.protection.schedule.at,
          where: "backups",
        },
      ]
    : [];

  const invented = invent === "equipped";
  // The invented job runs at 03:30; its next and last run follow from that.
  const nextRun = new Date(now);
  nextRun.setHours(3, 30, 0, 0);
  if (nextRun.getTime() <= now) nextRun.setDate(nextRun.getDate() + 1);
  const lastRun = new Date(nextRun.getTime() - 86_400_000);
  return {
    ...base,
    revision: record?.revision ?? null,
    appliedAt: base.verifiedAt,
    values: invented
      ? values.map((value, index) =>
          index === 0 ? { ...value, pending: true } : value,
        )
      : values,
    files,
    waiting: invented
      ? [
          {
            name: "GF_SMTP_PASSWORD",
            reason:
              "Needed before Grafana can send alert email; nothing is sent until it is provided.",
          },
        ]
      : (facts.variables?.pending ?? []).map((item) => ({
          name: item.name,
          reason: item.reason,
        })),
    place,
    machine: offer
      ? `${offer.serverType.toUpperCase()} · ${offer.cores} CPUs · ${offer.memory} GB`
      : null,
    address: facts.domains?.address ?? record?.url ?? null,
    cdn: invented
      ? {
          on: true,
          provider: "Cloudflare",
          detail:
            "Static files are cached at the edge for an hour; everything else is passed through to the machine.",
        }
      : {
          on: cdnOn,
          provider: cdnFacts?.provider ?? null,
          detail:
            cdnFacts?.detail ??
            "Every request travels to the one machine that runs this application.",
        },
    brokers: invented
      ? [
          {
            name: "valkey",
            product: "Valkey 8",
            role: "Queue broker",
            persistence:
              "Appends every write to disk, so queued work survives a restart",
            reach: "Private · only processes on the server reach it",
          },
        ]
      : brokers,
    queues: invented
      ? [
          {
            library: "Sidekiq",
            backedBy: "Valkey 8",
            workers: ["worker"],
            backlog: 12,
            oldestSeconds: 260,
            failedLastHour: 1,
            at: new Date(now - 4 * 60_000).toISOString(),
          },
        ]
      : queues,
    workers: invented ? ["worker"] : workers,
    jobs: invented
      ? [
          {
            name: "Nightly cleanup",
            command: "bin/console app:prune-sessions",
            schedule: "Every day at 03:30",
            timezone: "Europe/Sofia",
            nextAt: nextRun.toISOString(),
            paused: false,
            last: {
              outcome: "succeeded",
              at: lastRun.toISOString(),
              seconds: 42,
            },
          },
        ]
      : jobs,
    runs,
    recurring,
    invented: invented
      ? "The cache, the queue and its backlog, the scheduled command, the waiting value and the CDN are invented, so the pages can be seen with something on them."
      : null,
  };
}
