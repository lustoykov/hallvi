import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/server/pi-setup", () => ({ getPiSetupStatus: async () => ({ state: "needs-auth" }) }));

import { POST } from "../src/app/api/pi/setup/route";
import { readPiConfiguration } from "../src/server/pi-configuration";

beforeEach(() => { vi.stubEnv("SERVER_GUY_CONFIG_DIR", mkdtempSync(join(tmpdir(), "server-guy-pi-route-"))); });
afterEach(() => vi.unstubAllEnvs());

describe("Pi setup choice route", () => {
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
