import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startLogin = vi.hoisted(() => vi.fn(() => ({ id: "attempt", state: "starting" })));
vi.mock("../../../src/server/pi-setup", () => ({ getPiSetupStatus: async () => ({ state: "needs-auth" }), piLoginCoordinator: { start: startLogin } }));

import { PATCH, POST } from "../../../src/app/api/pi/setup/route";
import { POST as LOGIN } from "../../../src/app/api/pi/setup/login/route";
import { readPiConfiguration } from "../../../src/server/pi-configuration";

beforeEach(() => { startLogin.mockClear(); vi.stubEnv("SERVER_GUY_CONFIG_DIR", mkdtempSync(join(tmpdir(), "server-guy-pi-route-"))); });
afterEach(() => vi.unstubAllEnvs());

describe("Pi setup choice route", () => {
  it("does not overwrite saved preferences through an untrusted-Origin text/plain POST", async () => {
    await POST(new Request("http://localhost/api/pi/setup", { method: "POST", body: JSON.stringify({ mode: "separate" }) }));
    await PATCH(new Request("http://localhost/api/pi/setup", { method: "PATCH", body: JSON.stringify({ modelId: "gpt-5.6-luna", reasoningEffort: "max" }) }));
    const before = readPiConfiguration();
    const response = await POST(new Request("http://localhost/api/pi/setup", {
      method: "POST", headers: { origin: "https://untrusted.example", "content-type": "text/plain" },
      body: JSON.stringify({ mode: "separate" }),
    }));
    expect(response.status).toBe(400);
    expect(readPiConfiguration()).toEqual(before);
  });

  it("passes only validated draft preferences to the login coordinator", async () => {
    const preferences = { modelId: "gpt-5.6-sol", reasoningEffort: "high" };
    const response = await LOGIN(new Request("http://localhost/api/pi/setup/login", { method: "POST", body: JSON.stringify(preferences) }));
    expect(response.status).toBe(202);
    expect(startLogin).toHaveBeenCalledWith(preferences);
    expect(readPiConfiguration()).toBeNull();
  });

  it.each(["{broken", "{}", JSON.stringify({ modelId: "gpt-5.6-sol", reasoningEffort: "high", authPath: "/injected" })])("rejects malformed login preferences before starting OAuth", async (body) => {
    const response = await LOGIN(new Request("http://localhost/api/pi/setup/login", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(startLogin).not.toHaveBeenCalled();
  });

  it("persists supported model preferences through PATCH", async () => {
    await POST(new Request("http://localhost/api/pi/setup", { method: "POST", body: JSON.stringify({ mode: "separate" }) }));
    const response = await PATCH(new Request("http://localhost/api/pi/setup", { method: "PATCH", body: JSON.stringify({ modelId: "gpt-5.6-luna", reasoningEffort: "max" }) }));
    expect(response.status).toBe(200);
    expect(readPiConfiguration()).toMatchObject({ modelId: "gpt-5.6-luna", reasoningEffort: "max" });
  });

  it.each([
    { modelId: "unknown", reasoningEffort: "high" },
    { modelId: "gpt-5.4", reasoningEffort: "max" },
    { modelId: "gpt-5.6-sol", reasoningEffort: "ultra" },
    { modelId: "gpt-5.6-sol", reasoningEffort: "high", providerId: "openai" },
    { modelId: "gpt-5.6-sol", reasoningEffort: "high", authPath: "/injected" },
  ])("rejects invalid preference requests without changing persisted configuration", async (body) => {
    await POST(new Request("http://localhost/api/pi/setup", { method: "POST", body: JSON.stringify({ mode: "separate" }) }));
    const before = readPiConfiguration();
    const response = await PATCH(new Request("http://localhost/api/pi/setup", { method: "PATCH", body: JSON.stringify(body) }));
    expect(response.status).toBe(400);
    expect(readPiConfiguration()).toEqual(before);
  });

  it("does not save preferences without explicit setup consent", async () => {
    const response = await PATCH(new Request("http://localhost/api/pi/setup", { method: "PATCH", body: JSON.stringify({ modelId: "gpt-5.6-sol", reasoningEffort: "high" }) }));
    expect(response.status).toBe(400);
    expect(readPiConfiguration()).toBeNull();
  });

  it("persists a valid separate setup", async () => {
    const response = await POST(new Request("http://localhost/api/pi/setup", { method: "POST", body: JSON.stringify({ mode: "separate" }) }));
    expect(response.status).toBe(200);
    expect(readPiConfiguration()).toMatchObject({ mode: "separate", providerId: "openai-codex", modelId: "gpt-5.6-sol", reasoningEffort: "high" });
  });

  it.each([
    "{broken",
    JSON.stringify({ mode: "separate", authPath: "/arbitrary-path" }),
    JSON.stringify({ mode: "shared" }),
    JSON.stringify({ mode: "shared", candidateId: "a".repeat(64), acknowledgeApiBilling: "true" }),
    JSON.stringify({ mode: "unknown" }),
    "x".repeat(16_385),
  ])("rejects malformed or untrusted choice bodies without saving", async (body) => {
    const response = await POST(new Request("http://localhost/api/pi/setup", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(readPiConfiguration()).toBeNull();
  });
});
