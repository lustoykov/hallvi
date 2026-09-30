// OpenRouter beside ChatGPT: the sign-in that buys a key, and switching
// between the two accounts without losing either.
//
// The real Pi catalog and credential store run here; only OpenRouter's key
// endpoint is stood in for.

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  openRouterLogin,
  OpenRouterLoginCoordinator,
} from "../../../src/server/openrouter-login";
import {
  configuredPiRuntime,
  forgetChatgpt,
  forgetOpenRouter,
  loadPiSdk,
  openRouterAuthPath,
  readPiConfiguration,
  savePiConfiguration,
  saveOpenRouterKey,
  updatePiPreferences,
} from "../../../src/server/pi-configuration";
import {
  getPiSetupStatus,
  PiLoginCoordinator,
} from "../../../src/server/pi-setup";
import { DELETE as cancelSignIn } from "../../../src/app/api/pi/setup/openrouter/[attemptId]/route";
import { PATCH as selectModel } from "../../../src/app/api/pi/setup/route";
import { describePiFailure } from "../../../src/server/pi";

const KEY = "sk-or-v1-fixture0000000000000000";
let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "hallvi-openrouter-test-"));
  vi.stubEnv("HALLVI_CONFIG_DIR", directory);
  vi.stubEnv("HALLVI_PI_CONFIG_DIR", "");
  // Detection reads Pi's own login; keep it away from the real one.
  vi.stubEnv("PI_CODING_AGENT_DIR", join(directory, "pi"));
});
afterEach(() => {
  openRouterLogin.cancelAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function signIn() {
  const exchange = vi.fn<typeof fetch>(async () => Response.json({ key: KEY }));
  const coordinator = new OpenRouterLoginCoordinator(exchange as never);
  const login = coordinator.start("http://127.0.0.1:5747");
  return { coordinator, login, exchange };
}

function saveChatgpt() {
  const authPath = join(directory, "pi-auth.json");
  writeFileSync(
    authPath,
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
    mode: "shared",
    authPath,
  });
  return authPath;
}

function mutation(
  path: string,
  method: string,
  body?: unknown,
  origin = "http://localhost:5747",
) {
  return new Request(`http://localhost:5747${path}`, {
    method,
    headers: {
      Host: "localhost:5747",
      Origin: origin,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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

  it("claims an attempt before exchanging so duplicate callbacks cannot undo success", async () => {
    const response = Promise.withResolvers<Response>();
    const exchange = vi.fn<typeof fetch>(() => response.promise);
    const coordinator = new OpenRouterLoginCoordinator(exchange);
    const login = coordinator.start("http://localhost:5747");
    const finished = coordinator.finish(login.id, "code");
    expect(coordinator.get(login.id)?.state).toBe("exchanging");
    await expect(coordinator.finish(login.id, "same-code")).rejects.toThrow(
      "no longer open",
    );
    expect(exchange).toHaveBeenCalledOnce();
    response.resolve(Response.json({ key: KEY }));
    expect((await finished).state).toBe("complete");
    expect(coordinator.get(login.id)?.state).toBe("complete");
  });

  it.each(["cancel", "disconnect", "replace", "expire"] as const)(
    "does not save a late key after %s, even if the exchange ignores abort",
    async (action) => {
      saveChatgpt();
      const previous = readPiConfiguration();
      const response = Promise.withResolvers<Response>();
      const exchange = vi.fn<typeof fetch>(() => response.promise);
      const coordinator = new OpenRouterLoginCoordinator(exchange);
      const login = coordinator.start("http://localhost:5747");
      const finished = coordinator.finish(login.id, "code");
      if (action === "cancel") coordinator.cancel(login.id);
      if (action === "disconnect") coordinator.disconnect();
      if (action === "replace") coordinator.start("http://localhost:5747");
      if (action === "expire") {
        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + 16 * 60_000);
        expect(coordinator.get(login.id)).toBeNull();
      }
      expect(exchange.mock.calls[0]![1]!.signal!.aborted).toBe(true);
      response.resolve(Response.json({ key: KEY }));
      expect((await finished).state).toBe("cancelled");
      expect(readPiConfiguration()).toEqual(previous);
      expect(() => readFileSync(openRouterAuthPath())).toThrow();
      coordinator.cancelAll();
    },
  );

  it("requires the controller origin to cancel and rejects a later callback", async () => {
    const login = openRouterLogin.start("http://localhost:5747");
    const context = { params: Promise.resolve({ attemptId: login.id }) };
    expect(
      (
        await cancelSignIn(
          mutation(
            "/api/pi/setup/openrouter/attempt",
            "DELETE",
            undefined,
            "https://example.com",
          ),
          context,
        )
      ).status,
    ).toBe(400);
    expect(openRouterLogin.get(login.id)?.state).toBe("awaiting-user");
    const result = await cancelSignIn(
      mutation("/api/pi/setup/openrouter/attempt", "DELETE"),
      context,
    );
    expect(await result.json()).toMatchObject({ state: "cancelled" });
    await expect(openRouterLogin.finish(login.id, "code")).rejects.toThrow(
      "no longer open",
    );
    expect(readPiConfiguration()).toBeNull();
  });

  it("cancels an older OpenRouter sign-in when starting ChatGPT or selecting its model", async () => {
    saveChatgpt();
    const pending = openRouterLogin.start("http://localhost:5747");
    const chatgpt = new PiLoginCoordinator();
    const attempt = chatgpt.start({
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-5",
      reasoningEffort: "high",
    });
    // Abort before the SDK loads: never contact OpenAI.
    chatgpt.cancel(attempt.id);
    expect(openRouterLogin.get(pending.id)?.state).toBe("cancelled");
    const later = openRouterLogin.start("http://localhost:5747");
    const result = await selectModel(
      mutation("/api/pi/setup", "PATCH", {
        providerId: "openai-codex",
        modelId: "gpt-6-sol",
        reasoningEffort: "high",
      }),
    );
    expect(result.status).toBe(200);
    await expect(openRouterLogin.finish(later.id, "code")).rejects.toThrow(
      "no longer open",
    );
    expect(readPiConfiguration()?.providerId).toBe("openai-codex");
  });
});

describe("two model accounts", () => {
  it("pins a running turn's key while replacement and disconnect apply to future turns", async () => {
    saveOpenRouterKey(KEY);
    const sdk = await loadPiSdk();
    const running = await configuredPiRuntime(sdk);
    const replacement = `${KEY}-replacement`;
    saveOpenRouterKey(replacement);
    const next = await configuredPiRuntime(sdk);
    expect(
      (await running.modelRuntime.getAuth(running.model))?.auth.apiKey,
    ).toBe(KEY);
    expect((await next.modelRuntime.getAuth(next.model))?.auth.apiKey).toBe(
      replacement,
    );
    forgetOpenRouter();
    expect(
      (await running.modelRuntime.getAuth(running.model))?.auth.apiKey,
    ).toBe(KEY);
    expect((await next.modelRuntime.getAuth(next.model))?.auth.apiKey).toBe(
      replacement,
    );
    await expect(configuredPiRuntime(sdk)).rejects.toThrow("connect a model");
  });

  it("keeps ChatGPT ready when the unused OpenRouter credential is malformed", async () => {
    saveChatgpt();
    writeFileSync(openRouterAuthPath(), '{"openrouter":');
    expect(await getPiSetupStatus()).toMatchObject({
      ready: true,
      connections: { chatgpt: true, openRouter: false },
      selection: { provider: "ChatGPT" },
      issue: null,
    });
    savePiConfiguration({
      ...readPiConfiguration()!,
      providerId: "openrouter",
      modelId: "anthropic/claude-sonnet-5",
    });
    expect(await getPiSetupStatus()).toMatchObject({
      ready: false,
      state: "auth-error",
      connections: { chatgpt: true, openRouter: false },
    });
  });

  it.each(["invalid-json", "invalid-model", "invalid-connection"])(
    "connecting OpenRouter recovers %s settings and preserves only valid ChatGPT metadata",
    async (damage) => {
      const authPath = saveChatgpt();
      const settings = join(directory, "pi-settings.json");
      writeFileSync(
        settings,
        damage === "invalid-json"
          ? "{"
          : JSON.stringify({
              ...readPiConfiguration(),
              modelId: null,
              ...(damage === "invalid-connection" ? { authPath: 42 } : {}),
            }),
      );
      const { coordinator, login } = signIn();
      expect((await coordinator.finish(login.id, "code")).state).toBe(
        "complete",
      );
      expect(readPiConfiguration()).toEqual({
        providerId: "openrouter",
        modelId: "anthropic/claude-sonnet-5",
        reasoningEffort: "high",
        ...(damage === "invalid-model" ? { mode: "shared", authPath } : {}),
      });
      expect((await getPiSetupStatus()).ready).toBe(true);
    },
  );

  it.each([
    ["anthropic/claude-sonnet-5", 401],
    ["openai/gpt-6-sol", 401],
    ["anthropic/claude-sonnet-5", 402],
    ["openai/gpt-6-sol", 402],
  ] as const)(
    "explains the real SDK error for %s / %i without exposing the body",
    async (modelId, status) => {
      const exchange = vi.fn<typeof fetch>(async () =>
        Response.json(
          { error: { code: status, message: `private-response-${KEY}` } },
          { status },
        ),
      );
      vi.stubGlobal("fetch", exchange);
      saveOpenRouterKey(KEY);
      await updatePiPreferences({
        providerId: "openrouter",
        modelId,
        reasoningEffort: "high",
      });
      const turn = await configuredPiRuntime(await loadPiSdk());
      const reply = await turn.modelRuntime.completeSimple(
        turn.model,
        {
          messages: [
            { role: "user", content: "fixture", timestamp: Date.now() },
          ],
        },
        { maxTokens: 1 },
      );
      expect(reply.stopReason).toBe("error");
      expect(reply.errorMessage).toMatch(new RegExp(`^${status}\\b`));
      const explanation = describePiFailure(new Error(reply.errorMessage));
      expect(explanation).toContain(
        status === 401 ? "connect it again" : "spending limit",
      );
      expect(explanation).not.toContain(KEY);
      expect(explanation).not.toContain("private-response");
      expect(exchange).toHaveBeenCalledOnce();
    },
  );

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
        modelId: "x-ai/grok-4.7",
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
