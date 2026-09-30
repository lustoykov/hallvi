// OpenRouter beside ChatGPT: the sign-in that buys a key, and switching
// between the two accounts without losing either.
//
// The real Pi catalog and credential store run here; only OpenRouter's key
// endpoint is stood in for.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OpenRouterLoginCoordinator } from "../../../src/server/openrouter-login";
import {
  configuredPiRuntime,
  forgetChatgpt,
  forgetOpenRouter,
  loadPiSdk,
  openRouterAuthPath,
  readPiConfiguration,
  savePiConfiguration,
  updatePiPreferences,
} from "../../../src/server/pi-configuration";
import { getPiSetupStatus } from "../../../src/server/pi-setup";

const KEY = "sk-or-v1-fixture0000000000000000";
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "hallvi-openrouter-test-"));
  vi.stubEnv("HALLVI_CONFIG_DIR", directory);
  vi.stubEnv("HALLVI_PI_CONFIG_DIR", "");
  // Detection reads Pi's own login; keep it away from the real one.
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "pi"));
});
afterEach(() => vi.unstubAllEnvs());

function signIn() {
  const exchange = vi.fn<typeof fetch>(async () => Response.json({ key: KEY }));
  const coordinator = new OpenRouterLoginCoordinator(exchange as never);
  const login = coordinator.start("http://127.0.0.1:5747");
  return { coordinator, login, exchange };
}

describe("signing in with OpenRouter", () => {
  it("comes back to this controller and buys a key only with this attempt's secret", async () => {
    const { coordinator, login, exchange } = signIn();
    const authorize = new URL(login.authorizeUrl);
    expect(authorize.origin).toBe("https://openrouter.ai");
    const callback = new URL(authorize.searchParams.get("callback_url")!);
    expect(callback.origin).toBe("http://127.0.0.1:5747");
    expect(callback.searchParams.get("attempt")).toBe(login.id);

    // Another attempt's code, or none, buys nothing.
    await expect(coordinator.finish("someone-else", "code")).rejects.toThrow(
      "no longer open",
    );
    expect(readPiConfiguration()).toBeNull();

    const finished = await coordinator.finish(login.id, "one-time-code");
    expect(finished).toMatchObject({ state: "complete" });
    expect(JSON.stringify(finished)).not.toContain(KEY);
    const body = JSON.parse(String(exchange.mock.calls[0]![1]!.body));
    expect(
      createHash("sha256").update(body.code_verifier).digest("base64url"),
    ).toBe(authorize.searchParams.get("code_challenge"));

    // Pi's own format, readable by this user only, and chosen from now on.
    expect(statSync(openRouterAuthPath()).mode & 0o777).toBe(0o600);
    expect(readPiConfiguration()).toMatchObject({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-5",
    });
    const turn = await configuredPiRuntime(await loadPiSdk());
    expect(turn.model.id).toBe("anthropic/claude-sonnet-5");
    expect(await turn.modelRuntime.getAuth(turn.model)).toBeTruthy();
    // A code is spent once.
    await expect(coordinator.finish(login.id, "again")).rejects.toThrow(
      "no longer open",
    );
  });

  it("saves nothing when OpenRouter refuses the code", async () => {
    const coordinator = new OpenRouterLoginCoordinator(
      (async () => new Response("{}", { status: 403 })) as never,
    );
    const login = coordinator.start("http://localhost:5747");
    expect(await coordinator.finish(login.id, "stale")).toMatchObject({
      state: "failed",
      message: expect.stringContaining("Nothing was saved"),
    });
    expect(readPiConfiguration()).toBeNull();
    expect(() => readFileSync(openRouterAuthPath())).toThrow();
  });
});

describe("two model accounts", () => {
  it("switches between ChatGPT and OpenRouter and keeps the other when one leaves", async () => {
    const chatgptAuth = join(directory, "pi-auth.json");
    writeFileSync(
      chatgptAuth,
      JSON.stringify({
        "openai-codex": {
          type: "oauth",
          access: "a",
          refresh: "r",
          expires: Date.now() + 3_600_000,
        },
      }),
    );
    savePiConfiguration({
      providerId: "openai-codex",
      modelId: "gpt-6-sol",
      reasoningEffort: "high",
      mode: "separate",
      authPath: chatgptAuth,
    });
    const { coordinator, login } = signIn();
    await coordinator.finish(login.id, "code");
    expect(await getPiSetupStatus()).toMatchObject({
      ready: true,
      connections: { chatgpt: true, openRouter: true },
      selection: { provider: "OpenRouter", model: "Claude Sonnet 5" },
    });

    // Only the offered OpenRouter models, and only a connected account's.
    await expect(
      updatePiPreferences({
        providerId: "openrouter",
        modelId: "openai/gpt-6-sol",
        reasoningEffort: "high",
      }),
    ).rejects.toThrow("Hallvi offers");
    await updatePiPreferences({
      providerId: "openai-codex",
      modelId: "gpt-6-sol",
      reasoningEffort: "high",
    });
    expect((await configuredPiRuntime(await loadPiSdk())).model.id).toBe(
      "gpt-6-sol",
    );

    forgetChatgpt();
    expect(readPiConfiguration()).toEqual({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-5",
      reasoningEffort: "high",
    });
    // ChatGPT's own file is never Hallvi's to delete.
    expect(readFileSync(chatgptAuth, "utf8")).toContain("openai-codex");
    await expect(
      updatePiPreferences({
        providerId: "openai-codex",
        modelId: "gpt-6-sol",
        reasoningEffort: "high",
      }),
    ).rejects.toThrow("Connect ChatGPT");

    forgetOpenRouter();
    expect(readPiConfiguration()).toBeNull();
    expect(() => readFileSync(openRouterAuthPath())).toThrow();
    expect(await getPiSetupStatus()).toMatchObject({
      ready: false,
      connections: { chatgpt: false, openRouter: false },
    });
  });
});
