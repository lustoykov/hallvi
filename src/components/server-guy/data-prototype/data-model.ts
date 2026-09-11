// PROTOTYPE · opus-ui-improvements · chosen for Database.
// What the Database page says over time: when the database passed or failed
// its check, when it was copied off the server and when a restore was
// tested, one dated mark each. Built on the same record the Processes page
// reads (stack-model.ts); nothing here is observed live.

import type { ApplicationFacts } from "@/server/application-facts";
import type { ApplicationStack } from "@/server/application-stack";
import type { DeploymentRecord } from "@/server/deployment-types";
import type { ApplicationOperation } from "@/server/operation-record";

import { settledAt } from "../history-prototype/history-model";
import {
  buildStackStory,
  type StackStory,
} from "../stack-prototype/stack-model";

export type Lane = "health" | "copies" | "restores";
export interface Mark {
  id: string;
  lane: Lane;
  at: string;
  tone: "pass" | "fail" | "set";
  title: string;
  detail: string;
}
export interface DataStory extends StackStory {
  marks: Mark[];
  newestCopyAt: string | null;
}

export function buildDataStory(input: {
  record: DeploymentRecord | null;
  stack: ApplicationStack;
  facts: ApplicationFacts;
  operations: ApplicationOperation[];
  now: number;
}): DataStory {
  const base = buildStackStory(input);
  const { record, operations } = input;
  const events = record?.events ?? [];
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

  return {
    ...base,
    marks: marks.sort((a, b) => a.at.localeCompare(b.at)),
    newestCopyAt: base.protection.backup?.at ?? null,
  };
}
