import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import { PI_MODEL_ID, PI_PROVIDER_ID, PI_REASONING_EFFORT } from "./pi-settings";

export type PiSdk = typeof import("@earendil-works/pi-coding-agent");
export type PiSdkLoader = () => Promise<PiSdk>;
export const loadPiSdk: PiSdkLoader = () => import("@earendil-works/pi-coding-agent");

const effortSchema = z.enum(["off", "minimal", "low", "medium", "high", "xhigh"]);
const selectionSchema = z.object({
  providerId: z.string().min(1).max(200),
  modelId: z.string().min(1).max(200),
  reasoningEffort: effortSchema,
});
const configurationSchema = selectionSchema.extend({
  mode: z.enum(["shared", "separate"]),
  authPath: z.string().min(1),
  credentialType: z.enum(["oauth", "api_key"]),
});
export type PiConfiguration = z.infer<typeof configurationSchema>;
export type PiSelection = z.infer<typeof selectionSchema>;

export const choosePiSetupSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("separate") }),
  z.strictObject({
    mode: z.literal("shared"),
    candidateId: z.string().length(64),
    acknowledgeApiBilling: z.boolean(),
  }),
]);

export function piConfigDir() {
  // Runtime-owned local state, never an input to the deployed code bundle.
  return resolve(/* turbopackIgnore: true */ process.env.SERVER_GUY_CONFIG_DIR ?? join(process.cwd(), ".server-guy"));
}

function readJsonFile(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    // JSON parser errors can contain credential fragments. Never expose them.
    throw new Error("The Pi configuration or credential file could not be read. Repair it or configure separately.");
  }
}

export function readPiConfiguration(): PiConfiguration | null {
  const value = readJsonFile(join(piConfigDir(), "pi-settings.json"));
  if (value === undefined) return null;
  const result = configurationSchema.safeParse(value);
  if (!result.success) throw new Error("Server Guy’s saved Pi configuration is invalid. Choose a setup again.");
  return result.data;
}

function savePiConfiguration(configuration: PiConfiguration) {
  const directory = piConfigDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = join(directory, `pi-settings-${randomUUID()}.tmp`);
  writeFileSync(temporary, JSON.stringify(configuration, null, 2), { mode: 0o600 });
  renameSync(temporary, join(directory, "pi-settings.json"));
}

const credentialSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("oauth"), access: z.string().min(1), refresh: z.string().min(1), expires: z.number().finite() }),
  z.object({ type: z.literal("api_key"), key: z.string().min(1) }),
]);

/** Inspect locally, without running key commands, resolving environment variables, or refreshing OAuth. */
export function readPiCredential(authPath: string, providerId: string) {
  const data = readJsonFile(authPath);
  if (data === undefined) return null;
  const entries = z.record(z.string(), z.unknown()).safeParse(data);
  if (!entries.success) throw new Error("Pi’s credential file is invalid. Repair it or configure separately.");
  const value = entries.data[providerId];
  if (value === undefined) return null;
  const credential = credentialSchema.safeParse(value);
  if (!credential.success) throw new Error("The selected Pi credential is incomplete or unsupported. Configure separately to connect ChatGPT.");
  if (credential.data.type === "api_key" && credential.data.key.trimStart().startsWith("!")) {
    throw new Error("Command-based Pi API keys are not adopted. Configure separately to connect ChatGPT.");
  }
  return credential.data;
}

const preferencesSchema = z.object({
  defaultProvider: z.string().min(1).optional(),
  defaultModel: z.string().min(1).optional(),
  defaultThinkingLevel: effortSchema.optional(),
  modelThinkingLevels: z.record(z.string(), effortSchema).optional(),
});

export const defaultPiSelection: PiSelection = {
  providerId: PI_PROVIDER_ID,
  modelId: PI_MODEL_ID,
  reasoningEffort: PI_REASONING_EFFORT,
};

export interface DetectedPiSetup {
  id: string;
  selection: PiSelection;
  settingsPath: string;
  authPath: string;
  credentialType: "oauth" | "api_key" | null;
  usesDefaultModel: boolean;
  billing: "subscription" | "api";
  canReuse: boolean;
  issue: string | null;
}

/** A catalog-only runtime: no file-backed credential store, machine model overrides, or network refresh. */
export function createPiCatalog(sdk: PiSdk) {
  return sdk.ModelRuntime.create({
    modelsPath: null,
    refreshOnCreate: false,
    credentials: {
      read: async () => undefined,
      list: async () => [],
      modify: async () => { throw new Error("Read-only catalog"); },
      delete: async () => { throw new Error("Read-only catalog"); },
    },
  });
}

