// Where Hallvi looks for its state, and that asking does not create it.
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

import {
  piAccountLocation,
  stateLocation,
} from "../../../scripts/state-location.mjs";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hallvi-state-location-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it("names state for Hallvi and creates nothing", () => {
  expect(stateLocation(root, { hidden: true })).toEqual({
    directory: join(root, ".hallvi"),
    database: join(root, ".hallvi", "hallvi.db"),
    settings: join(root, ".hallvi", "hallvi.env"),
  });
  expect(stateLocation(root).database).toBe(join(root, "hallvi", "hallvi.db"));
  expect(piAccountLocation(root)).toBe(join(root, ".config", "hallvi", "pi"));
  expect(readdirSync(root)).toEqual([]);
});
