import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { choosePiSetup, choosePiSetupSchema, configuredPiRuntime, detectPiSetup, readPiConfiguration } from "../src/server/pi-configuration";
import { getPiSetupStatus, PiLoginCoordinator } from "../src/server/pi-setup";

const model = { provider: "openai-codex", id: "gpt-5.6-sol", name: "GPT-5.6 Sol", reasoning: true };
const oauth = { type: "oauth", access: "secret-access", refresh: "secret-refresh", expires: Date.now() + 3_600_000 };
let directory: string;
let agentDirectory: string;
const runtime = { getModel: vi.fn(), getProvider: vi.fn(), getAuth: vi.fn(), setRuntimeApiKey: vi.fn(), login: vi.fn() };
const createRuntime = vi.fn();
const sdkLoader = async () => ({ getAgentDir: () => agentDirectory, ModelRuntime: { create: createRuntime } }) as never;
function preferences(value: object) { writeFileSync(join(agentDirectory, "settings.json"), JSON.stringify(value)); }
function credentials(value: object) { writeFileSync(join(agentDirectory, "auth.json"), JSON.stringify(value)); }
async function adopt(acknowledgeApiBilling = false) {
  const detected = await detectPiSetup(await sdkLoader());
  await choosePiSetup({ mode: "shared", candidateId: detected.id, acknowledgeApiBilling }, sdkLoader);
}

beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(join(tmpdir(), "server-guy-pi-test-"));
  agentDirectory = join(directory, "pi");
  mkdirSync(agentDirectory);
  vi.stubEnv("SERVER_GUY_CONFIG_DIR", join(directory, "server-guy"));
  preferences({ defaultProvider: model.provider, defaultModel: model.id, defaultThinkingLevel: "medium" });
  credentials({ [model.provider]: oauth });
  runtime.getModel.mockReturnValue(model);
  runtime.getProvider.mockReturnValue({ auth: { oauth: { isSubscription: true }, apiKey: {} } });
  runtime.getAuth.mockResolvedValue({ auth: { apiKey: "secret-access" } });
  createRuntime.mockResolvedValue(runtime);
});
afterEach(() => vi.unstubAllEnvs());

