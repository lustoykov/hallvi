import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  choosePiSetup,
  choosePiSetupSchema,
  configuredPiRuntime,
  detectPiSetup,
  readPiConfiguration,
  piAccountDir,
  piConfigDir,
  readPiCredential,
  updatePiPreferences,
} from "../../../src/server/pi-configuration";
import {
  getPiSetupStatus,
  PiLoginCoordinator,
} from "../../../src/server/pi-setup";

const model = {
  provider: "openai-codex",
  id: "gpt-5.6-sol",
  name: "GPT-5.6 Sol",
  reasoning: true,
};
const oauth = {
  type: "oauth",
  access: "secret-access",
  refresh: "secret-refresh",
  expires: Date.now() + 3_600_000,
};
let directory: string;
let agentDirectory: string;
const alternateModel = {
  ...model,
  id: "gpt-5.6-luna",
  name: "GPT-5.6 Luna",
  thinkingLevelMap: { max: "max" },
};
const runtime = {
  getModel: vi.fn(),
  getModels: vi.fn(),
  getProvider: vi.fn(),
  getAuth: vi.fn(),
  setRuntimeApiKey: vi.fn(),
  login: vi.fn(),
};
const createRuntime = vi.fn();
class CredentialSynchronizationError extends Error {}
const sdkLoader = async () =>
  ({
    getAgentDir: () => agentDirectory,
    ModelRuntime: { create: createRuntime },
    CredentialSynchronizationError,
  }) as never;
function preferences(value: object) {
  writeFileSync(join(agentDirectory, "settings.json"), JSON.stringify(value));
}
function credentials(value: object) {
  writeFileSync(join(agentDirectory, "auth.json"), JSON.stringify(value));
}
async function adopt() {
  const detected = await detectPiSetup(await sdkLoader());
  await choosePiSetup({ mode: "shared", candidateId: detected.id }, sdkLoader);
}

beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(join(tmpdir(), "haldur-pi-test-"));
  agentDirectory = join(directory, "pi");
  mkdirSync(agentDirectory);
  vi.stubEnv("HALDUR_CONFIG_DIR", join(directory, "haldur"));
  preferences({
    defaultProvider: model.provider,
    defaultModel: model.id,
    defaultThinkingLevel: "medium",
  });
  credentials({ [model.provider]: oauth });
  runtime.getModel.mockImplementation((_provider, id) =>
    [model, alternateModel].find((item) => item.id === id),
  );
  runtime.getModels.mockReturnValue([model, alternateModel]);
  runtime.getProvider.mockReturnValue({
    auth: { oauth: { isSubscription: true }, apiKey: {} },
  });
  runtime.getAuth.mockResolvedValue({ auth: { apiKey: "secret-access" } });
  createRuntime.mockResolvedValue(runtime);
});
afterEach(() => vi.unstubAllEnvs());

