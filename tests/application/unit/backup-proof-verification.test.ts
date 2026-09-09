import { describe, expect, it } from "vitest";
import {
  verifyPostgresArchive,
  verifyRestoredRows,
  verifyCanaryBinding,
} from "../../../src/server/backup-proof-verification";

describe("backup proof evidence", () => {
  const archive = Buffer.from("PGDMP-valid-test-archive");
  it("rejects corrupted and truncated remote downloads", () => {
    expect(() =>
      verifyPostgresArchive(archive, Buffer.from("PGDMP-invalid-archive")),
    ).toThrow("does not match");
    const corrupted = Buffer.from(archive);
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => verifyPostgresArchive(archive, corrupted)).toThrow(
      "does not match",
    );
    expect(() =>
      verifyPostgresArchive(archive, archive.subarray(0, -1)),
    ).toThrow("does not match");
  });
  it("rejects an error response masquerading as a dump", () => {
    const error = Buffer.from("permission denied");
    expect(() => verifyPostgresArchive(error, error)).toThrow(
      "not a PostgreSQL",
    );
  });
  it("requires nonempty, unchanged source data and exact recovered rows", () => {
    const rows = Buffer.from('{"id":1,"title":"persisted"}\n');
    const changed = Buffer.from('{"id":1,"title":"different"}\n');
    expect(() =>
      verifyRestoredRows(Buffer.alloc(0), Buffer.alloc(0), Buffer.alloc(0)),
    ).toThrow("empty");
    expect(() => verifyRestoredRows(rows, changed, rows)).toThrow(
      "Source data changed",
    );
    expect(() => verifyRestoredRows(rows, rows, changed)).toThrow("differ");
    expect(verifyRestoredRows(rows, rows, rows)).toMatchObject({ rowCount: 1 });
    expect(() =>
      verifyPostgresArchive(archive, Buffer.from(archive)),
    ).not.toThrow();
  });
});

it("binds the API canary to the database that is being backed up", () => {
  const rows = Buffer.from('{"id":"expected-id","title":"expected-token"}\n');
  expect(() =>
    verifyCanaryBinding(rows, "different-id", "expected-token"),
  ).toThrow("not found");
  expect(() =>
    verifyCanaryBinding(rows, "expected-id", "different-token"),
  ).toThrow("not found");
  expect(() =>
    verifyCanaryBinding(rows, "expected-id", "expected-token"),
  ).not.toThrow();
});
