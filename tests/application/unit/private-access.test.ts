import { createServer } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ exec: vi.fn(), settings: vi.fn() }));
vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFile = vi.fn();
  Object.defineProperty(execFile, promisify.custom, { value: mocks.exec });
  return { execFile };
});
vi.mock("../../../src/server/operator-execution", () => ({
  operatorSettings: mocks.settings,
}));
import { openServerPort } from "../../../src/server/private-access";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.mockReturnValue({
    host: {
      address: "192.0.2.1",
      user: "root",
      port: 22,
      privateKeyPath: "/private/key",
      knownHostsPath: "/private/pinned-host",
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("OK")));
});
afterEach(() => vi.unstubAllGlobals());
it("binds both ends to loopback, pins the host and verifies local HTTP without following redirects", async () => {
  mocks.exec.mockRejectedValueOnce(new Error("no control master"));
  mocks.exec.mockResolvedValueOnce({ stdout: "", stderr: "" });
  const result = await openServerPort("app-test", { remotePort: 80 });
  const args = mocks.exec.mock.calls[1][1];
  expect(args).toContain("127.0.0.1:8080:127.0.0.1:80");
  expect(args).toContain("ExitOnForwardFailure=yes");
  expect(args).toContain("StrictHostKeyChecking=yes");
  expect(args).toContain("UserKnownHostsFile=/private/pinned-host");
  expect(result).toMatchObject({
    url: "http://127.0.0.1:8080",
    httpStatus: 200,
    reused: false,
  });
  expect(JSON.stringify(result)).not.toContain("/private");
  expect(fetch).toHaveBeenCalledWith(
    result.url,
    expect.objectContaining({ redirect: "manual" }),
  );
});
it("reuses only the same application's host and port tunnel", async () => {
  mocks.exec.mockResolvedValue({ stdout: "", stderr: "" });
  expect(await openServerPort("app-test", { remotePort: 80 })).toMatchObject({
    reused: true,
  });
  expect(mocks.exec).toHaveBeenCalledOnce();
  const first = mocks.exec.mock.calls[0][1];
  await openServerPort("another-app", { remotePort: 80 });
  const second = mocks.exec.mock.calls[1][1];
  expect(first[first.indexOf("-S") + 1]).not.toBe(
    second[second.indexOf("-S") + 1],
  );
});
it("rejects an occupied port instead of claiming another local app is the tunnel", async () => {
  mocks.exec.mockRejectedValue(new Error("Address already in use"));
  await expect(openServerPort("app-test", { remotePort: 80 })).rejects.toThrow(
    "Address already in use",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("does not claim HTTP verification when the forwarded service fails", async () => {
  mocks.exec.mockResolvedValue({ stdout: "", stderr: "" });
  vi.mocked(fetch).mockRejectedValue(new Error("connection refused"));
  expect(await openServerPort("app-test", { remotePort: 80 })).toMatchObject({
    httpStatus: null,
  });
});
it("rejects invalid ports, missing connections and cancellation before starting SSH", async () => {
  await expect(openServerPort("app-test", { remotePort: 0 })).rejects.toThrow();
  await expect(
    openServerPort("app-test", { remotePort: 80, localPort: 22 }),
  ).rejects.toThrow();
  const controller = new AbortController();
  controller.abort();
  await expect(
    openServerPort("app-test", { remotePort: 80 }, controller.signal),
  ).rejects.toThrow();
  mocks.settings.mockReturnValue({ host: null });
  await expect(openServerPort("app-test", { remotePort: 80 })).rejects.toThrow(
    "Connect a server",
  );
  expect(mocks.exec).not.toHaveBeenCalled();
});

// An installation's owner may be on another machine, forwarding a fixed set of
// ports to their browser. A link outside that set opens nothing for them.
describe("on an installation with fixed private ports", () => {
  beforeEach(() => vi.stubEnv("HALDUR_PRIVATE_PORTS", "47570-47572"));
  afterEach(() => vi.unstubAllEnvs());

  it("chooses a free port inside the range when Pi names none", async () => {
    mocks.exec.mockRejectedValueOnce(new Error("no control master"));
    mocks.exec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    const result = await openServerPort("app-test", { remotePort: 80 });
    expect(result.url).toBe("http://127.0.0.1:47570");
    expect(result.access).toContain("forward");
  });

  it("returns the link the application already has", async () => {
    // A live master holds its port; only an occupied port is asked about.
    const held = createServer();
    await new Promise<void>((done) => held.listen(47571, "127.0.0.1", done));
    try {
      mocks.exec.mockResolvedValue({ stdout: "", stderr: "" });
      expect(
        await openServerPort("app-test", { remotePort: 80 }),
      ).toMatchObject({ url: "http://127.0.0.1:47571", reused: true });
    } finally {
      await new Promise((done) => held.close(done));
    }
  });

  it("refuses a port the owner does not forward", async () => {
    await expect(
      openServerPort("app-test", { remotePort: 80, localPort: 8080 }),
    ).rejects.toThrow("47570-47572");
    expect(mocks.exec).not.toHaveBeenCalled();
  });
});