describe("explicit Pi adoption", () => {
  it("reports the resolved diagnostic path without creating a log file", async () => {
    vi.stubEnv("HALDUR_DB_PATH", join(directory, "state", "app.db"));
    vi.stubEnv("HALDUR_LOG_DIR", "");
    const expected = join(directory, "state", "diagnostics", "replies.ndjson");
    expect((await getPiSetupStatus(sdkLoader)).diagnosticLogPath).toBe(
      expected,
    );
    expect(existsSync(expected)).toBe(false);
    vi.stubEnv("HALDUR_LOG_DIR", "custom/logs");
    expect((await getPiSetupStatus(sdkLoader)).diagnosticLogPath).toBe(
      resolve("custom/logs/replies.ndjson"),
    );
    vi.stubEnv("HALDUR_LOG_DIR", join(directory, "custom logs"));
    expect((await getPiSetupStatus(sdkLoader)).diagnosticLogPath).toBe(
      join(directory, "custom logs", "replies.ndjson"),
    );
  });
  it.each(["shared", "separate"] as const)(
    "disconnects %s setup without deleting credentials or automatically reusing them",
    async (mode) => {
      if (mode === "shared") await adopt();
      else {
        await choosePiSetup({ mode: "separate" }, sdkLoader);
        writeFileSync(
          readPiConfiguration()!.authPath,
          JSON.stringify({ [model.provider]: oauth }),
        );
      }
      const authPath = readPiConfiguration()!.authPath;
      const before = readFileSync(authPath, "utf8");
      const piPreferences = readFileSync(
        join(agentDirectory, "settings.json"),
        "utf8",
      );
      const coordinator = new PiLoginCoordinator(sdkLoader);
      coordinator.disconnect();
      coordinator.disconnect(); // Safe to retry after a lost response.
      expect(readPiConfiguration()).toBeNull();
      expect(readFileSync(authPath, "utf8")).toBe(before);
      expect(readFileSync(join(agentDirectory, "settings.json"), "utf8")).toBe(
        piPreferences,
      );
      expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
        ready: false,
        detected: { canReuse: true },
      });
      await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow(
        "choose whether",
      );
      expect(runtime.getAuth).not.toHaveBeenCalled();
    },
  );

  it("automatically finds a reusable Pi login when saved Haldur credentials are missing", async () => {
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    const before = readPiConfiguration();
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      state: "needs-auth",
      ready: false,
      detected: { canReuse: true },
    });
    expect(readPiConfiguration()).toEqual(before);
    expect(runtime.getAuth).not.toHaveBeenCalled();
    expect(runtime.login).not.toHaveBeenCalled();
  });

  it("finds a recovery login even when the saved Haldur configuration is malformed", async () => {
    mkdirSync(join(directory, "haldur"));
    writeFileSync(join(directory, "haldur", "pi-settings.json"), "{broken}");
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      ready: false,
      detected: { canReuse: true },
    });
    expect(runtime.getAuth).not.toHaveBeenCalled();
    expect(
      readFileSync(join(directory, "haldur", "pi-settings.json"), "utf8"),
    ).toBe("{broken}");
  });

  it("does not let unrelated broken Pi preferences invalidate a saved Haldur login", async () => {
    await adopt();
    writeFileSync(join(agentDirectory, "settings.json"), "{broken}");
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      ready: true,
      mode: "shared",
      detected: { canReuse: false },
    });
  });

  it("persists choices across reads and uses them on the next runtime without mutating an earlier snapshot", async () => {
    await adopt();
    const globalBefore = readFileSync(
      join(agentDirectory, "settings.json"),
      "utf8",
    );
    const authBefore = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    const earlierTurn = await configuredPiRuntime(await sdkLoader());
    await updatePiPreferences(
      { modelId: alternateModel.id, reasoningEffort: "max" },
      sdkLoader,
    );
    expect(readPiConfiguration()).toMatchObject({
      mode: "shared",
      authPath: join(agentDirectory, "auth.json"),
      modelId: alternateModel.id,
      reasoningEffort: "max",
    });
    const nextTurn = await configuredPiRuntime(await sdkLoader());
    expect(nextTurn.model).toBe(alternateModel);
    expect(nextTurn.configuration.reasoningEffort).toBe("max");
    expect(earlierTurn.model).toBe(model);
    expect(earlierTurn.configuration.reasoningEffort).toBe("medium");
    expect(readFileSync(join(agentDirectory, "settings.json"), "utf8")).toBe(
      globalBefore,
    );
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      authBefore,
    );
  });

  it.each([
    { modelId: "unknown-model", reasoningEffort: "high" as const },
    { modelId: model.id, reasoningEffort: "max" as const },
  ])(
    "rejects invalid model/effort choices without changing saved settings",
    async (input) => {
      await adopt();
      const before = readPiConfiguration();
      await expect(updatePiPreferences(input, sdkLoader)).rejects.toThrow();
      expect(readPiConfiguration()).toEqual(before);
    },
  );

  it("rejects an unsupported persisted effort before auth or a new turn", async () => {
    await adopt();
    writeFileSync(
      join(directory, "haldur", "pi-settings.json"),
      JSON.stringify({ ...readPiConfiguration(), reasoningEffort: "max" }),
    );
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      ready: false,
      state: "model-unavailable",
      issue: expect.stringContaining("reasoning effort"),
    });
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow(
      "reasoning effort",
    );
    expect(runtime.getAuth).not.toHaveBeenCalled();
  });

  it("preserves supported max effort from existing Pi but rejects unsupported preferences", async () => {
    preferences({
      defaultProvider: model.provider,
      defaultModel: alternateModel.id,
      defaultThinkingLevel: "max",
    });
    await adopt();
    expect(readPiConfiguration()).toMatchObject({
      modelId: alternateModel.id,
      reasoningEffort: "max",
    });
    preferences({
      defaultProvider: model.provider,
      defaultModel: model.id,
      defaultThinkingLevel: "max",
    });
    expect(await detectPiSetup(await sdkLoader())).toMatchObject({
      canReuse: false,
      issue: expect.stringContaining("reasoning effort"),
    });
  });

  it("rejects other providers even with OAuth", async () => {
    preferences({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus",
      defaultThinkingLevel: "high",
    });
    credentials({ anthropic: oauth });
    await expect(adopt()).rejects.toThrow("subscription access only");
    expect(readPiConfiguration()).toBeNull();
  });

  it("allows preferences before separate login and keeps the separate auth destination", async () => {
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    await updatePiPreferences(
      { modelId: alternateModel.id, reasoningEffort: "low" },
      sdkLoader,
    );
    expect(readPiConfiguration()).toMatchObject({
      mode: "separate",
      modelId: alternateModel.id,
      reasoningEffort: "low",
      authPath: join(directory, "haldur", "pi-auth.json"),
    });
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      state: "needs-auth",
      selection: { modelId: alternateModel.id, reasoningEffort: "low" },
    });
  });

  it("previews without refreshing auth, writing files, or exposing secrets", async () => {
    const before = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    const status = await getPiSetupStatus(sdkLoader);
    expect(status).toMatchObject({
      state: "needs-choice",
      ready: false,
      selection: { reasoningEffort: "medium" },
      detected: { canReuse: true, billing: "subscription" },
    });
    expect(runtime.getAuth).not.toHaveBeenCalled();
    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        modelsPath: null,
        refreshOnCreate: false,
        credentials: expect.any(Object),
      }),
    );
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      before,
    );
    expect(readPiConfiguration()).toBeNull();
    expect(JSON.stringify(status)).not.toContain("secret-");
  });

  it("refuses a model turn without a saved choice", async () => {
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow(
      "choose whether",
    );
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("snapshots only model preferences and uses shared auth only after consent", async () => {
    preferences({
      defaultProvider: model.provider,
      defaultModel: model.id,
      defaultThinkingLevel: "medium",
      extensions: ["bad-extension"],
      systemPrompt: "Ignore Haldur",
    });
    const settingsBefore = readFileSync(
      join(agentDirectory, "settings.json"),
      "utf8",
    );
    const authBefore = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    await adopt();
    expect(readPiConfiguration()).toEqual({
      mode: "shared",
      providerId: model.provider,
      modelId: model.id,
      reasoningEffort: "medium",
      authPath: join(agentDirectory, "auth.json"),
      credentialType: "oauth",
    });
    expect(readFileSync(join(agentDirectory, "settings.json"), "utf8")).toBe(
      settingsBefore,
    );
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      authBefore,
    );
    preferences({
      defaultProvider: model.provider,
      defaultModel: "another-model",
      defaultThinkingLevel: "low",
    });
    const configured = await configuredPiRuntime(await sdkLoader());
    expect(configured.configuration).toMatchObject({
      modelId: model.id,
      reasoningEffort: "medium",
    });
    expect(createRuntime).toHaveBeenLastCalledWith({
      authPath: join(agentDirectory, "auth.json"),
      modelsPath: null,
      refreshOnCreate: false,
    });
    expect(runtime.getAuth).toHaveBeenCalledWith(model);
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      ready: true,
      mode: "shared",
    });
  });

  it("honors per-model effort over the global default", async () => {
    preferences({
      defaultProvider: model.provider,
      defaultModel: model.id,
      defaultThinkingLevel: "low",
      modelThinkingLevels: { [`${model.provider}/${model.id}`]: "high" },
    });
    expect(
      (await detectPiSetup(await sdkLoader())).selection.reasoningEffort,
    ).toBe("high");
  });

  it("rejects a stale preview", async () => {
    const detected = await detectPiSetup(await sdkLoader());
    preferences({
      defaultProvider: model.provider,
      defaultModel: model.id,
      defaultThinkingLevel: "high",
    });
    await expect(
      choosePiSetup({ mode: "shared", candidateId: detected.id }, sdkLoader),
    ).rejects.toThrow("setup changed");
    expect(readPiConfiguration()).toBeNull();
  });

  it("lets an existing setup be previewed without replacing the saved choice", async () => {
    await adopt();
    const before = readPiConfiguration();
    preferences({
      defaultProvider: model.provider,
      defaultModel: model.id,
      defaultThinkingLevel: "high",
    });
    expect(await getPiSetupStatus(sdkLoader, true)).toMatchObject({
      state: "needs-choice",
      hasSavedConfiguration: true,
      selection: { reasoningEffort: "high" },
    });
    expect(readPiConfiguration()).toEqual(before);
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      ready: true,
      selection: { reasoningEffort: "medium" },
    });
  });

  it("rejects credentials unsupported by the selected provider", async () => {
    credentials({ [model.provider]: { type: "api_key", key: "fixture-key" } });
    runtime.getProvider.mockReturnValue({
      auth: { oauth: { isSubscription: true } },
    });
    expect(await detectPiSetup(await sdkLoader())).toMatchObject({
      canReuse: false,
      issue: expect.stringContaining("subscription access only"),
    });
  });

  it("rejects API credentials rather than offering API billing", async () => {
    credentials({
      [model.provider]: { type: "api_key", key: "fixture-api-key" },
    });
    await expect(adopt()).rejects.toThrow("subscription access only");
    expect(readPiConfiguration()).toBeNull();
    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalled();
  });

  it("rejects a credential type change after consent", async () => {
    await adopt();
    credentials({ [model.provider]: { type: "api_key", key: "new-key" } });
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow(
      "type changed",
    );
    expect(runtime.getAuth).not.toHaveBeenCalled();
  });

  it("can configure separately even with malformed global settings", async () => {
    writeFileSync(join(agentDirectory, "settings.json"), "{broken}");
    const before = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    expect((await detectPiSetup(await sdkLoader())).canReuse).toBe(false);
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    expect(readPiConfiguration()).toMatchObject({
      mode: "separate",
      authPath: join(directory, "haldur", "pi-auth.json"),
      reasoningEffort: "high",
    });
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      state: "needs-auth",
      ready: false,
    });
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      before,
    );
  });

  it("offers defaults with no matching credentials, never auto-adopts", async () => {
    preferences({});
    credentials({});
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({
      state: "needs-choice",
      billing: "subscription",
      detected: { usesDefaultModel: true, canReuse: false },
    });
  });

  it.each([
    { [model.provider]: { type: "oauth", access: "secret-only" } },
    { [model.provider]: { type: "api_key", key: "!echo secret-command" } },
  ])(
    "rejects incomplete or command-based credentials safely",
    async (value) => {
      credentials(value);
      const detected = await detectPiSetup(await sdkLoader());
      expect(detected.canReuse).toBe(false);
      expect(JSON.stringify(detected)).not.toContain("secret-");
      expect(runtime.getAuth).not.toHaveBeenCalled();
    },
  );

  it("redacts malformed credential JSON errors", async () => {
    writeFileSync(join(agentDirectory, "auth.json"), '{"secret-access": oops}');
    const detected = await detectPiSetup(await sdkLoader());
    expect(detected.canReuse).toBe(false);
    expect(JSON.stringify(detected)).not.toContain("secret-access");
  });

  it("does not import custom model/provider definitions", async () => {
    runtime.getModel.mockReturnValue(undefined);
    expect(await detectPiSetup(await sdkLoader())).toMatchObject({
      canReuse: false,
      issue: expect.stringContaining("Custom model/provider"),
    });
  });

  it("reports refresh failure without falling back to an API key", async () => {
    await adopt();
    runtime.getAuth.mockRejectedValue(new Error("invalid_grant"));
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow(
      "invalid_grant",
    );
    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalled();
  });

  it("rejects client-supplied credential paths and extra fields", () => {
    expect(
      choosePiSetupSchema.safeParse({
        mode: "separate",
        authPath: "/some/path",
      }).success,
    ).toBe(false);
  });

  it("reports missing runtime without making a choice", async () => {
    expect(
      await getPiSetupStatus(async () => {
        throw new Error("Cannot load Pi");
      }),
    ).toMatchObject({ state: "runtime-unavailable", ready: false });
  });
});

