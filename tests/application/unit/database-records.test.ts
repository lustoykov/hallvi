// Database, read from records.
//
// Three lanes that never borrow from one another: a passing health check is
// not a copy, and a copy is not a restore. Merging any two is how a page
// tells somebody their data is safe when it is only present.

import { beforeEach, describe, expect, it } from "vitest";

import { databaseFromRecords } from "@/components/server-guy/database-records";
import {
  APP,
  NOW,
  check,
  fact,
  resetRecordIds,
  states,
  topology,
} from "../fixtures/records";

const read = (records: Parameters<typeof databaseFromRecords>[0]["records"]) =>
  databaseFromRecords({ records, applicationId: APP, now: NOW });

beforeEach(resetRecordIds);

describe("databaseFromRecords", () => {
  it("has nothing to say when nothing names a database", () => {
    const story = read([]);
    expect(story.database).toBeNull();
    expect(story.marks).toEqual([]);
    expect(story.tone).toBe("planned");
  });

  it("names the engine and where the bytes are", () => {
    const story = read([
      topology(
        [
          { id: "shop", kind: "web", name: "Shop" },
          { id: "shop-db", kind: "private", name: "Postgres" },
          { id: "data", kind: "volume", name: "Data" },
        ],
        [
          { from: "shop", to: "shop-db", network: "private" },
          { from: "shop-db", to: "data", network: "disk" },
        ],
      ),
      states(
        { kind: "volume", id: "data" },
        { facts: [fact("path", "/var/lib/pg")] },
      ),
      states(
        { kind: "database", id: "shop-db" },
        {
          facts: [
            fact("engine", "PostgreSQL"),
            fact("version", "16"),
            fact("size", "220 MB", "contents"),
          ],
          checks: [check("answering", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.database?.label).toBe("PostgreSQL 16");
    expect(story.database?.kind).toBe("postgres");
    expect(story.database?.owner).toBe("Shop");
    expect(story.database?.volume).toEqual({
      name: "data",
      docker: null,
      mount: "/var/lib/pg",
    });
  });

  it("reads a sqlite file as a database in its own right", () => {
    const story = read([
      states(
        { kind: "database", id: "todos" },
        {
          facts: [fact("engine", "SQLite"), fact("path", "/etc/todos/todo.db")],
          checks: [check("answering", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.database?.kind).toBe("sqlite");
    expect(story.database?.file).toBe("/etc/todos/todo.db");
  });

  it("keeps every health reading, not only the newest", () => {
    const story = read([
      states(
        { kind: "database", id: "db" },
        {
          at: "2026-09-12T09:00:00.000Z",
          checks: [check("answering", "failed", "liveness")],
        },
      ),
      states(
        { kind: "database", id: "db" },
        {
          at: "2026-09-13T11:50:00.000Z",
          checks: [check("answering", "passed", "liveness")],
        },
      ),
    ]);
    expect(story.marks.map((mark) => [mark.lane, mark.tone])).toEqual([
      ["health", "fail"],
      ["health", "pass"],
    ]);
    expect(story.tone).toBe("verified");
  });

  it("does not let a health check imply a copy", () => {
    const story = read([
      states(
        { kind: "database", id: "db" },
        { checks: [check("answering", "passed", "liveness")] },
      ),
    ]);
    expect(story.newestCopyAt).toBeNull();
    expect(story.protection.backup).toBeNull();
    expect(story.marks.every((mark) => mark.lane === "health")).toBe(true);
  });

  it("puts copies and restores in their own lanes", () => {
    const story = read([
      states({ kind: "database", id: "db" }),
      states(
        { kind: "backup-copy", id: "copy-1" },
        {
          at: "2026-09-13T03:30:00.000Z",
          facts: [
            fact("destination", "Cloudflare R2"),
            fact("size", "12 MB", "contents"),
          ],
        },
      ),
      states(
        { kind: "restore-test", id: "test-1" },
        {
          at: "2026-09-13T04:00:00.000Z",
          facts: [fact("covers", "The whole database")],
          checks: [check("restored", "passed")],
        },
      ),
    ]);
    const lanes = story.marks.map((mark) => mark.lane);
    expect(lanes).toEqual(["copies", "restores"]);
    expect(story.newestCopyAt).toBe("2026-09-13T03:30:00.000Z");
  });

  it("reads a failed check as failed and says when it first went", () => {
    const at = "2026-09-13T11:30:00.000Z";
    const story = read([
      states(
        { kind: "database", id: "db" },
        {
          at,
          status: "failed",
          checks: [
            check("answering", "failed", "liveness", {
              detail: "connection refused on 5432",
            }),
          ],
        },
      ),
    ]);
    expect(story.tone).toBe("failed");
    expect(story.database?.firstFailure).toEqual({
      at,
      detail: "connection refused on 5432",
    });
  });

  it("drops the database only when a record says it is gone", () => {
    expect(
      read([states({ kind: "database", id: "db" }, { presence: "absent" })])
        .database,
    ).toBeNull();
  });
});
