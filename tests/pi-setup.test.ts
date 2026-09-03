import { describe, expect, it, vi } from "vitest";

import { getPiSetupStatus, PiLoginCoordinator } from "../src/server/pi-setup";

const configuredModel = {
  provider: "openai-codex",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
};

function sdkWithRuntime(runtime: object) {
  return async () =>
    ({
      getAgentDir: () => "/test/.pi/agent",
      ModelRuntime: { create: async () => runtime },
    }) as never;
}

describe("Pi setup readiness", () => {
  it("reports the bundled runtime, fixed model, and existing OAuth credential", async () => {
    const status = await getPiSetupStatus(
      sdkWithRuntime({
        getModel: () => configuredModel,
        listCredentials: async () => [{ providerId: "openai-codex", type: "oauth" }],
        getAuth: async () => ({ auth: { apiKey: "secret-not-exposed" }, source: "OAuth" }),
      }),
    );

    expect(status).toMatchObject({
      state: "ready",
      ready: true,
      runtime: { label: "Bundled Pi SDK" },
      authentication: {
        configured: true,
        label: "Connected with ChatGPT OAuth",
        source: "/test/.pi/agent/auth.json",
      },
      selection: {
        providerId: "openai-codex",
        modelId: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    });
    expect(JSON.stringify(status)).not.toContain("secret-not-exposed");
  });

  it("requires login when Pi has no stored OpenAI credential", async () => {
    const status = await getPiSetupStatus(
      sdkWithRuntime({
        getModel: () => configuredModel,
        listCredentials: async () => [],
      }),
    );
    expect(status).toMatchObject({ state: "needs-auth", ready: false });
  });

  it("reports an expired credential that cannot refresh", async () => {
    const status = await getPiSetupStatus(
      sdkWithRuntime({
        getModel: () => configuredModel,
        listCredentials: async () => [{ providerId: "openai-codex", type: "oauth" }],
        getAuth: async () => {
          throw new Error("invalid_grant");
        },
      }),
    );
    expect(status).toMatchObject({
      state: "auth-error",
      ready: false,
      issue: expect.stringContaining("invalid_grant"),
    });
  });

  it("reports a missing configured model", async () => {
    const status = await getPiSetupStatus(
      sdkWithRuntime({
        getModel: () => undefined,
      }),
    );
    expect(status).toMatchObject({ state: "model-unavailable", ready: false });
  });

  it("reports a missing bundled runtime", async () => {
    const status = await getPiSetupStatus(async () => {
      throw new Error("Cannot find Pi package");
    });
    expect(status).toMatchObject({
      state: "runtime-unavailable",
      ready: false,
      issue: "Cannot find Pi package",
    });
  });
});

describe("Pi device-code login", () => {
  it("publishes the code and completes a first-time login", async () => {
    let finishLogin!: () => void;
    const login = vi.fn(async (_provider, _type, interaction) => {
      expect(
        await interaction.prompt({
          type: "select",
          message: "Choose login",
          options: [{ id: "device_code", label: "Device code" }],
        }),
      ).toBe("device_code");
      interaction.notify({
        type: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
        expiresInSeconds: 900,
      });
      await new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
      return { type: "oauth", access: "access", refresh: "refresh", expires: Date.now() + 60_000 };
    });
    const coordinator = new PiLoginCoordinator(
      sdkWithRuntime({ getModel: () => configuredModel, login }),
    );

    const started = coordinator.start();
    await vi.waitFor(() => {
      expect(coordinator.get(started.id)).toMatchObject({
        state: "awaiting-user",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
      });
    });
    expect(coordinator.start().id).toBe(started.id);
    finishLogin();
    await vi.waitFor(() => {
      expect(coordinator.get(started.id)?.state).toBe("complete");
    });
  });

  it("cancels an in-progress login without reporting success", async () => {
    const login = vi.fn(async (_provider, _type, interaction) => {
      await interaction.prompt({
        type: "select",
        message: "Choose login",
        options: [{ id: "device_code", label: "Device code" }],
      });
      interaction.notify({
        type: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
      });
      await new Promise((_, reject) => {
        interaction.signal.addEventListener("abort", () => reject(new Error("Login cancelled")));
      });
    });
    const coordinator = new PiLoginCoordinator(
      sdkWithRuntime({ getModel: () => configuredModel, login }),
    );

    const started = coordinator.start();
    await vi.waitFor(() => expect(coordinator.get(started.id)?.state).toBe("awaiting-user"));
    expect(coordinator.cancel(started.id)).toMatchObject({
      state: "cancelled",
      message: "Login cancelled. No credential was saved.",
    });
    await vi.waitFor(() => expect(coordinator.get(started.id)?.state).toBe("cancelled"));
  });
});