describe("separate Pi device-code login", () => {
  const selection = {
    modelId: alternateModel.id,
    reasoningEffort: "max" as const,
  };
  function saveLogin(value: object = oauth) {
    writeFileSync(
      createRuntime.mock.lastCall![0].authPath,
      JSON.stringify({ [model.provider]: value }),
      { mode: 0o600 },
    );
  }

  it("signs in directly and saves the user's draft model only after success", async () => {
    runtime.login.mockImplementation(async () => {
      expect(readPiConfiguration()).toBeNull();
      saveLogin();
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start(selection);
    expect(readPiConfiguration()).toBeNull();
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("complete"),
    );
    expect(readPiConfiguration()).toMatchObject({
      ...selection,
      mode: "separate",
      authPath: attempt.authPath,
    });
    expect((await getPiSetupStatus(sdkLoader)).ready).toBe(true);
  });

  it("publishes the code, deduplicates an active attempt and preserves the old login until success", async () => {
    await adopt();
    const before = readPiConfiguration();
    const authBefore = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    let finishLogin!: () => void;
    runtime.login.mockImplementation(async (_provider, _type, interaction) => {
      expect(
        await interaction.prompt({
          type: "select",
          options: [{ id: "device_code" }],
        }),
      ).toBe("device_code");
      interaction.notify({
        type: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
      });
      await new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
      saveLogin();
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("awaiting-user"),
    );
    expect(
      coordinator.start({ modelId: model.id, reasoningEffort: "high" }),
    ).toMatchObject({ id: attempt.id, selection });
    expect(createRuntime).toHaveBeenLastCalledWith({
      authPath: attempt.authPath,
      modelsPath: null,
      refreshOnCreate: false,
    });
    expect(readPiConfiguration()).toEqual(before);
    finishLogin();
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("complete"),
    );
    expect(readPiConfiguration()?.authPath).toBe(attempt.authPath);
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      authBefore,
    );
  });

  it("cancels an in-progress login and ignores late SDK notifications", async () => {
    await adopt();
    const before = readPiConfiguration();
    runtime.login.mockImplementation(async (_provider, _type, interaction) => {
      interaction.notify({
        type: "device_code",
        userCode: "ABCD-EFGH",
        verificationUri: "https://auth.openai.com/codex/device",
      });
      saveLogin();
      await new Promise((_, reject) =>
        interaction.signal.addEventListener("abort", () => {
          queueMicrotask(() =>
            interaction.notify({
              type: "device_code",
              userCode: "LATE-CODE",
              verificationUri: "https://auth.openai.com/codex/device",
            }),
          );
          reject(new Error("cancelled"));
        }),
      );
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("awaiting-user"),
    );
    expect(coordinator.cancel(attempt.id)?.state).toBe("cancelled");
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("cancelled"),
    );
    await vi.waitFor(() => expect(existsSync(attempt.authPath)).toBe(false));
    expect(coordinator.get(attempt.id)?.userCode).toBe("ABCD-EFGH");
    expect(readPiConfiguration()).toEqual(before);
  });

  it("disconnect cancels a pending replacement so late OAuth success cannot reconnect", async () => {
    await adopt();
    const authBefore = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    let finishLogin!: () => void;
    runtime.login.mockImplementation(async (_provider, _type, interaction) => {
      interaction.notify({
        type: "device_code",
        userCode: "TEST-CODE",
        verificationUri: "https://example.test",
      });
      await new Promise<void>((resolve) => {
        finishLogin = resolve;
      });
      saveLogin();
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("awaiting-user"),
    );
    coordinator.disconnect();
    finishLogin();
    await vi.waitFor(() => expect(existsSync(attempt.authPath)).toBe(false));
    expect(coordinator.get(attempt.id)?.state).toBe("cancelled");
    expect(readPiConfiguration()).toBeNull();
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(
      authBefore,
    );
  });

  it("keeps an existing separate login intact when its replacement fails", async () => {
    runtime.login.mockImplementation(async () => saveLogin());
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const first = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(first.id)?.state).toBe("complete"),
    );
    const before = readPiConfiguration();
    const authBefore = readFileSync(first.authPath, "utf8");
    runtime.login.mockImplementation(async () => {
      saveLogin();
      throw new Error("Provider rejected sign-in");
    });
    const second = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(second.id)?.state).toBe("failed"),
    );
    expect(readPiConfiguration()).toEqual(before);
    expect(readFileSync(first.authPath, "utf8")).toBe(authBefore);
    expect(existsSync(second.authPath)).toBe(false);
  });

  it.each([undefined, { type: "api_key", key: "fixture-key" }])(
    "does not report success without saved OAuth credentials",
    async (credential) => {
      runtime.login.mockImplementation(async () => {
        if (credential) saveLogin(credential);
      });
      const coordinator = new PiLoginCoordinator(sdkLoader);
      const attempt = coordinator.start(selection);
      await vi.waitFor(() =>
        expect(coordinator.get(attempt.id)?.state).toBe("failed"),
      );
      expect(readPiConfiguration()).toBeNull();
      expect(existsSync(attempt.authPath)).toBe(false);
    },
  );

  it("recognizes credentials committed before an SDK snapshot-refresh failure", async () => {
    runtime.login.mockImplementation(async () => {
      saveLogin();
      throw new CredentialSynchronizationError("secret-credential-details");
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start(selection);
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("complete"),
    );
    expect(coordinator.get(attempt.id)?.message).toContain(
      "local refresh failed",
    );
    expect(JSON.stringify(coordinator.get(attempt.id))).not.toContain(
      "secret-",
    );
    expect(readPiConfiguration()?.authPath).toBe(attempt.authPath);
  });

  it("rejects unsupported preferences before starting provider login", async () => {
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start({
      modelId: model.id,
      reasoningEffort: "max",
    });
    await vi.waitFor(() =>
      expect(coordinator.get(attempt.id)?.state).toBe("failed"),
    );
    expect(runtime.login).not.toHaveBeenCalled();
    expect(readPiConfiguration()).toBeNull();
  });
});

