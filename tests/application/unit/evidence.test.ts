// Three answers to "what does this row say", and they must stay apart.
//
// The Known column counts what a check could settle. Folding "nothing to
// read here" into "nobody looked" would make a worker with no public address
// a row with a hole in it, and folding "somebody counted and it was none"
// into either would grey out a reading that was actually taken.

import { describe, expect, it } from "vitest";

import type { DatabaseRow } from "@/components/hallvi/database-records";
import {
  askable,
  databaseFacts,
  processFacts,
} from "@/components/hallvi/evidence";
import type { ProcessCard } from "@/components/hallvi/stack-prototype/line-story";

const NOW = Date.parse("2026-09-13T12:00:00.000Z");

const state = (facts: { key: string; state: string }[], key: string) =>
  facts.find((fact) => fact.key === key)?.state;

const process = (over: Partial<ProcessCard> = {}): ProcessCard => ({
  name: "shop-worker",
  product: "Worker",
  role: "worker",
  roleWords: "A background worker",
  port: null,
  reach: "No port recorded",
  health: null,
  image: "Not recorded",
  imageShort: "Not recorded",
  command: null,
  probes: [],
  lastPassed: null,
  ...over,
});

const database = (over: Partial<DatabaseRow> = {}): DatabaseRow => ({
  id: "shop-db",
  label: "PostgreSQL 17",
  absent: false,
  path: null,
  size: null,
  sizeAt: null,
  owner: null,
  port: null,
  probes: [],
  answering: null,
  lastPassed: null,
  extras: [],
  ...over,
});

describe("what a row is known to say", () => {
  it("a private process has no public address, and that is not a gap", () => {
    const worker = processFacts(process());
    expect(state(worker, "address")).toBe("na");
    // The count is of things a check could settle, so n/a is not in it.
    expect(askable(worker)).toHaveLength(worker.length - 1);
    expect(askable(worker).map((fact) => fact.key)).not.toContain("address");

    const web = processFacts(process({ role: "web", reach: "Port 80 → 8000" }));
    expect(state(web, "address")).toBe("known");
    expect(askable(web)).toHaveLength(web.length);
  });

  it("zero restarts is a reading, and no restart count is not", () => {
    expect(state(processFacts(process({ restarts: "0" })), "restarts")).toBe(
      "absent",
    );
    expect(state(processFacts(process({ restarts: "3" })), "restarts")).toBe(
      "known",
    );
    expect(state(processFacts(process()), "restarts")).toBe("unchecked");
  });

  it("a database a record says is not there has nothing to check", () => {
    const none = databaseFacts(database({ absent: true }), NOW);
    expect(none.every((fact) => fact.state === "na")).toBe(true);
    expect(askable(none)).toHaveLength(0);
    // Every one of them says why, so the grey is never mute.
    expect(none.every((fact) => fact.reason.length > 0)).toBe(true);

    const unlooked = databaseFacts(database(), NOW);
    expect(unlooked.every((fact) => fact.state === "unchecked")).toBe(true);
  });

  it("a query that ran and said no is a reading, not a gap", () => {
    const refused = databaseFacts(
      database({
        answering: {
          key: "answering",
          label: "answering",
          passed: false,
          noted: false,
          fresh: false,
          at: "2026-09-13T11:00:00.000Z",
          detail: null,
        },
      }),
      NOW,
    );
    expect(state(refused, "answering")).toBe("absent");
    expect(askable(refused).map((fact) => fact.key)).toContain("answering");
  });
});
