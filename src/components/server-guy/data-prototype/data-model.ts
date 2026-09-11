// PROTOTYPE · opus-ui-improvements · throwaway.
// What the Database and Storage pages say: where the data lives, what it was
// checked with, what survives a container replacement and what survives
// losing the server. Built on the same record the Processes page reads
// (stack-model.ts). Nothing here is measured live; sizes and disk use appear
// only when a measurement is recorded, and every mark is dated.

import type { ApplicationFacts } from "@/server/application-facts";
import {
  persistentState,
  type ApplicationStack,
} from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";
import { currentFacts } from "@/server/release-facts";

import { settledAt } from "../history-prototype/history-model";
import {
  buildStackStory,
  type StackStory,
} from "../stack-prototype/stack-model";

export interface DataVolume {
  name: string;
  docker: string | null;
  mount: string;
  kind: "database" | "files";
  owner: string;
  ownerName: string;
  holds: string;
  /** The SQLite file it holds, when it holds one. */
  database: string | null;
  note: string | null;
  sizeGb: number | null;
  measuredAt: string | null;
  /**
   * What the backup plan copies from it: a database volume through its
   * database alone, any other volume whole. Null when the plan leaves it out.
   */
  plan: { whole: boolean; method: string } | null;
}
export type Lane = "health" | "copies" | "restores" | `volume:${string}`;
export interface Mark {
  id: string;
  lane: Lane;
  at: string;
  tone: "pass" | "fail" | "info" | "set";
  title: string;
  detail: string;
}
export interface DataStory extends StackStory {
  volumes: DataVolume[];
  /** When the containers were replaced and the volumes kept. */
  keptAt: string | null;
  keptDetail: string | null;
  createdAt: string | null;
  disk: { usedGb: number; totalGb: number; measuredAt: string } | null;
  marks: Mark[];
  newestCopyAt: string | null;
}

const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function buildDataStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
}): DataStory {
  const base = buildStackStory(input);
  const { record, stack, facts, operations } = input;
  const release = currentFacts(record);
  const events = record?.events ?? [];
  const sizes = new Map(
    (facts.storage?.volumes ?? []).map((item) => [item.name, item]),
  );
  const planned = new Map(
    persistentState(stack).map((item) => [item.key, item.method]),
  );

  const volumes: DataVolume[] = stack.volumes.map((volume) => {
    const recorded = release?.volumes.find((item) => item.name === volume.name);
    const owner =
      base.processes.find((item) => item.name === volume.usedBy)?.product ??
      cap(volume.usedBy);
    const sqlite =
      recorded?.sqlite ??
      volume.mounts
        ?.find((mount) => mount.sqlite)
        ?.sqlite?.split("/")
        .at(-1) ??
      null;
    const measured = sizes.get(volume.name);
    const whole = planned.get(`volume:${volume.name}`);
    const throughDatabase =
      volume.kind === "database"
        ? stack.databases
            .filter(
              (item) =>
                item.name === volume.usedBy ||
                (item.kind === "postgres" && volume.usedBy === "postgres"),
            )
            .map((item) => planned.get(`database:${item.name}`))
            .find(Boolean)
        : undefined;
    return {
      name: volume.name,
      docker: recorded?.dockerName ?? null,
      mount: volume.mount,
      kind: volume.kind,
      owner,
      ownerName: volume.usedBy,
      holds:
        volume.kind === "database"
          ? `${owner}'s data, including ${sqlite ?? "its database"}`
          : `${owner}'s files`,
      database: sqlite,
      note: base.files.find((item) => item.name === volume.name)?.note ?? null,
      sizeGb: measured?.sizeGb ?? null,
      measuredAt: measured?.measuredAt ?? null,
      plan: whole
        ? { whole: true, method: whole }
        : throughDatabase
          ? { whole: false, method: throughDatabase }
          : null,
    };
  });

  const recreated = operations.find(
    (op) =>
      op.source.type === "release" &&
      op.state === "verified" &&
      /retained their named volumes/.test(op.summary),
  );
  const created =
    events.find((event) =>
      /^(Host prepared|Building the application)/.test(event.message),
    )?.at ?? null;

  // ---- Every datable thing these pages show, one mark each.
  const marks: Mark[] = [];
  const store = base.database;
  if (store?.firstFailure)
    marks.push({
      id: "health:failed",
      lane: "health",
      at: store.firstFailure.at,
      tone: "fail",
      title: "The database check failed",
      detail: store.firstFailure.detail,
    });
  if (store?.probe)
    events
      .filter((event) => event.message === `Passed: ${store.probe!.name}`)
      .forEach((event, index) =>
        marks.push({
          id: `health:${index}`,
          lane: "health",
          at: event.at,
          tone: "pass",
          title: store.probe!.name,
          detail: `${store.probe!.probe} · from your network`,
        }),
      );
  const verified = operations.filter((op) => op.state === "verified");
  verified
    .filter((op) => op.source.type === "backup")
    .forEach((op) =>
      marks.push({
        id: `copies:${op.id}`,
        lane: "copies",
        at: settledAt(op),
        tone: /^Configure/.test(op.title) ? "set" : "pass",
        title: /^Configure/.test(op.title) ? "Backups set up" : "Off-host copy",
        detail: op.summary,
      }),
    );
  verified
    .filter((op) => op.source.type === "restore")
    .forEach((op) =>
      marks.push({
        id: `restores:${op.id}`,
        lane: "restores",
        at: settledAt(op),
        tone: "pass",
        title: "Restore test",
        detail: op.summary,
      }),
    );
  for (const volume of volumes) {
    if (created)
      marks.push({
        id: `volume:${volume.name}:created`,
        lane: `volume:${volume.name}`,
        at: created,
        tone: "info",
        title: "Created with the deployment",
        detail: `Mounted into ${volume.owner} at ${volume.mount}.`,
      });
    if (recreated)
      marks.push({
        id: `volume:${volume.name}:kept`,
        lane: `volume:${volume.name}`,
        at: settledAt(recreated),
        tone: "pass",
        title: "Kept through a container replacement",
        detail: recreated.summary,
      });
  }

  return {
    ...base,
    volumes,
    keptAt: recreated ? settledAt(recreated) : null,
    keptDetail: recreated?.summary ?? null,
    createdAt: created,
    disk: facts.storage?.hostDisk ?? null,
    marks: marks.sort((a, b) => a.at.localeCompare(b.at)),
    newestCopyAt: base.protection.backup?.at ?? null,
  };
}