describe("Pi login across development previews", () => {
  it("uses a machine location by default, independent of the checkout", () => {
    vi.stubEnv("HALDUR_CONFIG_DIR", "");
    const cwd = vi.spyOn(process, "cwd");
    try {
      cwd.mockReturnValue(join(directory, "preview-one"));
      const first = piAccountDir();
      cwd.mockReturnValue(join(directory, "preview-two"));
      expect(piAccountDir()).toBe(first);
      expect(first).toBe(join(homedir(), ".config", "haldur", "pi"));
    } finally {
      cwd.mockRestore();
    }
  });

  it("keeps explicitly isolated controllers isolated", () => {
    const first = piAccountDir();
    vi.stubEnv("HALDUR_CONFIG_DIR", join(directory, "other-controller"));
    expect(piAccountDir()).not.toBe(first);
    expect(piAccountDir()).toBe(piConfigDir());
  });

  it("shares login and refreshed credentials without sharing application state", async () => {
    vi.stubEnv("HALDUR_PI_CONFIG_DIR", join(directory, "account"));
    const firstState = piConfigDir();
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    const authPath = readPiConfiguration()!.authPath;
    writeFileSync(authPath, JSON.stringify({ [model.provider]: oauth }));
    vi.stubEnv("HALDUR_CONFIG_DIR", join(directory, "preview-two"));
    expect(piConfigDir()).not.toBe(firstState);
    expect(readPiConfiguration()!.authPath).toBe(authPath);
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({ ready: true });
    await configuredPiRuntime(await sdkLoader());
    expect(createRuntime).toHaveBeenLastCalledWith({
      authPath,
      modelsPath: null,
      refreshOnCreate: false,
    });
    // Simulate the SDK persisting a refresh; both previews read the same file.
    const refreshed = { ...oauth, access: "refreshed-access" };
    writeFileSync(authPath, JSON.stringify({ [model.provider]: refreshed }));
    vi.stubEnv("HALDUR_CONFIG_DIR", firstState);
    expect(
      readPiCredential(readPiConfiguration()!.authPath, model.provider),
    ).toEqual(refreshed);
    expect(existsSync(join(firstState, "pi-settings.json"))).toBe(false);
    const coordinator = new PiLoginCoordinator(sdkLoader);
    coordinator.disconnect();
    vi.stubEnv("HALDUR_CONFIG_DIR", join(directory, "preview-two"));
    expect(readPiConfiguration()).toBeNull();
    expect(existsSync(authPath)).toBe(true);
  });
});
