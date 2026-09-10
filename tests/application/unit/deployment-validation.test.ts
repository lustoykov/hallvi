import { expect, it, vi } from "vitest";
import { criterionSchema } from "../../../src/server/native-compose";
import { HetznerError, hetzner } from "../../../src/server/hetzner";
import { isControllerHost } from "../../../src/server/controller-origin";
const check = {
  name: "Check",
  method: "GET",
  path: "/health",
  body: null,
  expectedStatus: 200,
  contains: "",
  captureId: null,
};
it("requires application content evidence rather than only successful health", () => {
  expect(
    criterionSchema.safeParse({ healthPath: "/health", checks: [check] })
      .success,
  ).toBe(false);
  expect(
    criterionSchema.safeParse({
      healthPath: "/health",
      checks: [{ ...check, path: "/", contains: "My application" }],
    }).success,
  ).toBe(true);
});
it("rejects arbitrary destructive verification even when there is a content check", () => {
  expect(
    criterionSchema.safeParse({
      healthPath: "/health",
      checks: [
        { ...check, name: "Read", path: "/", contains: "App" },
        {
          ...check,
          name: "Delete",
          method: "DELETE",
          path: "/todos/1",
          expectedStatus: 204,
        },
      ],
    }).success,
  ).toBe(false);
});
it("classifies only definite provider rejections as safe to retry", async () => {
  for (const [status, code, expected] of [
    [412, "resource_unavailable", true],
    [403, "resource_limit_exceeded", true],
    [500, "server_error", false],
    [422, "service_error", false],
    [400, "unknown", false],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { code, message: "secret is never echoed" } },
          { status },
        ),
      ),
    );
    try {
      await hetzner("/servers", {}, "test-token");
      throw Error("Expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(HetznerError);
      expect((error as HetznerError).definitelyNotCreated).toBe(expected);
      expect((error as Error).message).not.toContain("secret");
    }
  }
  vi.unstubAllGlobals();
});
it("accepts only exact loopback controller hosts", () => {
  for (const host of ["localhost:3260", "127.0.0.1:3260", "[::1]:3260"])
    expect(isControllerHost(host)).toBe(true);
  for (const host of [
    "evil.example:3260",
    "localhost.evil.example",
    "evil@localhost",
    "localhost/path",
    "localhost#evil",
  ])
    expect(isControllerHost(host)).toBe(false);
});

it("the request proxy rejects a rebound host on reads, before a route can return secrets", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../../../src/proxy");
  const malicious = new NextRequest("http://localhost:3260/api/setup", {
    headers: { host: "rebound.example:3260" },
  });
  expect(proxy(malicious).status).toBe(403);
  const local = new NextRequest("http://localhost:3260/api/setup", {
    headers: { host: "127.0.0.1:3260" },
  });
  expect(proxy(local).status).toBe(200);
});
