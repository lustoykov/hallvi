// The answers the Traffic, Overview and Deployment pages are built against.
// What matters: an application nobody has counted answers with an empty
// history rather than an error, and release impacts come back one per
// release, in the order asked.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/server/applications", () => ({
  NotFoundError: class NotFoundError extends Error {},
  ExistingApplicationConflictError: class extends Error {},
  loadApplication: (id: string) => ({ id }),
}));
vi.mock("../../../src/server/saved-information", () => ({
  listInformation: () => [],
}));

import { GET as history } from "../../../src/app/api/applications/[applicationId]/traffic/history/route";
import { GET as impact } from "../../../src/app/api/applications/[applicationId]/traffic/impact/route";
import type {
  ReleaseImpact,
  TrafficHistory,
} from "../../../src/server/traffic/contract";
import {
  closeTrafficDatabase,
  trafficDatabasePath,
} from "../../../src/server/traffic/store";

let root: string;
const context = { params: Promise.resolve({ applicationId: "notes" }) };
const get = (path: string) =>
  new NextRequest(
    `http://127.0.0.1:3000/api/applications/notes/traffic/${path}`,
  );

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "hv-traffic-routes-"));
  vi.stubEnv("HALLVI_DB_PATH", join(root, "hallvi.db"));
});

afterAll(async () => {
  await closeTrafficDatabase();
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

describe("traffic routes", () => {
  it("answers an application nothing has counted with an empty history", async () => {
    const response = await history(get("history?range=7d"), context);
    expect(response.status).toBe(200);
    const body = (await response.json()) as TrafficHistory;
    expect(body.range).toBe("7d");
    expect(body.series).toHaveLength(7);
    expect(body.series.every((point) => point.covered === 0)).toBe(true);
    expect(body.collection).toMatchObject({ state: "off", storedFrom: null });
    // Reading is not collecting: nothing was created to answer it.
    expect(existsSync(trafficDatabasePath())).toBe(false);
    const wrong = await history(get("history?range=90d"), context);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: expect.any(String) });
  });

  it("answers one impact per release, in the order asked", async () => {
    const asked = ["2026-09-29T12:00:00Z", "2026-09-20T08:30:00.000+03:00"];
    const response = await impact(
      get(
        `impact?${asked.map((at) => `at=${encodeURIComponent(at)}`).join("&")}`,
      ),
      context,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as ReleaseImpact[];
    expect(body.map((one) => one.releaseAt)).toEqual(asked);
    expect(body.every((one) => !one.notable && one.covered === 0)).toBe(true);
    const wrong = await impact(get("impact?at=yesterday"), context);
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual({ error: expect.any(String) });
  });
});
