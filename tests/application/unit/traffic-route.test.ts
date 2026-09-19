import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccessLogSource } from "@/server/access-log";
import type { OperatorSettings } from "@/server/operator-data";

const fixture = vi.hoisted(() => ({
  host: null as OperatorSettings["host"],
  source: null as AccessLogSource | null,
  follows: [] as AbortSignal[],
}));
vi.mock("@/server/http", () => ({ handle: (work: () => unknown) => work() }));
vi.mock("@/server/schemas", () => ({ assertSameOrigin: () => {} }));
vi.mock("@/server/operator-execution", () => ({
  operatorSettings: () => ({ host: fixture.host }),
}));
vi.mock("@/server/access-log", () => ({
  accessLogSource: () => fixture.source,
  followAccessLog: (
    _host: unknown,
    _source: unknown,
    _onLine: unknown,
    signal: AbortSignal,
    ready: () => void,
  ) => {
    fixture.follows.push(signal);
    ready();
    return new Promise((resolve) => {
      signal.addEventListener("abort", () =>
        resolve({ exitCode: null, said: "" }),
      );
    });
  },
}));
import { GET } from "@/app/api/applications/[applicationId]/traffic/route";

async function open() {
  const response = await GET(new Request("http://localhost/api/traffic"), {
    params: Promise.resolve({ applicationId: "app" }),
  });
  const reader = response.body!.getReader();
  const read = async () => {
    const chunk = await reader.read();
    return chunk.done ? null : new TextDecoder().decode(chunk.value);
  };
  expect(await read()).toContain("retry: 15000");
  return { reader, read };
}

beforeEach(() => {
  vi.useFakeTimers();
  fixture.host = {
    address: "example.test",
    user: "hallvi",
    port: 22,
    privateKeyPath: "/test/key",
    knownHostsPath: "/test/hosts",
  };
  fixture.source = { type: "file", path: "/var/log/caddy/access.log" };
  fixture.follows = [];
});
afterEach(() => vi.useRealTimers());

describe("a live Overview's source lifecycle", () => {
  it("reconnects when an initially missing log is recorded", async () => {
    fixture.source = null;
    const stream = await open();
    expect(await stream.read()).toContain('"no-log"');
    fixture.source = { type: "container", name: "caddy" };
    await vi.advanceTimersByTimeAsync(1000);
    expect(await stream.read()).toContain("retry: 1000");
    expect(await stream.read()).toBeNull();
    expect(fixture.follows).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["retired", "moved", "server removed"])(
    "stops the old follower when its source is %s",
    async (change) => {
      const stream = await open();
      expect(await stream.read()).toContain('"connecting"');
      expect(await stream.read()).toContain('"live"');
      if (change === "retired") fixture.source = null;
      else if (change === "moved")
        fixture.source = { type: "container", name: "new-caddy" };
      else fixture.host = null;
      await vi.advanceTimersByTimeAsync(1000);
      expect(fixture.follows[0].aborted).toBe(true);
      expect(await stream.read()).toContain("retry: 1000");
      expect(await stream.read()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("keeps an unchanged source open and releases everything when the page closes", async () => {
    const stream = await open();
    await vi.advanceTimersByTimeAsync(2000);
    expect(fixture.follows[0].aborted).toBe(false);
    await stream.reader.cancel();
    expect(fixture.follows[0].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
