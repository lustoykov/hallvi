import { describe, expect, it } from "vitest";
import {
  changedStores,
  MIGRATIONS,
  plan,
  STORES,
  supported,
  UnsupportedMigration,
} from "../../../scripts/migrations.mjs";

// The list is the contract. What matters is not that 15 reaches 18, but that
// nothing else does by accident.

describe("what can be migrated", () => {
  it("takes 15 to 18 in one step, and says which store it rewrites", () => {
    const steps = plan(15, 18);
    expect(steps.map((step) => [step.from, step.to])).toEqual([[15, 18]]);
    expect(changedStores(steps)).toEqual([STORES.database]);
  });

  it("has nothing to do when the versions already agree", () => {
    expect(plan(18, 18)).toEqual([]);
    expect(supported(18, 18)).toBe(true);
  });

  it("refuses a version no step reaches, even one step beyond a supported one", () => {
    // The guard this list exists for: bumping schema-version.json to 19 must
    // not promote the 15-to-18 step into a 15-to-19 one it never implemented.
    expect(() => plan(15, 19)).toThrow(UnsupportedMigration);
    expect(() => plan(15, 19)).toThrow(/gets as far as 18/);
    expect(supported(15, 19)).toBe(false);
    expect(supported(18, 19)).toBe(false);
  });

  it("refuses a starting point it does not know", () => {
    expect(() => plan(14, 18)).toThrow(/no supported migration from schema 14/);
    expect(supported(14, 18)).toBe(false);
  });

  it("refuses to go backwards, and says what does", () => {
    expect(() => plan(18, 15)).toThrow(/Restoring a backup is how you go back/);
  });

  it("names both ends of every transition as literal numbers", () => {
    // A transition whose destination came from the current schema-version
    // file would change meaning whenever that file did.
    for (const step of MIGRATIONS) {
      expect(Number.isInteger(step.from)).toBe(true);
      expect(Number.isInteger(step.to)).toBe(true);
      expect(step.to).toBeGreaterThan(step.from);
      expect(step.changes.length).toBeGreaterThan(0);
    }
  });
});
