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

afterAll(async () => {
  await globalThis.__hallviTraffic?.client.close();
  delete globalThis.__hallviTraffic;
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("keeping traffic history by default", () => {
  it("starts once for an application nobody chose for", async () => {
    expect(await keepByDefault("fresh")).toBe(true);
    expect((await collectionOf("fresh")).enabledAt).not.toBeNull();
    expect(await keepByDefault("fresh")).toBe(false);
  });

  it("never restarts what the owner stopped or forgot", async () => {
    await setCollection("stopped", "keep");
    await setCollection("stopped", "stop");
    expect(await keepByDefault("stopped")).toBe(false);
    expect((await collectionOf("stopped")).enabledAt).toBeNull();

    await setCollection("forgotten", "keep");
    await forget("forgotten");
    expect(await keepByDefault("forgotten")).toBe(false);
    expect(await collectionOf("forgotten")).toMatchObject({
      enabledAt: null,
      state: "off",
      storedFrom: null,
    });
    // Keeping it again is still the owner's to do.
    await setCollection("forgotten", "keep");
    expect((await collectionOf("forgotten")).enabledAt).not.toBeNull();
  });
});
