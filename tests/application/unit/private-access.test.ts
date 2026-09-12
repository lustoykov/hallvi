import { beforeEach, afterEach, expect, it, vi } from "vitest";
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
