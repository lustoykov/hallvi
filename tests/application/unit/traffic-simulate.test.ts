// Simulated traffic from the Traffic page: development only, public
// addresses only, and the generator's own report read back as progress.

import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawned: { args: string[]; child: FakeChild }[] = [];

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  pid = 4242;
}

vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawn: (_command: string, args: string[]) => {
    const child = new FakeChild();
    spawned.push({ args, child });
    return child;
  },
}));

let access: { mode: "public" | "private"; url: string } | null;
vi.mock("@/server/saved-information", () => ({
  listInformation: async () =>
    access
      ? [
          {
            id: "route",
            applicationId: "app",
            updatedAt: "2026-09-30T00:00:00.000Z",
            presentation: {
              url: access.url,
              content: {
                kind: "application-access",
                mode: access.mode,
                localPort: 5000,
                remotePort: 8080,
              },
            },
          },
        ]
      : [],
}));

const load = () => import("@/server/traffic/simulate");
const wanted = { shape: "busy" as const, rate: 10, minutes: 5 };

beforeEach(() => {
  vi.resetModules();
  delete globalThis.__hallviSimulations;
  spawned.length = 0;
  access = { mode: "public", url: "https://shop.example.com/login" };
});
afterEach(() => vi.unstubAllEnvs());

describe("simulated traffic", () => {
  it("does not exist in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const simulate = await load();
    expect(() => simulate.simulation("app")).toThrow("only in development");
    await expect(simulate.startSimulation("app", wanted)).rejects.toThrow(
      "only in development",
    );
    expect(spawned).toHaveLength(0);
  });

  it("needs a public address, so the requests pass the proxy", async () => {
    access = { mode: "private", url: "http://127.0.0.1:5000" };
    const simulate = await load();
    await expect(simulate.startSimulation("app", wanted)).rejects.toThrow(
      "public address",
    );
    expect(spawned).toHaveLength(0);
  });

  it("sends to the address's origin and reads the generator's report", async () => {
    const simulate = await load();
    await simulate.startSimulation("app", wanted);
    const [{ args, child }] = spawned;
    expect(args.slice(args.indexOf("live"))).toEqual([
      "live",
      "--url",
      "https://shop.example.com",
      "--shape",
      "busy",
      "--rate",
      "10",
      "--minutes",
      "5",
      "--report",
      "5",
    ]);
    await expect(simulate.startSimulation("app", wanted)).rejects.toThrow(
      "already running",
    );

    child.stdout.write(
      "  30 browser, 4 bot, 2 own, 1 errors, 6 event view; 3 visits open\n",
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(simulate.simulation("app")).toMatchObject({
      requests: 36,
      open: 3,
      running: true,
    });

    child.stdout.write('Done: {"bot":5,"browser":40,"failed":1}\n');
    child.emit("exit", 0, null);
    await new Promise((resolve) => setImmediate(resolve));
    expect(simulate.simulation("app")).toMatchObject({
      requests: 46,
      open: 0,
      running: false,
      error: null,
    });
  });
});
