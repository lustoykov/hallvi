// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Processes and Database pages say, from the deployment record, its
// derived stack and the recorded operations: what runs, how a visit reaches
// it, what each process was checked with and when, where the data lives and
// what protects it. Everything is as recorded; nothing here is observed
// live, and the pages say so.

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import { deploymentRuntime } from "@/server/deployment-runtime";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";

import {
  ago,
  FRESH_MS,
  productName,
  shortImage,
} from "../architecture-prototype/model";
import type { Tone } from "../deployment-prototype/deployment-model";
import { settledAt } from "../history-prototype/history-model";

export interface Probe {
  name: string;
  probe: string;
  /** Checked inside the server, on the private network. */
  inside: boolean;
  at: string | null;
}
export interface ProcessCard {
  name: string;
  product: string;
  role: "web" | "private" | "worker" | "service";
  roleWords: string;
  port: number | null;
  reach: string;
  health: string | null;
  image: string;
  imageShort: string;
  command: string | null;
  probes: Probe[];
  lastPassed: string | null;
}
export interface Change {
  id: string;
  title: string;
  at: string;
  state: ApplicationOperation["state"];
  summary: string;
  origin: ApplicationOperation["origin"];
}
export interface Gap {
  id: string;
  title: string;
  detail: string;
}
export interface DataStore {
  kind: "sqlite" | "postgres";
  label: string;
  owner: string;
  ownerName: string;
  file: string | null;
  volume: { name: string; docker: string | null; mount: string } | null;
  /** The check that read the database, when the deployment has one. */
  probe: Probe | null;
  firstFailure: { at: string; detail: string } | null;
}
export interface Protection {
  schedule: { words: string; at: string } | null;
  backup: { at: string; detail: string } | null;
  restore: { at: string; detail: string } | null;
  keep: number | null;
}
export interface StackStory {
  state: "none" | "planned" | "running" | "unknown";
  tone: Tone;
  word: string;
  verifiedAt: string | null;
  name: string;
  restricted: boolean;
  from: string | null;
  processes: ProcessCard[];
  database: DataStore | null;
  files: { name: string; owner: string; mount: string; note: string | null }[];
  protection: Protection;
  processChanges: Change[];
  dataChanges: Change[];
  processGaps: Gap[];
  dataGaps: Gap[];
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const numbers = ["No", "One", "Two", "Three", "Four", "Five", "Six"];
/** "Two", "Seven" → "7". */
export const countWord = (n: number) => numbers[n] ?? String(n);
export const clock = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
/** "Sep 9, 20:48". */
export const when = (at: string) =>
  `${new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${clock(at)}`;
export { ago };

export function buildStackStory({
  record,
  stack,
  facts,
  operations,
  now,
}: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
}): StackStory {
  const release = currentFacts(record);
  const runtime = deploymentRuntime(record);
  const verifiedAt =
    runtime.lastVerified?.checkedAt ?? record?.verifiedAt ?? null;
  const state: StackStory["state"] =
    !record || !stack.recorded
      ? "none"
      : stack.processes.some((item) => item.state === "unknown")
        ? "unknown"
        : record.status === "live"
          ? "running"
          : "planned";
  const fresh = Boolean(verifiedAt) && now - Date.parse(verifiedAt!) < FRESH_MS;
  const restricted = release?.httpAccess === "controller";

  // ---- The checks each process passed, as the deployment recorded them.
  const events = record?.events ?? [];
  const lastSaid = (text: string) =>
    events.findLast((event) => event.message === text)?.at ?? null;
  const pinnedOf = (name: string) =>
    release?.services.find((service) => service.name === name)?.pinned ?? null;
  const productOf = (name: string, image?: string | null) =>
    productName(pinnedOf(name) ?? image ?? undefined, cap(name));
  const publicProbes: Probe[] = (release?.criterion?.checks ?? []).map(
    (check) => ({
      name: check.name,
      probe: `${check.method} ${check.path} → ${check.expectedStatus}${check.contains ? ` · contains ${check.contains}` : ""}`,
      inside: false,
      at: lastSaid(`Passed: ${check.name}`),
    }),
  );
  const privateProbes = (release?.criterion?.services ?? []).flatMap(
    (service) => {
      const product = productOf(service.name);
      const passed = (path: string) =>
        lastSaid(`Verified private ${service.name}: ${path}`);
      return [
        ...(service.healthPath
          ? [
              {
                service: service.name,
                name: `${product} is ready`,
                probe: `GET ${service.healthPath}`,
                inside: true,
                at: passed(service.healthPath),
              },
            ]
          : []),
        ...service.checks.map((check) => ({
          service: service.name,
          name: /query/.test(check.path)
            ? `${product} answers queries`
            : `${product} answers ${check.path}`,
          probe: `GET ${check.path}${check.contains ? ` · contains ${check.contains}` : ""}${check.jsonPath ? ` · ${check.jsonPath} = ${check.equals}` : ""}`,
          inside: true,
          at: passed(check.path),
        })),
      ];
    },
  );

  // ---- What runs, and how each process is reached.
  const web = stack.processes.find(
    (item) => item.role === "web" && !item.private,
  );
  const processes: ProcessCard[] = stack.processes.map((item) => {
    const image =
      pinnedOf(item.name) ?? item.image ?? "Built from the repository";
    const role: ProcessCard["role"] = item.private
      ? "private"
      : item.role === "worker"
        ? "worker"
        : item.role === "web"
          ? "web"
          : "service";
    const probes = [
      ...(item === web ? publicProbes : []),
      ...privateProbes.filter((probe) => probe.service === item.name),
    ];
    return {
      name: item.name,
      product: productOf(item.name, item.image),
      role,
      roleWords:
        role === "web"
          ? "The web app you open"
          : role === "private"
            ? "Private: only processes on the server reach it"
            : role === "worker"
              ? "Works in the background"
              : "A supporting service",
      port: item.port,
      reach:
        role === "web"
          ? `Port 80 → ${item.port ?? "its port"} · ${restricted ? "from your network only" : "open to anyone"}`
          : item.port
            ? `Port ${item.port} · inside the server only`
            : "No port",
      health: item.healthPath ? `GET ${item.healthPath}` : null,
      image,
      imageShort: shortImage(image),
      command: item.command,
      probes,
      lastPassed:
        probes
          .map((probe) => probe.at)
          .filter((at): at is string => Boolean(at))
          .sort()
          .at(-1) ?? null,
    };
  });

  // ---- Where the data lives.
  const store = stack.databases[0];
  const volume = stack.volumes.find((item) => item.kind === "database");
  const owner = processes.find(
    (item) => item.name === (volume?.usedBy ?? store?.name),
  );
  const failed = operations.find(
    (op) =>
      op.source.type === "deployment" &&
      op.state === "failed" &&
      /database/i.test(op.next ?? ""),
  );
  const database: DataStore | null = store
    ? {
        kind: store.kind,
        label:
          store.kind === "sqlite"
            ? "Embedded SQLite"
            : `PostgreSQL${store.version ? ` ${store.version}` : ""}`,
        owner: owner?.product ?? cap(store.name),
        ownerName: owner?.name ?? store.name,
        file: store.kind === "sqlite" ? store.location : null,
        volume: volume
          ? {
              name: volume.name,
              docker:
                release?.volumes.find((item) => item.name === volume.name)
                  ?.dockerName ?? null,
              mount: volume.mount,
            }
          : null,
        probe:
          publicProbes.find((probe) =>
            /database/i.test(`${probe.name} ${probe.probe}`),
          ) ?? null,
        firstFailure: failed
          ? { at: settledAt(failed), detail: failed.next ?? failed.summary }
          : null,
      }
    : null;
  const files = stack.volumes
    .filter((item) => item.kind === "files")
    .map((item) => {
      const user = processes.find((process) => process.name === item.usedBy);
      const retention = user?.command?.match(
        /--storage\.tsdb\.retention\.time=(\d+)d\b/,
      )?.[1];
      return {
        name: item.name,
        owner: user?.product ?? item.usedBy,
        mount: item.mount,
        note: retention ? `keeps ${retention} days` : null,
      };
    });

  // ---- What protects it: the protection facts when a capability records
  // them, otherwise the backup operations on record.
  const newest = (list: ApplicationOperation[]) =>
    list.toSorted((a, b) => settledAt(b).localeCompare(settledAt(a)))[0];
  const verified = operations.filter((op) => op.state === "verified");
  const scheduleOp = newest(
    verified.filter(
      (op) => op.source.type === "backup" && /^Configure/.test(op.title),
    ),
  );
  const backupOp = newest(
    verified.filter(
      (op) => op.source.type === "backup" && !/^Configure/.test(op.title),
    ),
  );
  const restoreOp = newest(
    verified.filter((op) => op.source.type === "restore"),
  );
  const keep = Number(scheduleOp?.summary.match(/latest (\d+)/)?.[1]) || null;
  const recorded = facts.protection;
  const protection: Protection = {
    schedule: scheduleOp
      ? {
          words: `${/daily/i.test(scheduleOp.summary) ? "Daily" : "Scheduled"} backups${keep ? `, keeping the latest ${keep}` : ""}`,
          at: settledAt(scheduleOp),
        }
      : null,
    backup:
      recorded?.lastAttempt?.outcome === "succeeded"
        ? {
            at: recorded.lastAttempt.at,
            detail: `The last scheduled backup succeeded${recorded.lastAttempt.size ? `, ${recorded.lastAttempt.size}` : ""}.`,
          }
        : backupOp
          ? { at: settledAt(backupOp), detail: backupOp.summary }
          : null,
    restore: recorded?.restoreTest
      ? { at: recorded.restoreTest.at, detail: recorded.restoreTest.verified }
      : restoreOp
        ? { at: settledAt(restoreOp), detail: restoreOp.summary }
        : null,
    keep,
  };

  const changesFor = (test: (op: ApplicationOperation) => boolean) =>
    operations
      .filter(test)
      .toSorted((a, b) => settledAt(b).localeCompare(settledAt(a)))
      .slice(0, 5)
      .map((op) => ({
        id: op.id,
        title: op.title,
        at: settledAt(op),
        state: op.state,
        summary: op.state === "failed" ? (op.next ?? op.summary) : op.summary,
        origin: op.origin,
      }));

  return {
    state,
    tone:
      state === "running"
        ? fresh
          ? "verified"
          : "stale"
        : state === "unknown"
          ? "stale"
          : "planned",
    word:
      state === "running" && verifiedAt
        ? `Verified ${ago(verifiedAt, now)}`
        : state === "unknown"
          ? "Needs a check"
          : state === "planned"
            ? "Not deployed yet"
            : "Nothing recorded",
    verifiedAt,
    name: productName(record?.plan?.image, "the application"),
    restricted,
    from: record?.httpSourceIp ?? null,
    processes,
    database,
    files,
    protection,
    processChanges: changesFor((op) => op.destinations.includes("processes")),
    dataChanges: changesFor(
      (op) =>
        op.destinations.includes("database") ||
        op.source.type === "backup" ||
        op.source.type === "restore",
    ),
    processGaps: [
      {
        id: "watch",
        title: "Health watch and restarts",
        detail:
          "Not set up. Only the deployment's checks are recorded, and nothing restarts a process that stops.",
      },
      ...(processes.some((item) => item.role === "worker")
        ? []
        : [
            {
              id: "workers",
              title: "Background workers",
              detail:
                "None declared. Server Guy adds them when the application declares background work.",
            },
          ]),
    ],
    dataGaps: [
      ...(facts.database
        ? []
        : [
            {
              id: "size",
              title: "Size and growth",
              detail: "Not measured yet.",
            },
          ]),
      ...(protection.schedule
        ? []
        : [
            {
              id: "backups",
              title: "Scheduled backups",
              detail:
                "Not set up. Ask Server Guy in the conversation to set them up.",
            },
          ]),
      {
        id: "logs",
        title: "Database logs",
        detail:
          "Not collected separately. The application's own logs are on the Logs page.",
      },
    ],
  };
}