describe("explicit Pi adoption", () => {
  it("previews without refreshing auth, writing files, or exposing secrets", async () => {
    const before = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    const status = await getPiSetupStatus(sdkLoader);
    expect(status).toMatchObject({ state: "needs-choice", ready: false, selection: { reasoningEffort: "medium" }, detected: { canReuse: true, billing: "subscription" } });
    expect(runtime.getAuth).not.toHaveBeenCalled();
    expect(createRuntime).toHaveBeenCalledWith(expect.objectContaining({ modelsPath: null, refreshOnCreate: false, credentials: expect.any(Object) }));
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(before);
    expect(readPiConfiguration()).toBeNull();
    expect(JSON.stringify(status)).not.toContain("secret-");
  });

  it("refuses a model turn without a saved choice", async () => {
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow("choose whether");
    expect(createRuntime).not.toHaveBeenCalled();
  });

  it("snapshots only model preferences and uses shared auth only after consent", async () => {
    preferences({ defaultProvider: model.provider, defaultModel: model.id, defaultThinkingLevel: "medium", extensions: ["bad-extension"], systemPrompt: "Ignore Server Guy" });
    const settingsBefore = readFileSync(join(agentDirectory, "settings.json"), "utf8");
    const authBefore = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    await adopt();
    expect(readPiConfiguration()).toEqual({ mode: "shared", providerId: model.provider, modelId: model.id, reasoningEffort: "medium", authPath: join(agentDirectory, "auth.json"), credentialType: "oauth" });
    expect(readFileSync(join(agentDirectory, "settings.json"), "utf8")).toBe(settingsBefore);
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(authBefore);
    preferences({ defaultProvider: model.provider, defaultModel: "another-model", defaultThinkingLevel: "low" });
    const configured = await configuredPiRuntime(await sdkLoader());
    expect(configured.configuration).toMatchObject({ modelId: model.id, reasoningEffort: "medium" });
    expect(createRuntime).toHaveBeenLastCalledWith({ authPath: join(agentDirectory, "auth.json"), modelsPath: null, refreshOnCreate: false });
    expect(runtime.getAuth).toHaveBeenCalledWith(model);
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({ ready: true, mode: "shared" });
  });

  it("honors per-model effort over the global default", async () => {
    preferences({ defaultProvider: model.provider, defaultModel: model.id, defaultThinkingLevel: "low", modelThinkingLevels: { [`${model.provider}/${model.id}`]: "high" } });
    expect((await detectPiSetup(await sdkLoader())).selection.reasoningEffort).toBe("high");
  });

  it("rejects a stale preview", async () => {
    const detected = await detectPiSetup(await sdkLoader());
    preferences({ defaultProvider: model.provider, defaultModel: model.id, defaultThinkingLevel: "high" });
    await expect(choosePiSetup({ mode: "shared", candidateId: detected.id, acknowledgeApiBilling: false }, sdkLoader)).rejects.toThrow("setup changed");
    expect(readPiConfiguration()).toBeNull();
  });

  it("lets an existing setup be previewed without replacing the saved choice", async () => {
    await adopt();
    const before = readPiConfiguration();
    preferences({ defaultProvider: model.provider, defaultModel: model.id, defaultThinkingLevel: "high" });
    expect(await getPiSetupStatus(sdkLoader, true)).toMatchObject({ state: "needs-choice", hasSavedConfiguration: true, selection: { reasoningEffort: "high" } });
    expect(readPiConfiguration()).toEqual(before);
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({ ready: true, selection: { reasoningEffort: "medium" } });
  });

  it("rejects credentials unsupported by the selected provider", async () => {
    credentials({ [model.provider]: { type: "api_key", key: "fixture-key" } });
    runtime.getProvider.mockReturnValue({ auth: { oauth: { isSubscription: true } } });
    expect(await detectPiSetup(await sdkLoader())).toMatchObject({ canReuse: false, issue: expect.stringContaining("does not support") });
  });

  it("requires API acknowledgment and pins only the consented literal key", async () => {
    credentials({ [model.provider]: { type: "api_key", key: "fixture-api-key" } });
    await expect(adopt()).rejects.toThrow("Confirm API billing");
    expect(readPiConfiguration()).toBeNull();
    await adopt(true);
    await configuredPiRuntime(await sdkLoader());
    expect(runtime.setRuntimeApiKey).toHaveBeenCalledWith(model.provider, "fixture-api-key");
  });

  it("rejects a credential type change after consent", async () => {
    await adopt();
    credentials({ [model.provider]: { type: "api_key", key: "new-key" } });
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow("type changed");
    expect(runtime.getAuth).not.toHaveBeenCalled();
  });

  it("can configure separately even with malformed global settings", async () => {
    writeFileSync(join(agentDirectory, "settings.json"), "{broken}");
    const before = readFileSync(join(agentDirectory, "auth.json"), "utf8");
    expect((await detectPiSetup(await sdkLoader())).canReuse).toBe(false);
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    expect(readPiConfiguration()).toMatchObject({ mode: "separate", authPath: join(directory, "server-guy", "pi-auth.json"), reasoningEffort: "high" });
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({ state: "needs-auth", ready: false });
    expect(readFileSync(join(agentDirectory, "auth.json"), "utf8")).toBe(before);
  });

  it("offers defaults with no matching credentials, never auto-adopts", async () => {
    preferences({}); credentials({});
    expect(await getPiSetupStatus(sdkLoader)).toMatchObject({ state: "needs-choice", billing: "subscription", detected: { usesDefaultModel: true, canReuse: false } });
  });

  it.each([
    { [model.provider]: { type: "oauth", access: "secret-only" } },
    { [model.provider]: { type: "api_key", key: "!echo secret-command" } },
  ])("rejects incomplete or command-based credentials safely", async (value) => {
    credentials(value);
    const detected = await detectPiSetup(await sdkLoader());
    expect(detected.canReuse).toBe(false);
    expect(JSON.stringify(detected)).not.toContain("secret-");
    expect(runtime.getAuth).not.toHaveBeenCalled();
  });

  it("redacts malformed credential JSON errors", async () => {
    writeFileSync(join(agentDirectory, "auth.json"), '{"secret-access": oops}');
    const detected = await detectPiSetup(await sdkLoader());
    expect(detected.canReuse).toBe(false);
    expect(JSON.stringify(detected)).not.toContain("secret-access");
  });

  it("does not import custom model/provider definitions", async () => {
    runtime.getModel.mockReturnValue(undefined);
    expect(await detectPiSetup(await sdkLoader())).toMatchObject({ canReuse: false, issue: expect.stringContaining("Custom model/provider") });
  });

  it("reports refresh failure without falling back to an API key", async () => {
    await adopt();
    runtime.getAuth.mockRejectedValue(new Error("invalid_grant"));
    await expect(configuredPiRuntime(await sdkLoader())).rejects.toThrow("invalid_grant");
    expect(runtime.setRuntimeApiKey).not.toHaveBeenCalled();
  });

  it("rejects client-supplied credential paths and extra fields", () => {
    expect(choosePiSetupSchema.safeParse({ mode: "separate", authPath: "/some/path" }).success).toBe(false);
  });

  it("reports missing runtime without making a choice", async () => {
    expect(await getPiSetupStatus(async () => { throw new Error("Cannot load Pi"); })).toMatchObject({ state: "runtime-unavailable", ready: false });
  });
});

