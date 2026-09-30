// Traffic history is on by default once there is a log, and the owner's
// choice to stop it, or to delete the totals, is never undone by that
// default.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  collectionOf,
  forget,
  keepByDefault,
  setCollection,
} from "@/server/traffic/store";

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-traffic-default-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "hallvi.db"));
});

afterAll(() => {
  globalThis.__hallviTraffic?.client.close();
  delete globalThis.__hallviTraffic;
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("keeping traffic history by default", () => {
  it("starts once for an application nobody chose for", () => {
    expect(keepByDefault("fresh")).toBe(true);
    expect(collectionOf("fresh").enabledAt).not.toBeNull();
    expect(keepByDefault("fresh")).toBe(false);
  });

  it("never restarts what the owner stopped or forgot", () => {
    setCollection("stopped", "keep");
    setCollection("stopped", "stop");
    expect(keepByDefault("stopped")).toBe(false);
    expect(collectionOf("stopped").enabledAt).toBeNull();

    setCollection("forgotten", "keep");
    forget("forgotten");
    expect(keepByDefault("forgotten")).toBe(false);
    expect(collectionOf("forgotten")).toMatchObject({
      enabledAt: null,
      state: "off",
      storedFrom: null,
    });
    // Keeping it again is still the owner's to do.
    setCollection("forgotten", "keep");
    expect(collectionOf("forgotten").enabledAt).not.toBeNull();
  });
});