export async function detectPiSetup(sdk: PiSdk): Promise<DetectedPiSetup> {
  const settingsPath = join(sdk.getAgentDir(), "settings.json");
  const authPath = join(sdk.getAgentDir(), "auth.json");
  let selection = defaultPiSelection;
  let usesDefaultModel = true;
  let credentialType: DetectedPiSetup["credentialType"] = null;
  let billing: DetectedPiSetup["billing"] = "subscription";
  let issue: string | null = null;
  try {
    const parsed = preferencesSchema.safeParse(readJsonFile(settingsPath) ?? {});
    if (!parsed.success) throw new Error("Pi’s saved model preferences are invalid. Repair them or configure separately.");
    const preferences = parsed.data;
    if (Boolean(preferences.defaultProvider) !== Boolean(preferences.defaultModel)) {
      throw new Error("Pi has an incomplete provider/model selection. Configure separately or fix its settings.");
    }
    usesDefaultModel = !preferences.defaultProvider;
    const providerId = preferences.defaultProvider ?? PI_PROVIDER_ID;
    const modelId = preferences.defaultModel ?? PI_MODEL_ID;
    selection = {
      providerId,
      modelId,
      reasoningEffort: preferences.modelThinkingLevels?.[`${providerId}/${modelId}`]
        ?? preferences.defaultThinkingLevel ?? PI_REASONING_EFFORT,
    };
    credentialType = readPiCredential(authPath, providerId)?.type ?? null;
    const catalog = await createPiCatalog(sdk);
    const model = catalog.getModel(providerId, modelId);
    const provider = catalog.getProvider(providerId);
    billing = credentialType !== "api_key" && provider?.auth.oauth?.isSubscription
      ? "subscription" : "api";
    if (!model) throw new Error("This model is not in the bundled Pi catalog. Custom model/provider definitions are not imported; configure separately.");
    if (!model.reasoning && selection.reasoningEffort !== "off") {
      throw new Error("This model does not support the saved reasoning effort. Set its Pi effort to off, or configure separately.");
    }
    if (!credentialType) throw new Error("No stored credential matches this provider. Configure separately to connect ChatGPT.");
    if (credentialType === "api_key" ? !provider?.auth.apiKey : !provider?.auth.oauth) {
      throw new Error("This provider does not support the stored credential type. Configure separately or repair Pi’s credentials.");
    }
  } catch (error) {
    issue = error instanceof Error ? error.message : "Existing Pi setup could not be inspected.";
  }
  const preview = { selection, settingsPath, authPath, credentialType, usesDefaultModel, billing, canReuse: !issue, issue };
  // Only non-secret metadata participates. A changed selection requires a fresh confirmation.
  return { ...preview, id: createHash("sha256").update(JSON.stringify(preview)).digest("hex") };
}

export async function choosePiSetup(input: z.infer<typeof choosePiSetupSchema>, sdkLoader = loadPiSdk) {
  if (input.mode === "separate") {
    savePiConfiguration({ ...defaultPiSelection, mode: "separate", credentialType: "oauth", authPath: join(piConfigDir(), "pi-auth.json") });
    return;
  }
  const detected = await detectPiSetup(await sdkLoader());
  if (detected.id !== input.candidateId) throw new Error("Pi’s setup changed. Refresh the preview and confirm it again.");
  if (!detected.canReuse || !detected.credentialType) throw new Error(detected.issue ?? "This Pi setup cannot be reused.");
  if (detected.billing === "api" && !input.acknowledgeApiBilling) throw new Error("Confirm API billing before using this setup.");
  savePiConfiguration({ ...detected.selection, mode: "shared", authPath: detected.authPath, credentialType: detected.credentialType });
}

/** Every turn must use an explicitly chosen configuration; never infer consent from credentials. */
export async function configuredPiRuntime(sdk: PiSdk) {
  const configuration = readPiConfiguration();
  if (!configuration) throw new Error("Open Pi setup and choose whether to reuse Pi or configure separately.");
  const credential = readPiCredential(configuration.authPath, configuration.providerId);
  if (!credential || credential.type !== configuration.credentialType) {
    throw new Error("The chosen Pi credential is missing or its type changed. Open Pi setup and choose a setup again.");
  }
  const modelRuntime = await sdk.ModelRuntime.create({ authPath: configuration.authPath, modelsPath: null, refreshOnCreate: false });
  const model = modelRuntime.getModel(configuration.providerId, configuration.modelId);
  if (!model) throw new Error("The chosen model is unavailable. Open Pi setup and choose a setup again.");
  // Pin a consented literal API key to this runtime; never fall back to an environment key.
  if (credential.type === "api_key") await modelRuntime.setRuntimeApiKey(configuration.providerId, credential.key);
  if (!(await modelRuntime.getAuth(model))) throw new Error("Provider is not configured");
  return { configuration, modelRuntime, model };
}
