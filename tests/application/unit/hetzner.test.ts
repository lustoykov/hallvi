import { afterEach, expect, it, vi } from "vitest";
import { hetzner } from "../../../src/server/hetzner";
const token = "controller-only-token";
afterEach(() => vi.unstubAllGlobals());
it("uses the fixed API origin, forwards general methods and strips returned credentials", async () => {
  const fetch = vi.fn(async () =>
    Response.json({
      server: { id: 123 },
      root_password: "never-show-this",
      nested: { token: "another-secret", detail: token },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await hetzner(
    "/servers/123/actions/reboot",
    {},
    token,
    "POST",
  );
  expect(fetch).toHaveBeenCalledWith(
    "https://api.hetzner.cloud/v1/servers/123/actions/reboot",
    expect.objectContaining({
      method: "POST",
      redirect: "error",
      headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
    }),
  );
  expect(result).toEqual({
    server: { id: 123 },
    root_password: "[REDACTED]",
    nested: { token: "[REDACTED]", detail: "[REDACTED]" },
  });
  fetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect(await hetzner("/servers/123", undefined, token, "DELETE")).toBeNull();
});
it("rejects origin/path escapes before issuing a request", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  for (const path of [
    "https://example.com",
    "//example.com",
    "/servers/../../other",
    "/servers/%2e%2e/other",
    "/servers\\other",
  ])
    await expect(hetzner(path, undefined, token)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it("never retries a lost create response and does not expose provider error messages", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error(token))
    .mockResolvedValueOnce(
      Response.json(
        { error: { code: "invalid_input", message: token } },
        { status: 400 },
      ),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(hetzner("/servers", { name: "example" }, token)).rejects.toThrow(
    "Reconcile",
  );
  expect(fetch).toHaveBeenCalledOnce();
  await expect(hetzner("/servers", {}, token)).rejects.toThrow(
    "HTTP 400, invalid_input",
  );
});