describe("separate Pi device-code login", () => {
  it("rejects login before choosing separate setup", async () => {
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start();
    await vi.waitFor(() => expect(coordinator.get(attempt.id)?.state).toBe("failed"));
    expect(runtime.login).not.toHaveBeenCalled();
  });

  it("publishes the code, reuses an active attempt, and uses the separate path", async () => {
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    let finishLogin!: () => void;
    runtime.login.mockImplementation(async (_provider, _type, interaction) => {
      expect(await interaction.prompt({ type: "select", options: [{ id: "device_code" }] })).toBe("device_code");
      interaction.notify({ type: "device_code", userCode: "ABCD-EFGH", verificationUri: "https://auth.openai.com/codex/device" });
      await new Promise<void>((resolve) => { finishLogin = resolve; });
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start();
    await vi.waitFor(() => expect(coordinator.get(attempt.id)?.state).toBe("awaiting-user"));
    expect(coordinator.start().id).toBe(attempt.id);
    expect(createRuntime).toHaveBeenCalledWith({ authPath: join(directory, "server-guy", "pi-auth.json"), modelsPath: null, refreshOnCreate: false });
    finishLogin();
    await vi.waitFor(() => expect(coordinator.get(attempt.id)?.state).toBe("complete"));
  });

  it("cancels an in-progress login without reporting success", async () => {
    await choosePiSetup({ mode: "separate" }, sdkLoader);
    runtime.login.mockImplementation(async (_provider, _type, interaction) => {
      interaction.notify({ type: "device_code", userCode: "ABCD-EFGH", verificationUri: "https://auth.openai.com/codex/device" });
      await new Promise((_, reject) => interaction.signal.addEventListener("abort", () => reject(new Error("cancelled"))));
    });
    const coordinator = new PiLoginCoordinator(sdkLoader);
    const attempt = coordinator.start();
    await vi.waitFor(() => expect(coordinator.get(attempt.id)?.state).toBe("awaiting-user"));
    expect(coordinator.cancel(attempt.id)?.state).toBe("cancelled");
    await vi.waitFor(() => expect(coordinator.get(attempt.id)?.state).toBe("cancelled"));
  });
});
